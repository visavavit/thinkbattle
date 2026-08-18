import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/uploads.functions";
import { COVER_WIDTHS } from "@/lib/images";

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

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.82));
}

/**
 * Scales a cover down to each width in the ladder that the source can actually
 * fill, so the browser is never handed an upscaled rendition. Returns a single
 * unsized rendition when the picture is too small for even the narrowest step,
 * or when the browser cannot decode it here — the upload still succeeds, it
 * just gets one size and no srcset.
 */
async function buildCoverRenditions(file: File): Promise<Rendition[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return [{ data: await toBase64(file) }];
  }

  try {
    const widths = COVER_WIDTHS.filter((w) => w <= bitmap.width);
    if (widths.length === 0) return [{ data: await toBase64(file) }];

    const renditions: Rendition[] = [];
    for (const width of widths) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round((width / bitmap.width) * bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return [{ data: await toBase64(file) }];
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToBlob(canvas, file.type);
      if (!blob) return [{ data: await toBase64(file) }];
      renditions.push({ width, data: await toBase64(blob) });
    }
    return renditions;
  } finally {
    bitmap.close();
  }
}

/**
 * Picks an image, uploads it to the project's image storage and hands back the public URL.
 */
export function ImageUploadButton({
  folder,
  onUploaded,
  label = "Upload image",
}: {
  folder: "covers" | "avatars";
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = useServerFn(uploadImage);

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Images must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      // Avatars render tiny and never need a ladder; covers are the heavy ones.
      const renditions =
        folder === "covers" ? await buildCoverRenditions(file) : [{ data: await toBase64(file) }];
      const res = await upload({
        data: { folder, contentType: file.type, renditions },
      });
      onUploaded(res.url);
      toast.success("Image uploaded");
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
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {busy ? "Uploading…" : label}
      </Button>
    </>
  );
}
