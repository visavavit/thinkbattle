import { AuthorAvatar, type Author } from "./AuthorAvatar";
import { DeadlineLine } from "./TopicDeadline";
import { SplitBar } from "./SplitBar";
import { ShareRow } from "./ShareRow";
import { useT } from "@/lib/i18n";
import { canonical } from "@/lib/site";
import type { TopicClock } from "@/lib/topic-clock";

type Side = "a" | "b";

/** The minimal shape of a top-level take, for the quoted preview. */
export type TopTake = {
  id: string;
  body: string;
  user_id: string;
};

/**
 * Replaces the vote panel once a topic closes: a verdict, the final split, the
 * margin in both points and votes, the total, the closed date, the best case
 * from each side, and a share row. The two comment columns stay below this as
 * the read-only archive — this panel is the ending the closed debate did not
 * otherwise get.
 *
 * Deliberately does not fetch anything of its own: every prop here comes from
 * data `Discussion` already holds (the tallies it polls, and `pinsQuery`,
 * which was already resolving ranked takes and their authors for the pinned
 * rows at the top of each column).
 */
export function ResultPanel({
  topicId,
  choiceA,
  choiceB,
  votesA,
  votesB,
  myVote,
  clock,
  topTakeA,
  topTakeB,
  authors,
}: {
  topicId: string;
  choiceA: string;
  choiceB: string;
  votesA: number;
  votesB: number;
  myVote: Side | null;
  clock: TopicClock;
  topTakeA: TopTake | undefined;
  topTakeB: TopTake | undefined;
  authors: Map<string, Author>;
}) {
  const t = useT();
  const total = votesA + votesB;
  const pctA = total === 0 ? 50 : Math.round((100 * votesA) / total);
  const pctB = 100 - pctA;

  const verdict =
    total === 0
      ? t("result.verdictNoVotes")
      : votesA === votesB
        ? t("result.verdictTie")
        : t("result.verdictWin", { label: votesA > votesB ? choiceA : choiceB });

  // Points and votes both, deliberately: points alone reads thin on a 51/49
  // split, and votes alone reads thin on a small topic.
  const marginPoints = Math.abs(pctA - pctB);
  const marginVotes = Math.abs(votesA - votesB);

  const url = canonical(`/topic/${topicId}`);
  const shareText =
    total === 0
      ? t("meta.topic.resultDescriptionEmpty", { a: choiceA, b: choiceB })
      : t("result.shareText", {
          title: verdict,
          a: choiceA,
          aPct: pctA,
          b: choiceB,
          bPct: pctB,
          n: total,
        });

  return (
    <section className="arena-panel space-y-5 p-5">
      <div className="space-y-1 text-center">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {t("closing.final")}
        </p>
        <h2 className="text-2xl font-bold sm:text-3xl">{verdict}</h2>
        {total > 0 && votesA !== votesB ? (
          <p className="text-sm text-muted-foreground">
            {t("result.margin", { points: marginPoints })} ·{" "}
            {t(marginVotes === 1 ? "result.marginVotes" : "result.marginVotesMany", {
              n: marginVotes.toLocaleString(),
            })}
          </p>
        ) : null}
      </div>

      <SplitBar
        pctA={pctA}
        countA={votesA}
        countB={votesB}
        labelA={choiceA}
        labelB={choiceB}
        myVote={myVote}
        size="lg"
      />

      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted-foreground">
        <span>{t("result.totalVotes", { n: total.toLocaleString() })}</span>
        <DeadlineLine clock={clock} />
      </p>

      {total > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TopTakeCard
            label={t("result.topTakeA", { label: choiceA })}
            take={topTakeA}
            author={topTakeA ? authors.get(topTakeA.user_id) : undefined}
            noTakes={t("result.noTakes")}
            anonymous={t("comment.anonymous")}
          />
          <TopTakeCard
            label={t("result.topTakeB", { label: choiceB })}
            take={topTakeB}
            author={topTakeB ? authors.get(topTakeB.user_id) : undefined}
            noTakes={t("result.noTakes")}
            anonymous={t("comment.anonymous")}
          />
        </div>
      ) : null}

      <div className="border-t border-border pt-4">
        <ShareRow url={url} text={shareText} />
      </div>
    </section>
  );
}

function TopTakeCard({
  label,
  take,
  author,
  noTakes,
  anonymous,
}: {
  label: string;
  take: TopTake | undefined;
  author: Author | undefined;
  noTakes: string;
  anonymous: string;
}) {
  return (
    <div className="rounded-sm border border-border p-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      {take ? (
        <>
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
            {take.body}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <AuthorAvatar author={author} className="h-4 w-4" />
            <span className="font-medium">{author?.username ?? anonymous}</span>
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">{noTakes}</p>
      )}
    </div>
  );
}
