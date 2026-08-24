import { useCallback } from "react";
import { Flame, Hourglass, Lock } from "lucide-react";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  countdown,
  useCountdownParts,
  useTopicClock,
  type RemainingParts,
  type TopicClock,
} from "@/lib/topic-clock";

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

/** Under an hour the countdown turns red and starts pulsing; under a day, amber. */
const CRITICAL_MS = 60 * 60 * 1000;
const URGENT_MS = 24 * 60 * 60 * 1000;

type Segment = { value: number; labelKey: TranslationKey };

function segments(parts: RemainingParts): Segment[] {
  const all: Segment[] = [
    { value: parts.days, labelKey: "time.dayShort" },
    { value: parts.hours, labelKey: "time.hourShort" },
    { value: parts.minutes, labelKey: "time.minShort" },
    { value: parts.seconds, labelKey: "time.secShort" },
  ];
  // a debate closing today should not lead with a "0 days" box
  return parts.days > 0 ? all : all.slice(1);
}

/**
 * The ticking clock under the tallies, beside the deadline date: the same
 * deadline, but moving. It runs on its own one-second timer (see
 * `useCountdownParts`) rather than the page clock, and only ever appears on an
 * open debate that actually has a deadline — after it passes, the closed
 * banner and the date line say everything there is to say.
 */
export function DeadlineCountdown({ clock }: { clock: TopicClock }) {
  const { t } = useI18n();
  const parts = useCountdownParts(clock.closesAt ? clock.closesAt.getTime() : null);

  if (!parts || clock.isClosed) return null;

  const msLeft = clock.msLeft ?? 0;
  const critical = msLeft <= CRITICAL_MS;
  const urgent = !critical && msLeft <= URGENT_MS;
  const tone = critical
    ? "border-destructive/50 bg-destructive/5 text-destructive"
    : urgent
      ? "border-chart-5/60 bg-chart-5/10 text-chart-5"
      : "border-primary/30 bg-primary/5 text-primary";
  const boxTone = critical
    ? "border-destructive/30 bg-background"
    : urgent
      ? "border-chart-5/40 bg-background"
      : "border-primary/20 bg-background";

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={t("closing.countdownAria", {
        d: parts.days,
        h: parts.hours,
        m: parts.minutes,
        s: parts.seconds,
      })}
      className={`mt-4 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-md border px-4 py-3 ${tone}`}
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
        {critical ? (
          <Flame className="countdown-pulse h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        {t(critical ? "closing.countdownLast" : "closing.countdownLabel")}
      </span>
      <span aria-hidden="true" className="inline-flex items-end gap-1.5">
        {segments(parts).map((seg, i, list) => (
          <span key={seg.labelKey} className="inline-flex items-end gap-1.5">
            <span
              className={`flex min-w-14 flex-col items-center rounded-sm border px-2 py-1 ${boxTone}`}
            >
              {/* keyed on the value so each change remounts the digits and
                  replays the flip; the seconds box therefore ticks visibly */}
              <span
                key={seg.value}
                className="countdown-tick font-display text-xl leading-none font-bold tabular-nums"
              >
                {String(seg.value).padStart(2, "0")}
              </span>
              <span className="mt-0.5 text-[0.625rem] leading-none opacity-70">
                {t(seg.labelKey)}
              </span>
            </span>
            {i < list.length - 1 ? (
              <span className="pb-3 text-lg leading-none font-bold opacity-40">:</span>
            ) : null}
          </span>
        ))}
      </span>
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
