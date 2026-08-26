import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/uploads.functions";
import { COMMENT_WIDTHS, COVER_WIDTHS } from "@/lib/images";
import type { UploadFolder } from "@/lib/uploads.functions";

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

type Rendition = { width?: number; data: string };
/** `width`/`height` describe the widest rendition, or null when the browser
 *  could not decode the picture and the original bytes are being sent as-is. */
type Prepared = {
  contentType: string;
  renditions: Rendition[];
  width: number | null;
  height: number | null;
};

/** What a successful upload hands back to the caller. */
export type UploadedImage = { url: string; width: number | null; height: number | null };

/** Avatars never render larger than a small circle, so one modest size is plenty. */
const AVATAR_WIDTH = 256;

/** Mirrors the ceiling r2.server.ts enforces, so the refusal is instant. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.82));
}

/**
 * Re-encodes to WebP when the browser can actually produce it — typically 25-35%
 * smaller than the equivalent JPEG at the same visual quality. Falls back to the
 * source type so an upload never fails just because encoding is unavailable.
 */
async function encode(canvas: HTMLCanvasElement, fallbackType: string) {
  const webp = await canvasToBlob(canvas, "image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, contentType: "image/webp" };
  const original = await canvasToBlob(canvas, fallbackType);
  return original ? { blob: original, contentType: fallbackType } : null;
}

function drawTo(bitmap: ImageBitmap, width: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((width / bitmap.width) * bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Scales an upload down to each width it can actually fill, so the browser is
 * never handed an upscaled rendition.
 *
 * Re-encoding through a canvas is also what strips EXIF, which matters more for
 * an attachment than for the other two folders. A phone photo carries the
 * coordinates it was taken at, and on a debate about a protest, a workplace or
 * a neighbourhood that is a location leak dressed up as evidence. So for
 * `comments` a browser that cannot decode the file is a refusal, not a fallback
 * to the untouched original: an avatar shrugging off a failed re-encode costs a
 * slightly larger circle, an attachment doing it publishes GPS.
 */
async function prepare(file: File, folder: UploadFolder): Promise<Prepared> {
  const asIs = async (): Promise<Prepared> => {
    if (folder === "comments") {
      throw new Error("That image could not be processed. Try a JPEG, PNG or WebP.");
    }
    return {
      contentType: file.type,
      renditions: [{ data: await toBase64(file) }],
      width: null,
      height: null,
    };
  };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return asIs();
  }

  try {
    const ladder = ladderFor(folder, bitmap.width);
    if (ladder.length === 0) return asIs();

    const renditions: Rendition[] = [];
    let contentType = file.type;
    let widest: HTMLCanvasElement | null = null;
    for (const width of ladder) {
      // An undefined rung means "at its own size, stored unsized".
      const canvas = drawTo(bitmap, width ?? bitmap.width);
      if (!canvas) return asIs();
      const encoded = await encode(canvas, file.type);
      if (!encoded) return asIs();
      contentType = encoded.contentType;
      widest = canvas;
      // avatars are always stored as a single unsized file — no srcset is needed
      renditions.push(
        folder === "avatars" || width === undefined
          ? { data: await toBase64(encoded.blob) }
          : { width, data: await toBase64(encoded.blob) },
      );
    }
    return {
      contentType,
      renditions,
      width: widest?.width ?? null,
      height: widest?.height ?? null,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * The renditions to store for one folder, given the source width.
 *
 * Nothing is ever upscaled, and a stored width is always a rung of the ladder —
 * never the source's own width. That second rule is what keeps the srcset
 * derivable from the URL alone: `attachmentSrcSet` reads the `-w<n>` suffix and
 * rebuilds its siblings from the ladder, so a key naming a width that is not on
 * the ladder would start pointing at files that were never written the moment a
 * rung is added. A picture narrower than the first rung is therefore stored
 * unsized, with no suffix at all, and rendered from a plain `src`.
 */
function ladderFor(folder: UploadFolder, sourceWidth: number): (number | undefined)[] {
  if (folder === "covers") return COVER_WIDTHS.filter((w) => w <= sourceWidth);
  if (folder === "avatars") return [Math.min(AVATAR_WIDTH, sourceWidth)];
  const rungs = COMMENT_WIDTHS.filter((w) => w <= sourceWidth);
  return rungs.length > 0 ? [...rungs] : [undefined];
}

/**
 * Picks an image, uploads it to the project's image storage and hands back the
 * public URL along with the stored dimensions.
 *
 * The dimensions are why `onUploaded` takes a second argument: a take's
 * attachment lands in a keyset-paged column, and without an intrinsic aspect
 * ratio in the markup every picture shoves the rows under it down as it
 * decodes. Callers that only need the URL — covers, avatars — can keep ignoring
 * it.
 */
export function ImageUploadButton({
  folder,
  onUploaded,
  label = "Upload image",
  variant = "default",
  strings,
}: {
  folder: UploadFolder;
  onUploaded: (url: string, meta: { width: number | null; height: number | null }) => void;
  label?: string;
  /** "inline" is the quieter one that sits inside a composer next to Post */
  variant?: "default" | "inline";
  /** Overrides for the button's own copy. The curator dashboard is
   *  English-only, but a composer on a public page is not. */
  strings?: { busy?: string; success?: string; tooLarge?: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = useServerFn(uploadImage);

  async function handleFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(strings?.tooLarge ?? "Images must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      // Covers get the full width ladder; avatars and small attachments get one
      // re-encoded file.
      const { contentType, renditions, width, height } = await prepare(file, folder);
      const res = await upload({
        data: { folder, contentType, renditions },
      });
      onUploaded(res.url, { width, height });
      toast.success(strings?.success ?? "Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button
        type="button"
        variant={variant === "inline" ? "ghost" : "outline"}
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : variant === "inline" ? (
          <ImagePlus className="mr-2 h-4 w-4" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {busy ? (strings?.busy ?? "Uploading…") : label}
      </Button>
    </>
  );
}
