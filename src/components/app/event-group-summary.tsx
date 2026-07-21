import { Fragment, type ReactNode } from "react";
import { UsersRound } from "lucide-react";

import { EventLanguage } from "@/components/app/event-language";
import { EventLocation } from "@/components/app/event-location";
import { HoverTooltip } from "@/components/ui/hover-tooltip";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import type { EventGroupSummary, EventRecord } from "@/lib/types";

export type EventGroupSummaryLineCopy = {
  ageRange: string | null;
  genderShares: string | null;
  people: string;
  peopleRangeTooltip: string | null;
};

export function formatEventGroupSummaryCopy(
  copy: Dictionary["events"]["groupSummary"],
  summary: EventGroupSummary | undefined,
): EventGroupSummaryLineCopy {
  const exactParticipantCount = summary?.approved
    ? summary.participantCount
    : null;

  return {
    ageRange:
      summary && summary.ageMin !== null && summary.ageMax !== null
        ? copy.ageRange(summary.ageMin, summary.ageMax)
        : null,
    genderShares:
      summary?.approved && summary.genderShares.length
        ? summary.genderShares
            .map(({ gender, percentage }) =>
              copy.genderShare(percentage, copy.genders[gender]),
            )
            .join(" / ")
        : null,
    people:
      exactParticipantCount !== null
        ? copy.peopleCount(exactParticipantCount)
        : copy.peopleRange(
            summary?.participantMin || 6,
            summary?.participantMax || 8,
          ),
    peopleRangeTooltip:
      exactParticipantCount === null ? copy.peopleRangeTooltip : null,
  };
}

export function EventGroupSummaryLine({
  copy,
  event,
  languageTooltips,
  locale,
  separatePeopleLine = false,
  showPeopleIcon = false,
  venuePendingTooltip,
}: {
  copy: EventGroupSummaryLineCopy;
  event: EventRecord | null | undefined;
  languageTooltips: Dictionary["events"]["languageTooltips"];
  locale: Locale;
  separatePeopleLine?: boolean;
  showPeopleIcon?: boolean;
  venuePendingTooltip: string;
}) {
  if (!event) return null;

  const segments: Array<{ key: string; value: ReactNode }> = [];

  segments.push({
    key: "location",
    value: (
      <EventLocation
        className="text-sm font-medium text-muted"
        event={event}
        pendingTooltip={venuePendingTooltip}
      />
    ),
  });

  if (event.language_code) {
    segments.push({
      key: "language",
      value: (
        <EventLanguage
          className="text-sm font-medium text-muted"
          languageCode={event.language_code}
          locale={locale}
          tooltip={languageTooltips[event.language_code]}
        />
      ),
    });
  }

  const people = copy.peopleRangeTooltip ? (
    <span
      aria-label={copy.peopleRangeTooltip}
      className="group relative inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/40 focus-visible:ring-offset-2"
      tabIndex={0}
    >
      {copy.people}
      <HoverTooltip placement="top-left">
        {copy.peopleRangeTooltip}
      </HoverTooltip>
    </span>
  ) : (
    copy.people
  );

  segments.push({
    key: "people",
    value: showPeopleIcon ? (
      <span
        className="inline-flex items-center gap-2"
      >
        <UsersRound aria-hidden="true" className="h-4 w-4 text-lipstick-red" />
        {people}
      </span>
    ) : (
      people
    ),
  });

  if (copy.ageRange) {
    segments.push({
      key: "ages",
      value: copy.ageRange,
    });
  }

  if (copy.genderShares) {
    segments.push({
      key: "genders",
      value: copy.genderShares,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-muted">
      {segments.map((segment, index) => {
        const startsSecondLine = separatePeopleLine && segment.key === "people";

        return (
          <Fragment key={segment.key}>
            {startsSecondLine ? (
              <span aria-hidden="true" className="h-0 basis-full" />
            ) : null}
            {index ? (
              <span
                aria-hidden="true"
                className={startsSecondLine ? "hidden" : undefined}
              >
                ·
              </span>
            ) : null}
            {typeof segment.value === "string" ? (
              <span>{segment.value}</span>
            ) : (
              segment.value
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
