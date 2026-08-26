import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GuestVoteResult = {
  choice: "a" | "b";
  /** the side this device had before, when it had one */
  previous: "a" | "b" | null;
  votesA: number;
  votesB: number;
};

/**
 * Cast or change an anonymous vote.
 *
 * POST, deliberately and load-bearingly. A POST is never cached by anything,
 * and /_serverFn is already excluded from the document cache in server.ts —
 * so this is the one place the guest cookie is read or written. Doing it
 * anywhere in the SSR path would make a per-device response shareable, and
 * server.ts only guards against Set-Cookie on the way out, not against a
 * response that varies by a cookie on the way in.
 *
 * The database is the authority on everything that matters here: whether the
 * feature is on, whether the topic is still open, whether this device has
 * voted before, and what the tally is afterwards. The client is told the
 * result rather than asked to work it out.
 */
export const castGuestVote = createServerFn({ method: "POST" })
  .inputValidator((input: { topicId: string; choice: "a" | "b" }) => input)
  .handler(async ({ data }): Promise<GuestVoteResult> => {
    const { requireGuestId, requestIpHash } = await import("@/lib/guest.server");

    const guestId = await requireGuestId();
    // No secret configured means the feature cannot be operated safely, and
    // failing closed is the only honest option — an unsigned id would let one
    // client claim any number of devices.
    if (!guestId) throw new Error("Guest voting is turned off.");

    const ipHash = await requestIpHash();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("cast_guest_vote", {
      _guest_id: guestId,
      _topic_id: data.topicId,
      _choice: data.choice,
      // Null is meaningful here (skip rate limiting); the generated arg type
      // does not model the SQL default, so widen it rather than send "".
      _ip_hash: ipHash as string,
    });
    if (error) throw new Error(error.message);

    const row = (rows as unknown as GuestVoteRow[] | null)?.[0];
    if (!row) throw new Error("Vote failed. Try again.");

    return {
      choice: row.new_choice,
      previous: row.old_choice ?? null,
      votesA: row.tally_a,
      votesB: row.tally_b,
    };
  });

type GuestVoteRow = {
  new_choice: "a" | "b";
  old_choice: "a" | "b" | null;
  tally_a: number;
  tally_b: number;
};

/**
 * Hand this device's votes to the account that just signed in.
 *
 * Returns the topics that moved, so the client can drop them from its local
 * mirror — from here on the account's own vote is what the page reads.
 *
 * Topics that have already closed are skipped rather than forced: the closed
 * guard holds on every write path including service_role, and that invariant
 * is worth more than re-attributing a vote on a finished debate. The vote
 * still counts in the final tally either way.
 */
export const claimGuestVotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ claimed: string[] }> => {
    const { currentGuestId, clearGuestCookie } = await import("@/lib/guest.server");

    const guestId = await currentGuestId();
    if (!guestId) return { claimed: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Read the topics first: after the merge these rows no longer carry the
    // guest id, so there would be nothing left to report back.
    const { data: owned } = await supabaseAdmin
      .from("votes")
      .select("topic_id")
      .eq("guest_id", guestId);
    const topicIds = (owned ?? []).map((row) => row.topic_id as string);

    const { error } = await supabaseAdmin.rpc("claim_guest_votes", {
      _guest_id: guestId,
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);

    // Retire the cookie either way. A signed-in device holding a live guest
    // identity could otherwise vote a second time on a topic it has not
    // touched yet — once as itself, once as the account.
    clearGuestCookie();
    return { claimed: topicIds };
  });
