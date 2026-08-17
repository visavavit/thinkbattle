type Props = {
  pctA: number;
  labelA: string;
  labelB: string;
  size?: "sm" | "lg";
};

export function SplitBar({ pctA, labelA, labelB, size = "sm" }: Props) {
  const pctB = 100 - pctA;
  const tall = size === "lg";

  return (
    <div className="w-full">
      <div
        className={`flex w-full overflow-hidden rounded-full ${tall ? "h-7" : "h-5"}`}
      >
        <div
          className="flex items-center justify-start bg-side-a pl-2.5 text-side-a-foreground transition-all duration-500"
          style={{ width: `${Math.max(pctA, 8)}%` }}
        >
          <span className={tall ? "text-sm font-semibold" : "text-xs font-semibold"}>{pctA}%</span>
        </div>
        <div
          className="flex items-center justify-end bg-side-b pr-2.5 text-side-b-foreground transition-all duration-500"
          style={{ width: `${Math.max(pctB, 8)}%` }}
        >
          <span className={tall ? "text-sm font-semibold" : "text-xs font-semibold"}>{pctB}%</span>
        </div>
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs font-medium">
        <span className="truncate text-side-a">{labelA}</span>
        <span className="truncate text-side-b">{labelB}</span>
      </div>
    </div>
  );
}
