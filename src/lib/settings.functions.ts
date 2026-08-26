import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Site-wide switches an admin can flip.
 *
 * app_settings is granted only to service_role and has RLS enabled with no
 * policies — it holds bot_tick_secret — so writes cannot go through the
 * browser's client the way the rest of the admin panel does. This is the same
 * shape as createBotCampaign: authenticate, check the role against the
 * database rather than the UI, then act on the service-role client.
 */
export const setGuestVotingEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_app_setting", {
      _key: "guest_voting_enabled",
      _value: data.enabled ? "on" : "off",
    });
    if (error) throw new Error(error.message);
    return { enabled: data.enabled };
  });

/**
 * The stored value, read straight through rather than from the cached public
 * flag: an admin toggling the switch has to see what they just set, not what
 * the feed cache is still serving for the next half minute.
 */
export const readGuestVotingEnabled = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("guest_voting_enabled");
    if (error) throw new Error(error.message);
    return { enabled: data === true };
  });

/**
 * Attachments on takes. Off unless an admin has said otherwise: this is the
 * switch that decides whether the site accepts user-supplied images at all,
 * and the moderation cost of that is not something a fresh environment should
 * take on by default.
 */
export const setCommentImagesEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_app_setting", {
      _key: "comment_images_enabled",
      _value: data.enabled ? "on" : "off",
    });
    if (error) throw new Error(error.message);
    return { enabled: data.enabled };
  });

/** The stored value, read past the public flag cache — see above. */
export const readCommentImagesEnabled = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("comment_images_enabled");
    if (error) throw new Error(error.message);
    return { enabled: data === true };
  });
