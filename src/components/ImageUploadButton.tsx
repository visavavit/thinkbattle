import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/uploads.functions";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
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
      const base64 = await toBase64(file);
      const res = await upload({
        data: { folder, contentType: file.type, data: base64 },
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
