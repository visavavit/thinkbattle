type Props = {
  pctA: number;
  labelA: string;
  labelB: string;
  countA?: number;
  countB?: number;
  size?: "sm" | "lg";
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
}: Props) {
  const a = Math.min(100, Math.max(0, Math.round(pctA)));
  const pctB = 100 - a;
  const tall = size === "lg";
  const countText = (n: number | undefined) =>
    n === undefined ? null : `${n.toLocaleString()} vote${n === 1 ? "" : "s"}`;

  const inlineA = a >= MIN_PCT_FOR_INLINE_LABEL;
  const inlineB = pctB >= MIN_PCT_FOR_INLINE_LABEL;
  const pctClass = tall ? "text-sm font-semibold" : "text-xs font-semibold";

  return (
    <div className="w-full">
      <div
        className={`flex w-full overflow-hidden rounded-full bg-muted ${tall ? "h-9" : "h-5"}`}
      >
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

      <div className="mt-1 flex justify-between gap-2 text-xs font-medium">
        <span className="truncate text-side-a">
          {labelA}
          {!inlineA && a > 0 ? <span className="ml-1.5 font-semibold">{a}%</span> : null}
          {countA !== undefined ? (
            <span className="ml-1.5 font-normal text-muted-foreground">· {countText(countA)}</span>
          ) : null}
        </span>
        <span className="truncate text-side-b">
          {countB !== undefined ? (
            <span className="mr-1.5 font-normal text-muted-foreground">{countText(countB)} ·</span>
          ) : null}
          {!inlineB && pctB > 0 ? <span className="mr-1.5 font-semibold">{pctB}%</span> : null}
          {labelB}
        </span>
      </div>
    </div>
  );
}
