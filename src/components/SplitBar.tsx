import { Check } from "lucide-react";

type Props = {
  pctA: number;
  labelA: string;
  labelB: string;
  countA?: number;
  countB?: number;
  size?: "sm" | "lg";
  myVote?: "a" | "b" | null;
};

// Below this share a segment is too narrow to hold its own "NN%" without the
// text spilling over onto the other side's fill, so the figure moves down to
// the label row instead. Both sizes bottom out around 320px wide on a phone
// (cards in the feed grid, lg bars inside a max-w-6xl panel), so one floor
// covers every breakpoint; the segments also clip, so nothing can bleed even
// if a container ends up narrower still.
const MIN_PCT_FOR_INLINE_LABEL = 13;

export function SplitBar({
  pctA,
  labelA,
  labelB,
  countA,
  countB,
  size = "sm",
  myVote = null,
}: Props) {
  const a = Math.min(100, Math.max(0, Math.round(pctA)));
  const pctB = 100 - a;
  const tall = size === "lg";
  const countText = (n: number) => `${n.toLocaleString()} vote${n === 1 ? "" : "s"}`;

  // The feed view reports a 50/50 split for topics nobody has voted on, which
  // would otherwise render as a confident dead heat.
  const noVotes = countA === 0 && countB === 0;
  const inlineA = a >= MIN_PCT_FOR_INLINE_LABEL;
  const inlineB = pctB >= MIN_PCT_FOR_INLINE_LABEL;
  const pctClass = tall ? "text-sm font-semibold" : "text-xs font-semibold";
  const trackClass = `flex w-full overflow-hidden rounded-full bg-muted ${tall ? "h-9" : "h-5"}`;

  const side = (label: string, pct: number, count: number | undefined, voted: boolean) =>
    `${label}: ${pct}%${count === undefined ? "" : `, ${countText(count)}`}${
      voted ? ", your vote" : ""
    }`;
  const ariaLabel = noVotes
    ? `No votes yet. ${labelA} versus ${labelB}.`
    : `${side(labelA, a, countA, myVote === "a")}. ${side(labelB, pctB, countB, myVote === "b")}.`;

  return (
    <div className="w-full" role="img" aria-label={ariaLabel}>
      {noVotes ? (
        <div className={`${trackClass} items-center justify-center`}>
          <span className={`${tall ? "text-sm" : "text-xs"} font-medium text-muted-foreground`}>
            No votes yet
          </span>
        </div>
      ) : (
        <div className={trackClass}>
          {a > 0 ? (
            <div
              className="flex min-w-0 items-center justify-start overflow-hidden bg-side-a pl-2.5 text-side-a-foreground transition-all duration-500"
              style={{ flex: `0 1 ${a}%` }}
            >
              {inlineA ? <span className={pctClass}>{a}%</span> : null}
            </div>
          ) : null}
          {pctB > 0 ? (
            <div
              className="flex min-w-0 items-center justify-end overflow-hidden bg-side-b pr-2.5 text-side-b-foreground transition-all duration-500"
              style={{ flex: `0 1 ${pctB}%` }}
            >
              {inlineB ? <span className={pctClass}>{pctB}%</span> : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-1 flex justify-between gap-2 text-xs font-medium">
        <span className="flex min-w-0 items-center gap-1.5 text-side-a">
          {myVote === "a" ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
          <span className="truncate">{labelA}</span>
          {!noVotes && !inlineA && a > 0 ? (
            <span className="shrink-0 font-semibold">{a}%</span>
          ) : null}
          {countA !== undefined && !noVotes ? (
            <span className="shrink-0 font-normal text-muted-foreground">
              · {countText(countA)}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center justify-end gap-1.5 text-side-b">
          {countB !== undefined && !noVotes ? (
            <span className="shrink-0 font-normal text-muted-foreground">
              {countText(countB)} ·
            </span>
          ) : null}
          {!noVotes && !inlineB && pctB > 0 ? (
            <span className="shrink-0 font-semibold">{pctB}%</span>
          ) : null}
          <span className="truncate">{labelB}</span>
          {myVote === "b" ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
        </span>
      </div>
    </div>
  );
}
