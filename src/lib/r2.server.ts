import { AwsClient } from "aws4fetch";
import { renditionKey } from "./images";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const MAX_BYTES = 5 * 1024 * 1024;

export type UploadFolder = "covers" | "avatars";

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

  const accountId = process.env["R2_ACCOUNT_ID"];
  const bucket = process.env["R2_BUCKET"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const publicBase = process.env["R2_PUBLIC_BASE_URL"];

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Image storage is not configured yet.");
  }
  if (!publicBase) {
    throw new Error("The public image URL for the storage bucket is not configured yet.");
  }

  const key = renditionKey(params.folder, params.id ?? crypto.randomUUID(), ext, params.width);
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;

  const res = await client.fetch(endpoint, {
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

  return `${publicBase.replace(/\/+$/, "")}/${key}`;
}
