import { AwsClient } from "aws4fetch";
import { renditionKey } from "./images";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/**
 * The stored extension for a content type, or undefined for anything not
 * allowed. Exported because the upload has to be reserved in the ledger — which
 * records the extension so the object stays addressable for deletion — before
 * any bytes are sent.
 */
export function extensionFor(contentType: string): string | undefined {
  return ALLOWED.get(contentType);
}

const MAX_BYTES = 5 * 1024 * 1024;

export type UploadFolder = "covers" | "avatars" | "comments";

/**
 * Uploads raw image bytes to the project's R2 bucket and returns the public URL.
 * Validates content type and size server-side.
 *
 * `id` and `width` let a set of renditions of the same picture land on sibling
 * keys, which is how the srcset in the markup is derived without storing the
 * variant list anywhere.
 */
export async function uploadToR2(params: {
  folder: UploadFolder;
  contentType: string;
  bytes: Uint8Array;
  id?: string | undefined;
  width?: number | undefined;
}): Promise<string> {
  const ext = ALLOWED.get(params.contentType);
  if (!ext) throw new Error("Only JPEG, PNG or WebP images are allowed.");
  if (params.bytes.byteLength === 0) throw new Error("The file is empty.");
  if (params.bytes.byteLength > MAX_BYTES) throw new Error("Images must be 5 MB or smaller.");

  // Resolved before the PUT, not after: an unconfigured public base is a
  // configuration error, and discovering it on the way out would leave bytes
  // in the bucket that nothing has a URL for.
  const base = publicBaseUrl();
  const key = renditionKey(params.folder, params.id ?? crypto.randomUUID(), ext, params.width);
  const { client, endpoint } = bucketClient();

  const res = await client.fetch(endpoint(key), {
    method: "PUT",
    body: params.bytes as unknown as BodyInit,
    headers: {
      "content-type": params.contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });

  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}).`);
  }

  return `${base}/${key}`;
}

/**
 * Deletes every rendition of one upload from the bucket.
 *
 * This is the half of the story that was missing while images were only ever
 * covers and avatars, both of which are replaced rather than withdrawn. An
 * attachment on a take has to be able to *go away*: a hidden take whose picture
 * is still fetchable at an immutable-cached URL has not been moderated, and
 * bytes with no delete path cannot be erased on request either.
 *
 * `widths` names the rendition ladder written for this id, so the siblings go
 * with it; an empty ladder means a single unsized object. A 404 counts as
 * success — the caller's job is to make the object not exist, and an upload
 * that died between reserving its id and writing its bytes leaves a ledger row
 * pointing at nothing. Anything else throws, which leaves the ledger row in
 * `purging` for the next sweep rather than dropping it while the bytes are
 * still there.
 */
export async function deleteFromR2(params: {
  folder: UploadFolder;
  id: string;
  ext: string;
  widths?: readonly number[] | undefined;
}): Promise<void> {
  const { client, endpoint } = bucketClient();
  const ladder = params.widths?.length ? params.widths : [undefined];

  for (const width of ladder) {
    const key = renditionKey(params.folder, params.id, params.ext, width);
    const res = await client.fetch(endpoint(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Could not delete ${key} (${res.status}).`);
    }
  }
}

/** The configured public base, with any trailing slashes trimmed. */
function publicBaseUrl(): string {
  const publicBase = process.env["R2_PUBLIC_BASE_URL"];
  if (!publicBase) {
    throw new Error("The public image URL for the storage bucket is not configured yet.");
  }
  return publicBase.replace(/\/+$/, "");
}

/**
 * A signed client for the bucket plus the endpoint builder for one object key.
 * Shared so the upload and delete paths cannot drift apart on which bucket
 * they are talking to.
 */
function bucketClient() {
  const accountId = process.env["R2_ACCOUNT_ID"];
  const bucket = process.env["R2_BUCKET"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Image storage is not configured yet.");
  }

  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    endpoint: (key: string) => `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`,
  };
}
