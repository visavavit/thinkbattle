import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Rendition = {
  /** pixel width of this rendition, or omitted for a single unsized upload */
  width?: number;
  /** base64-encoded file bytes (no data: prefix) */
  data: string;
};

type UploadInput = {
  folder: "covers" | "avatars";
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

export const uploadImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UploadInput) => {
    if (input.folder !== "covers" && input.folder !== "avatars") {
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
    if (data.folder === "covers") {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Only curators can upload cover images.");
    }

    const { uploadToR2 } = await import("./r2.server");

    // One id for the whole set so the renditions are siblings and the srcset
    // can be derived from the stored URL alone.
    const id = crypto.randomUUID();
    const ordered = [...data.renditions].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));

    const urls: string[] = [];
    for (const rendition of ordered) {
      urls.push(
        await uploadToR2({
          folder: data.folder,
          contentType: data.contentType,
          bytes: decodeBase64(rendition.data),
          id,
          width: rendition.width,
        }),
      );
    }

    // widest last — that is the one recorded on the topic
    return { url: urls[urls.length - 1]! };
  });
