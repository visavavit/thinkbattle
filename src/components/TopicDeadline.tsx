import { useCallback } from "react";
import { Hourglass, Lock } from "lucide-react";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { countdown, useTopicClock, type TopicClock } from "@/lib/topic-clock";

const UNIT_KEY: Record<"days" | "hours" | "minutes" | "seconds", TranslationKey> = {
  days: "time.days",
  hours: "time.hours",
  minutes: "time.minutes",
  seconds: "time.seconds",
};

/** "3 days", "20 minutes" — the single largest unit still worth reading. */
function useRemaining() {
  const { t } = useI18n();
  return useCallback(
    (msLeft: number | null) => {
      const left = countdown(msLeft);
      if (!left || left.unit === "over") return null;
      return t(UNIT_KEY[left.unit], { n: left.n });
    },
    [t],
  );
}

/**
 * The deadline as an absolute date. Only ever rendered once the clock says it
 * is mounted: this is local to the reader's time zone, which the server does
 * not know.
 */
function useDeadlineDate() {
  const { lang } = useI18n();
  return useCallback(
    (date: Date) =>
      new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date),
    [lang],
  );
}

/**
 * Pill for a topic card. A closed debate says so outright; one inside the
 * countdown window shows how long is left. A debate with no deadline, or one
 * whose deadline is still far off, shows nothing — the badge is a warning, not
 * a decoration.
 */
export function ClosingBadge({ closesAt }: { closesAt: string | null }) {
  const { t } = useI18n();
  const clock = useTopicClock(closesAt);
  const remaining = useRemaining();

  if (clock.isClosed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
        {t("closing.closed")}
      </span>
    );
  }

  // the countdown text is clock-dependent, so it waits for the browser
  if (!clock.isClosingSoon || !clock.mounted) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/60 px-2 py-0.5 text-xs font-medium text-primary">
      <Hourglass className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t("closing.closesIn", { time: remaining(clock.msLeft) ?? "" })}
    </span>
  );
}

/**
 * The banner above the split on a topic page: the debate is over and the
 * numbers below are the final word, or it is about to be.
 */
export function ClosingNotice({ clock }: { clock: TopicClock }) {
  const { t } = useI18n();
  const remaining = useRemaining();
  const formatDate = useDeadlineDate();

  if (clock.isClosed) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-start gap-3 rounded-md border border-border bg-muted/60 p-4"
      >
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold">{t("closing.bannerTitle")}</p>
          <p className="mt-1 text-muted-foreground">
            {clock.mounted && clock.closesAt
              ? t("closing.bannerBody", { date: formatDate(clock.closesAt) })
              : t("closing.soonBody")}
          </p>
        </div>
      </div>
    );
  }

  if (!clock.isClosingSoon || !clock.mounted) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-md border border-primary/40 bg-primary/5 p-4"
    >
      <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold text-primary">
          {t("closing.soonTitle", { time: remaining(clock.msLeft) ?? "" })}
        </p>
        <p className="mt-1 text-muted-foreground">{t("closing.soonBody")}</p>
      </div>
    </div>
  );
}

/**
 * One line of plain text for the deadline, under the tallies. Shown whenever a
 * topic has one at all, so a reader can see the date without waiting for the
 * countdown window to open.
 */
export function DeadlineLine({ clock }: { clock: TopicClock }) {
  const { t } = useI18n();
  const formatDate = useDeadlineDate();

  if (!clock.closesAt || !clock.mounted) return null;
  const key: TranslationKey = clock.isClosed ? "closing.closedOn" : "closing.closesOn";
  return (
    <span className="inline-flex items-center gap-1">
      <Hourglass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t(key, { date: formatDate(clock.closesAt) })}
    </span>
  );
}
