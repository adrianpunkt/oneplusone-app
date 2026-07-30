import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { EventLocation } from "@/components/app/event-location";
import type { EventRecord } from "@/lib/types";
import type { Locale } from "@/lib/i18n/locales";
import { formatEventDateTime } from "@/lib/utils";

type HeaderEvent = Pick<
  EventRecord,
  | "city"
  | "confirmation_released_at"
  | "starts_at"
  | "timezone"
  | "venue_address"
  | "venue_name"
>;

export function EventPageHeader({
  backHref,
  backLabel,
  event,
  locale,
  pendingTooltip,
  title,
}: {
  backHref?: string;
  backLabel?: string;
  event: HeaderEvent;
  locale: Locale;
  pendingTooltip: string;
  title: string;
}) {
  return (
    <section className="grid min-w-0 gap-2">
      {backHref && backLabel ? (
        <Link
          className="mb-1 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-wine-burgundy underline decoration-wine-burgundy/25 underline-offset-4"
          href={backHref}
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {backLabel}
        </Link>
      ) : null}
      <h1 className="min-w-0 break-words font-display text-3xl font-black text-wine-burgundy">
        {title}
      </h1>
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-2 text-sm font-semibold text-muted">
        <span className="inline-flex min-w-0 items-center gap-2">
          <CalendarDays
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-lipstick-red"
          />
          <span className="min-w-0 break-words">
            {formatEventDateTime(event.starts_at, event.timezone, locale)}
          </span>
        </span>
        <EventLocation
          event={event}
          pendingTooltip={pendingTooltip}
        />
      </div>
    </section>
  );
}
