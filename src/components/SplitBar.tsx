type Props = {
  pctA: number;
  labelA: string;
  labelB: string;
  countA?: number;
  countB?: number;
  size?: "sm" | "lg";
};


export function SplitBar({ pctA, labelA, labelB, size = "sm" }: Props) {
  const a = Math.min(100, Math.max(0, Math.round(pctA)));
  const pctB = 100 - a;
  const tall = size === "lg";

  return (
    <div className="w-full">
      <div
        className={`flex w-full overflow-hidden rounded-full bg-muted ${tall ? "h-7" : "h-5"}`}
      >
        {a > 0 ? (
          <div
            className="flex min-w-0 items-center justify-start bg-side-a pl-2.5 text-side-a-foreground transition-all duration-500"
            style={{ flex: `0 1 ${a}%` }}
          >
            <span className={tall ? "text-sm font-semibold" : "text-xs font-semibold"}>{a}%</span>
          </div>
        ) : null}
        {pctB > 0 ? (
          <div
            className="flex min-w-0 items-center justify-end bg-side-b pr-2.5 text-side-b-foreground transition-all duration-500"
            style={{ flex: `0 1 ${pctB}%` }}
          >
            <span className={tall ? "text-sm font-semibold" : "text-xs font-semibold"}>
              {pctB}%
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex justify-between gap-2 text-xs font-medium">
        <span className="truncate text-side-a">{labelA}</span>
        <span className="truncate text-side-b">{labelB}</span>
      </div>
    </div>
  );
}
