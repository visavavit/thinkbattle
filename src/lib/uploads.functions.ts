import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type UploadInput = {
  folder: "covers" | "avatars";
  contentType: string;
  /** base64-encoded file bytes (no data: prefix) */
  data: string;
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
    if (typeof input.data !== "string" || input.data.length === 0) {
      throw new Error("No file received.");
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
    const url = await uploadToR2({
      folder: data.folder,
      contentType: data.contentType,
      bytes: decodeBase64(data.data),
    });
    return { url };
  });
