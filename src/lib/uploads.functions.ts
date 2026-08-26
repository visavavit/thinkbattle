import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Rendition = {
  /** pixel width of this rendition, or omitted for a single unsized upload */
  width?: number;
  /** base64-encoded file bytes (no data: prefix) */
  data: string;
};

export type UploadFolder = "covers" | "avatars" | "comments";

const FOLDERS: readonly UploadFolder[] = ["covers", "avatars", "comments"];

type UploadInput = {
  folder: UploadFolder;
  contentType: string;
  /** one entry per stored size, ascending; the widest becomes the stored URL */
  renditions: Rendition[];
};

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Stores one picture and returns the URL of its widest rendition.
 *
 * The shape here is reserve-then-write, not write-then-record. `begin_upload`
 * takes the id, applies every rule that could reject the upload — signed in,
 * not banned, curator for covers, switch on for attachments, inside the rate
 * limit — and writes a ledger row before a single byte reaches R2. Two things
 * fall out of that order:
 *
 *   * Nothing lands in the bucket that the database cannot name, attribute and
 *     later delete. An object with no ledger row is unreachable garbage, and
 *     until attachments existed that is exactly what an abandoned upload was.
 *   * A rejected upload costs no storage, and an *abandoned* one still costs
 *     its rate-limit slot. Charging only for completed uploads would make the
 *     cheapest abuse the one that never finishes.
 *
 * If the writes fail half way the row stays `pending` and the sweep collects
 * both the row and whatever bytes did land.
 */
export const uploadImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UploadInput) => {
    if (!FOLDERS.includes(input.folder)) {
      throw new Error("Unsupported upload target.");
    }
    if (!Array.isArray(input.renditions) || input.renditions.length === 0) {
      throw new Error("No file received.");
    }
    if (input.renditions.length > 4) {
      throw new Error("Too many image sizes in one upload.");
    }
    for (const rendition of input.renditions) {
      if (typeof rendition.data !== "string" || rendition.data.length === 0) {
        throw new Error("No file received.");
      }
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { uploadToR2, extensionFor } = await import("./r2.server");

    const ext = extensionFor(data.contentType);
    if (!ext) throw new Error("Only JPEG, PNG or WebP images are allowed.");

    // One id for the whole set so the renditions are siblings and the srcset
    // can be derived from the stored URL alone.
    const ordered = [...data.renditions].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
    const widths = ordered.flatMap((r) => (r.width ? [r.width] : []));

    const { data: id, error: beginError } = await context.supabase.rpc("begin_upload", {
      _folder: data.folder,
      _ext: ext,
      _widths: widths,
    });
    if (beginError) throw new Error(beginError.message);
    if (!id) throw new Error("Could not start the upload.");

    const urls: string[] = [];
    let bytes = 0;
    for (const rendition of ordered) {
      const decoded = decodeBase64(rendition.data);
      bytes += decoded.byteLength;
      urls.push(
        await uploadToR2({
          folder: data.folder,
          contentType: data.contentType,
          bytes: decoded,
          id,
          width: rendition.width,
        }),
      );
    }

    // widest last — that is the one recorded on the topic, profile or take
    const url = urls[urls.length - 1]!;

    const { error: finishError } = await context.supabase.rpc("finish_upload", {
      _id: id,
      _url: url,
      _bytes: bytes,
    });
    if (finishError) throw new Error(finishError.message);

    return { url };
  });

/** How many renditions one sweep deletes from R2 before handing back. */
const SWEEP_BATCH = 100;

/**
 * Deletes everything the ledger has marked for deletion.
 *
 * Called on the interactive paths — right after a moderator hides or deletes a
 * take, and after an author removes their own picture — so that "take it down"
 * means the bytes are gone in the same breath rather than at some later sweep.
 * The admin panel exposes it as a button too, for the cases no interactive path
 * covers: a topic deleted with its whole thread cascading under it, an upload
 * abandoned in a composer that was never submitted, a delete that failed while
 * R2 was having a bad afternoon.
 *
 * Claim-and-confirm, because R2 is outside the transaction: `take_orphaned_uploads`
 * flips rows to `purging` and hands them over, and only the ones actually
 * deleted are confirmed. Rows left behind come back on the next pass. That
 * asymmetry is the right one — a ledger row with no object is a no-op next
 * time, an object with no ledger row is unreachable forever.
 *
 * Anyone signed in may run it. There is nothing to leak: it takes no argument,
 * returns a count, and only ever deletes bytes the database has already
 * decided nothing points at.
 */
export const sweepOrphanUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteFromR2 } = await import("./r2.server");

    const { data: claimed, error } = await supabaseAdmin.rpc("take_orphaned_uploads", {
      _limit: SWEEP_BATCH,
    });
    if (error) throw new Error(error.message);

    const rows = claimed ?? [];
    if (rows.length === 0) return { purged: 0, failed: 0 };

    const purged: string[] = [];
    let failed = 0;
    for (const row of rows) {
      try {
        await deleteFromR2({
          folder: row.folder as "covers" | "avatars" | "comments",
          id: row.id,
          ext: row.ext,
          widths: row.widths ?? [],
        });
        purged.push(row.id);
      } catch {
        // Left in `purging`; reclaimed by the next sweep an hour from now.
        failed += 1;
      }
    }

    if (purged.length > 0) {
      const { error: markError } = await supabaseAdmin.rpc("mark_uploads_purged", {
        _ids: purged,
      });
      if (markError) throw new Error(markError.message);
    }

    return { purged: purged.length, failed };
  });

/** What the sweep would have to do right now — shown on the admin panel. */
export const countPendingPurges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("pending_upload_purges");
    if (error) throw new Error(error.message);
    return { pending: typeof data === "number" ? data : 0 };
  });
