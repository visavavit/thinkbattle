import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Deletes the signed-in user's login while keeping their past takes readable.
 * The profile row stays behind (renamed, avatar cleared) so threads don't turn
 * into a wall of blanks — comments and votes reference it by id.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (adminRole) throw new Error("ADMIN_CANNOT_SELF_DELETE");

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ username: `ผู้ใช้ที่ถูกลบ#${userId.slice(0, 6)}`, avatar_url: null })
      .eq("id", userId);
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("notifications").delete().eq("user_id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true } as const;
  });
