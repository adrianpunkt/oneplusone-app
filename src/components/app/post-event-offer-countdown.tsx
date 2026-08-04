"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

import type { Locale } from "@/lib/i18n/locales";
import { postEventOfferTimeRemaining } from "@/lib/post-event-credit-offer";

const MINUTE_MILLISECONDS = 60_000;

export function PostEventOfferCountdown({
  copy,
  expiresAt,
  locale,
}: {
  copy: {
    expired: string;
    expiresIn: string;
  };
  expiresAt: string;
  locale: Locale;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timeoutId: number | undefined;

    function updateCountdown() {
      const currentNow = Date.now();
      const remainingMilliseconds =
        new Date(expiresAt).getTime() - currentNow;

      setNow(currentNow);
      if (remainingMilliseconds <= 0 || !Number.isFinite(remainingMilliseconds)) {
        return;
      }

      const millisecondsUntilNextMinute =
        remainingMilliseconds % MINUTE_MILLISECONDS || MINUTE_MILLISECONDS;
      timeoutId = window.setTimeout(
        updateCountdown,
        millisecondsUntilNextMinute + 50,
      );
    }

    timeoutId = window.setTimeout(updateCountdown, 0);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [expiresAt]);

  const remaining =
    now === null ? null : postEventOfferTimeRemaining(expiresAt, now);
  const countdown = !remaining
    ? `${copy.expiresIn}…`
    : remaining.expired
      ? copy.expired
      : `${copy.expiresIn} ${formatRemainingTime(remaining, locale)}`;

  return (
    <span className="flex items-center gap-1.5">
      <Timer aria-hidden="true" className="h-4 w-4 shrink-0" />
      <time dateTime={expiresAt}>{countdown}</time>
    </span>
  );
}

function formatRemainingTime(
  remaining: { days: number; hours: number; minutes: number },
  locale: Locale,
) {
  const units = [
    formatUnit(remaining.days, "day", locale),
    formatUnit(remaining.hours, "hour", locale),
    formatUnit(remaining.minutes, "minute", locale),
  ];

  return locale === "es"
    ? `${units[0]}, ${units[1]} y ${units[2]}`
    : units.join(", ");
}

function formatUnit(
  value: number,
  unit: "day" | "hour" | "minute",
  locale: Locale,
) {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "long",
  }).format(value);
}
