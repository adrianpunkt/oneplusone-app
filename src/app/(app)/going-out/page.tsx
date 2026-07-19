import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  History,
  House,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { AddToCalendarButton } from "@/components/app/add-to-calendar-button";
import {
  EventGroupSummaryLine,
  formatEventGroupSummaryCopy,
} from "@/components/app/event-group-summary";
import { RouteToast } from "@/components/app/route-toast";
import {
  CancelInvitationForm,
  ConfirmInvitationForm,
  DeclineInvitationForm,
  InvitationDecisionForms,
} from "@/components/forms/invitation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import {
  getAttendedEvents,
  getCreditBalance,
  getEventGroupSummaries,
  getInvitations,
  getPreferences,
} from "@/lib/data/portal";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import type { Locale } from "@/lib/i18n/locales";
import type {
  EventAttendee,
  EventGroupSummary,
  EventInvitation,
  EventRecord,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type EventListItem = {
  event: EventRecord | null | undefined;
  eventId: string;
  invitation?: EventInvitation;
  key: string;
  status: string;
};

type GoingOutPageProps = {
  searchParams: Promise<{
    preferences?: string | string[];
    waitlist?: string | string[];
  }>;
};

type WaitlistConfirmationStatus = "joined" | "cancelled";

const upcomingAttendeeStatuses: readonly EventAttendee["status"][] = [
  "confirmed",
];
const pastAttendeeStatuses: readonly EventAttendee["status"][] = [
  "attended",
  "host",
  "no_show",
];
const pastInvitationStatuses: readonly EventInvitation["status"][] = [
  "invited",
  "confirmed",
  "waitlisted",
];

function isJoinedWaitlistInvitation(invitation: EventInvitation) {
  return invitation.status === "waitlisted" && Boolean(invitation.responded_at);
}

function isInvitationConfirmAvailable(invitation: EventInvitation) {
  if (invitation.responded_at) return false;

  if (invitation.status === "invited") {
    return invitation.response_mode !== "closed" &&
      invitation.response_mode !== "waitlist";
  }

  return invitation.status === "waitlisted" &&
    invitation.response_mode === "confirm";
}

function isInvitationWaitlistAvailable(invitation: EventInvitation) {
  if (invitation.responded_at) return false;
  if (invitation.response_mode === "waitlist") return true;

  return invitation.status === "waitlisted" &&
    invitation.response_mode !== "confirm";
}

function isPendingInvitation(invitation: EventInvitation) {
  if (invitation.status === "invited") return true;
  if (invitation.status === "waitlisted") return !invitation.responded_at;
  return invitation.status === "cancelled" &&
    Boolean(invitation.confirmed_at) &&
    !invitation.replacement_found;
}

function isRejectedInvitation(invitation: EventInvitation) {
  if (["declined", "expired"].includes(invitation.status)) return true;

  return invitation.status === "cancelled" &&
    (!invitation.confirmed_at || Boolean(invitation.replacement_found));
}

function eventTimestamp(event: EventRecord | null | undefined) {
  if (!event?.starts_at) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(event.starts_at).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function isActiveEvent(event: EventRecord | null | undefined) {
  return (
    !event || (event.status !== "completed" && event.status !== "cancelled")
  );
}

function isCompletedEvent(event: EventRecord | null | undefined) {
  return event?.status === "completed";
}

function isPastEvent(event: EventRecord | null | undefined, now: number) {
  if (isCompletedEvent(event)) return true;

  const eventEndsAt = event?.ends_at || event?.starts_at;
  if (!eventEndsAt) return false;

  const timestamp = new Date(eventEndsAt).getTime();
  return !Number.isNaN(timestamp) && timestamp < now;
}

async function getRequestTimestamp() {
  await connection();
  return Date.now();
}

function sortUpcomingEvents<T extends { events?: EventRecord | null }>(
  items: T[],
) {
  return [...items].sort(
    (left, right) => eventTimestamp(left.events) - eventTimestamp(right.events),
  );
}

function sortPastEvents<T extends { events?: EventRecord | null }>(items: T[]) {
  return [...items].sort(
    (left, right) => eventTimestamp(right.events) - eventTimestamp(left.events),
  );
}

const statusLabels: Record<Locale, Record<string, string>> = {
  en: {},
  es: {
    attended: "asistido",
    cancelled: "cancelado",
    confirmed: "confirmado",
    declined: "rechazado",
    expired: "caducado",
    host: "host",
    invited: "invitado",
    no_show: "no asistió",
    waitlisted: "en lista de espera",
  },
};

function statusLabel(status: string, locale: Locale) {
  return statusLabels[locale][status] || status.replaceAll("_", " ");
}

function eventStatusClassName(status: string) {
  if (status === "waitlisted" || status === "host" || status === "attended") {
    return "text-ocean-blue";
  }

  if (
    status === "cancelled" ||
    status === "declined" ||
    status === "expired" ||
    status === "no_show"
  ) {
    return "text-muted";
  }

  return "text-lipstick-red";
}

function EventStatusText({
  label,
  locale,
  status,
}: {
  label?: string;
  locale: Locale;
  status: string;
}) {
  return (
    <p className={`text-xs font-semibold uppercase ${eventStatusClassName(status)}`}>
      {label || statusLabel(status, locale)}
    </p>
  );
}

function pendingInvitationStatusLabel(
  invitation: EventInvitation,
  dictionary: Dictionary,
  locale: Locale,
) {
  if (isJoinedWaitlistInvitation(invitation)) {
    return dictionary.goingOut.status.onWaitlist;
  }

  if (isInvitationWaitlistAvailable(invitation)) {
    return dictionary.goingOut.status.waitlistAvailable;
  }

  if (isInvitationConfirmAvailable(invitation)) {
    return statusLabel("invited", locale);
  }

  if (
    invitation.status === "cancelled" &&
    invitation.confirmed_at &&
    !invitation.replacement_found
  ) {
    return dictionary.goingOut.status.replacementPending;
  }

  if (
    (invitation.status === "declined" || invitation.status === "cancelled") &&
    !invitation.confirmed_at
  ) {
    return dictionary.goingOut.status.cannotMakeIt;
  }

  return statusLabel(invitation.status, locale);
}

function upcomingEventStatusLabel(
  item: EventListItem,
  dictionary: Dictionary,
  locale: Locale,
) {
  if (item.status === "waitlisted" && item.invitation?.responded_at) {
    return dictionary.goingOut.status.onWaitlist;
  }

  return statusLabel(item.status, locale);
}

function eventTitle(
  event: EventRecord | null | undefined,
  dictionary: Dictionary,
  locale: Locale,
) {
  return localizeText(event?.title, event?.localized_content, locale, "title") || dictionary.common.event;
}

function eventCalendarLocation(event: EventRecord | null | undefined) {
  return [event?.venue_name, event?.venue_address, event?.city]
    .filter(Boolean)
    .join(", ");
}

function waitlistConfirmationStatus(
  value: string | string[] | undefined,
): WaitlistConfirmationStatus | null {
  const status = Array.isArray(value) ? value[0] : value;

  if (status === "joined" || status === "cancelled") {
    return status;
  }

  return null;
}

function searchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function WaitlistConfirmation({
  dictionary,
  status,
}: {
  dictionary: Dictionary;
  status: WaitlistConfirmationStatus | null;
}) {
  if (!status) return null;

  if (status === "joined") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-wine-burgundy/35 px-4 py-8 backdrop-blur-sm">
        <div
          aria-labelledby="waitlist-confirmation-title"
          aria-modal="true"
          className="grid w-full max-w-md gap-5 rounded-lg border border-wine-burgundy/10 bg-white p-6 shadow-2xl"
          role="dialog"
        >
          <div className="grid gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ocean-blue text-white">
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={3} />
            </span>
            <div className="grid gap-2">
              <h2
                className="font-display text-2xl font-extrabold leading-tight text-wine-burgundy"
                id="waitlist-confirmation-title"
              >
                {dictionary.goingOut.waitlistModalTitle}
              </h2>
              <div className="grid gap-2 text-sm leading-6 text-muted">
                <p>{dictionary.goingOut.waitlistModalBody1}</p>
                <p>
                  <span className="font-semibold text-wine-burgundy">{dictionary.goingOut.important}</span>{" "}
                  {dictionary.goingOut.waitlistModalImportant}
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button asChild>
              <Link href="/going-out">{dictionary.goingOut.gotIt}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function EventMeta({
  dictionary,
  event,
  locale,
  showCalendar = false,
}: {
  dictionary: Dictionary;
  event: EventRecord | null | undefined;
  locale: Locale;
  showCalendar?: boolean;
}) {
  const eventDescription = localizeText(
    event?.description || event?.member_notes,
    event?.localized_content,
    locale,
    "description",
  );

  return (
    <div className="grid gap-2 text-sm font-semibold text-muted sm:flex sm:flex-wrap sm:items-center">
      <span className="inline-flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-lipstick-red" />
        {formatDateTime(event?.starts_at, locale)}
      </span>
      {showCalendar && event?.starts_at ? (
        <AddToCalendarButton
          copy={dictionary.calendar}
          event={{
            description: eventDescription,
            endsAt: event.ends_at,
            id: event.id,
            location: eventCalendarLocation(event),
            startsAt: event.starts_at,
            title: eventTitle(event, dictionary, locale),
          }}
        />
      ) : null}
    </div>
  );
}

function EmptyEventState({
  body,
  ctaHref,
  ctaLabel,
  title,
}: {
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
  title: string;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-dashed border-wine-burgundy/15 bg-blush-pink p-5">
      <div className="grid gap-1">
        <p className="font-display text-lg font-extrabold leading-tight text-wine-burgundy">
          {title}
        </p>
        <p className="max-w-2xl text-base font-medium leading-6 text-muted">
          {body}
        </p>
      </div>
      {ctaHref && ctaLabel ? (
        <p className="max-w-2xl text-sm leading-6 text-muted">
          <Link
            href={ctaHref}
            className="font-semibold text-lipstick-red underline decoration-lipstick-red/35 underline-offset-4 transition hover:text-wine-burgundy hover:decoration-wine-burgundy"
          >
            {ctaLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function EventSection({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-5">
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-lipstick-red" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-0 p-0 sm:gap-3 sm:p-5 sm:pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

function CollapsibleEventSection({
  children,
  countLabel,
  expandLabel,
  hideLabel,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  countLabel: string;
  expandLabel: string;
  hideLabel: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="overflow-hidden">
      <details className="group/past-events">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          <span className="grid min-w-0 gap-1">
            <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold leading-tight text-wine-burgundy">
              <Icon className="h-5 w-5 text-lipstick-red" />
              {title}
            </span>
            <span className="text-sm font-semibold text-muted">{countLabel}</span>
          </span>
          <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-wine-burgundy/10 bg-white px-3 text-xs font-semibold text-wine-burgundy shadow-sm">
            <span className="group-open/past-events:hidden">{expandLabel}</span>
            <span className="hidden group-open/past-events:inline">{hideLabel}</span>
          </span>
        </summary>
        <CardContent className="grid gap-0 p-0 sm:gap-3 sm:p-5 sm:pt-0">
          {children}
        </CardContent>
      </details>
    </Card>
  );
}

function PendingInvitationCard({
  creditBalance,
  dictionary,
  invitation,
  locale,
  now,
  preferences,
  summary,
}: {
  creditBalance: number;
  dictionary: Dictionary;
  invitation: EventInvitation;
  locale: Locale;
  now: number;
  preferences: Awaited<ReturnType<typeof getPreferences>>;
  summary: EventGroupSummary | undefined;
}) {
  const isConfirmAvailable = isInvitationConfirmAvailable(invitation);
  const isWaitlistAvailable = isInvitationWaitlistAvailable(invitation);
  const isOnWaitlist =
    invitation.status === "waitlisted" && Boolean(invitation.responded_at);
  const canDecline =
    !invitation.confirmed_at &&
    ["invited", "waitlisted"].includes(invitation.status);
  const isWaitlist = isWaitlistAvailable || isOnWaitlist;
  const canRestoreConfirmation =
    invitation.status === "cancelled" &&
    Boolean(invitation.confirmed_at) &&
    !invitation.replacement_found;
  const hasAction =
    isConfirmAvailable ||
    isWaitlistAvailable ||
    isOnWaitlist ||
    canDecline ||
    canRestoreConfirmation;

  return (
    <article
      className={`grid gap-4 rounded-none border-x-0 border-b-0 border-t border-wine-burgundy/10 bg-white p-4 sm:rounded-lg sm:border ${
        hasAction ? "lg:grid-cols-[minmax(0,1fr)_auto]" : ""
      }`}
    >
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-1">
          <EventStatusText
            label={pendingInvitationStatusLabel(invitation, dictionary, locale)}
            locale={locale}
            status={isWaitlist ? "waitlisted" : invitation.status}
          />
          <h2 className="font-display text-lg font-extrabold text-wine-burgundy">
            {eventTitle(invitation.events, dictionary, locale)}
          </h2>
        </div>
        <EventMeta
          dictionary={dictionary}
          event={invitation.events}
          locale={locale}
        />
        <EventGroupSummaryLine
          copy={formatEventGroupSummaryCopy(
            dictionary.events.groupSummary,
            summary,
          )}
          event={invitation.events}
          languageTooltips={dictionary.events.languageTooltips}
          locale={locale}
          venuePendingTooltip={dictionary.events.venuePendingTooltip}
        />
      </div>
      {hasAction ? (
        <InvitationDecisionForms
          copy={dictionary.actions}
          creditBalance={creditBalance}
          eventCopy={{
            languageTooltips: dictionary.events.languageTooltips,
            venuePendingTooltip: dictionary.events.venuePendingTooltip,
          }}
          hostingCopy={dictionary.preferences}
          invitation={invitation}
          locale={locale}
          now={now}
          wantsToHost={preferences?.wants_to_host ?? false}
        />
      ) : null}
    </article>
  );
}

function UpcomingEventCard({
  dictionary,
  item,
  locale,
  summary,
  wantsToHost,
}: {
  dictionary: Dictionary;
  item: EventListItem;
  locale: Locale;
  summary: EventGroupSummary | undefined;
  wantsToHost: boolean;
}) {
  const isWaitlisted =
    item.status === "waitlisted" && Boolean(item.invitation?.responded_at);
  const isConfirmed = item.status === "confirmed" && Boolean(item.invitation);

  return (
    <article className="grid gap-4 rounded-none border-x-0 border-b-0 border-t border-wine-burgundy/10 bg-white p-4 sm:rounded-lg sm:border lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-1">
          {isConfirmed ? (
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-emerald-700">
              <CircleCheck aria-hidden="true" className="h-4 w-4" />
              {dictionary.goingOut.status.seatConfirmed}
            </p>
          ) : (
            <EventStatusText
              label={upcomingEventStatusLabel(item, dictionary, locale)}
              locale={locale}
              status={item.status}
            />
          )}
          <h2 className="font-display text-lg font-extrabold text-wine-burgundy">
            {eventTitle(item.event, dictionary, locale)}
          </h2>
        </div>
        <EventMeta
          dictionary={dictionary}
          event={item.event}
          locale={locale}
          showCalendar={!isWaitlisted}
        />
        <EventGroupSummaryLine
          copy={formatEventGroupSummaryCopy(
            dictionary.events.groupSummary,
            summary,
          )}
          event={item.event}
          languageTooltips={dictionary.events.languageTooltips}
          locale={locale}
          venuePendingTooltip={dictionary.events.venuePendingTooltip}
        />
        {isWaitlisted ? (
          <p className="text-sm font-semibold text-ocean-blue">
            {dictionary.goingOut.waitlistNote}
          </p>
        ) : null}
        {isConfirmed && wantsToHost ? (
          <p className="flex items-start gap-2 text-sm font-semibold text-ocean-blue">
            <House aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{dictionary.goingOut.hostOptInNote}</span>
          </p>
        ) : null}
      </div>
      <div className="grid w-full justify-items-center gap-3 pt-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-2 sm:pt-0 lg:flex-col lg:items-end lg:justify-between">
        <Button
          asChild
          className="h-12 min-w-40 px-6 text-base sm:h-10 sm:min-w-0 sm:px-4 sm:text-sm"
          variant="secondary"
        >
          <Link href={`/events/${item.eventId}`}>
            {dictionary.common.details}
            <ArrowRight className="h-5 w-5 sm:h-4 sm:w-4" />
          </Link>
        </Button>
        {isConfirmed && item.invitation ? (
          <CancelInvitationForm
            copy={dictionary.actions}
            invitationId={item.invitation.id}
            linkTrigger
          />
        ) : null}
        {isWaitlisted && item.invitation ? (
          <DeclineInvitationForm
            copy={dictionary.actions}
            invitationId={item.invitation.id}
            linkTrigger
          />
        ) : null}
      </div>
    </article>
  );
}

function PastEventCard({
  creditBalance,
  dictionary,
  item,
  locale,
  now,
  preferences,
  summary,
}: {
  creditBalance: number;
  dictionary: Dictionary;
  item: EventListItem;
  locale: Locale;
  now: number;
  preferences: Awaited<ReturnType<typeof getPreferences>>;
  summary: EventGroupSummary | undefined;
}) {
  const canReapply =
    item.invitation?.status === "declined" &&
    item.invitation.response_mode === "confirm" &&
    isActiveEvent(item.event) &&
    !isPastEvent(item.event, now);

  return (
    <article className="grid gap-4 rounded-none border-x-0 border-b-0 border-t border-cement-gray bg-cement-gray/20 p-4 sm:rounded-lg sm:border lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-1">
          <EventStatusText
            label={
              item.status === "declined"
                ? dictionary.goingOut.status.cannotMakeIt
                : undefined
            }
            locale={locale}
            status={item.status}
          />
          <h2 className="font-display text-lg font-extrabold text-muted">
            {eventTitle(item.event, dictionary, locale)}
          </h2>
        </div>
        <EventMeta dictionary={dictionary} event={item.event} locale={locale} />
        <EventGroupSummaryLine
          copy={formatEventGroupSummaryCopy(
            dictionary.events.groupSummary,
            summary,
          )}
          event={item.event}
          languageTooltips={dictionary.events.languageTooltips}
          locale={locale}
          venuePendingTooltip={dictionary.events.venuePendingTooltip}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button asChild variant="secondary">
          <Link href={`/events/${item.eventId}`}>
            {dictionary.common.details}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {canReapply && item.invitation ? (
          <ConfirmInvitationForm
            copy={dictionary.actions}
            creditBalance={creditBalance}
            event={item.invitation.events}
            eventCopy={{
              languageTooltips: dictionary.events.languageTooltips,
              venuePendingTooltip: dictionary.events.venuePendingTooltip,
            }}
            hostingCopy={dictionary.preferences}
            invitationId={item.invitation.id}
            locale={locale}
            now={now}
            wantsToHost={preferences?.wants_to_host ?? false}
          />
        ) : null}
      </div>
    </article>
  );
}

function PreferencesStrip({
  dictionary,
  preferences,
}: {
  dictionary: Dictionary;
  preferences: Awaited<ReturnType<typeof getPreferences>>;
}) {
  const extraPreferences: Record<string, unknown> =
    preferences?.extra_preferences ?? {};
  const hasTextPreference = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;
  const hasOtherEventIdeas =
    extraPreferences.interested_in_other_events === true ||
    hasTextPreference(extraPreferences.other_event_ideas);
  const hasLocationPreferences =
    extraPreferences.prefers_affordable_relaxed_locations === true ||
    extraPreferences.prefers_michelin_guide_locations === true;
  const hasDietaryPreferences = hasTextPreference(
    preferences?.dietary_restrictions,
  );
  const hasOtherPreferences = hasTextPreference(
    extraPreferences.other_preferences,
  );
  const hasAnyPreference = Boolean(
    preferences &&
      (preferences.prefers_saturday_dinner ||
        preferences.prefers_sunday_brunch ||
        hasOtherEventIdeas ||
        hasLocationPreferences ||
        hasDietaryPreferences ||
        preferences.wants_to_host ||
        hasOtherPreferences),
  );

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-wine-burgundy/10 bg-white/88 p-4 shadow-[0_14px_35px_rgba(68,10,18,0.05)] sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-2">
        <p className="font-display text-base font-extrabold text-wine-burgundy">
          {dictionary.goingOut.preferencesTitle}
        </p>
        <div className="flex flex-wrap gap-2">
          {preferences?.prefers_saturday_dinner ? (
            <Badge>{dictionary.goingOut.saturdayDinner}</Badge>
          ) : null}
          {preferences?.prefers_sunday_brunch ? (
            <Badge>{dictionary.goingOut.sundayBrunch}</Badge>
          ) : null}
          {hasOtherEventIdeas ? <Badge>{dictionary.goingOut.otherEventIdeas}</Badge> : null}
          {hasLocationPreferences ? (
            <Badge variant="wine-burgundy">{dictionary.goingOut.locationPreferences}</Badge>
          ) : null}
          {hasDietaryPreferences ? (
            <Badge variant="wine-burgundy">{dictionary.goingOut.dietaryPreferences}</Badge>
          ) : null}
          {preferences?.wants_to_host ? (
            <Badge variant="ocean-blue">{dictionary.goingOut.openToHost}</Badge>
          ) : null}
          {hasOtherPreferences ? (
            <Badge variant="wine-burgundy">{dictionary.goingOut.otherPreferences}</Badge>
          ) : null}
          {!hasAnyPreference ? <Badge variant="muted">{dictionary.goingOut.notSet}</Badge> : null}
        </div>
      </div>
      <Button
        asChild
        className="h-11 w-full text-sm sm:h-8 sm:w-fit sm:text-xs"
        variant="secondary"
        size="sm"
      >
        <Link href="/preferences">{dictionary.goingOut.updatePreferences}</Link>
      </Button>
    </section>
  );
}

export default async function GoingOutPage({
  searchParams,
}: GoingOutPageProps) {
  const { locale, member } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const { preferences: preferencesParam, waitlist } = await searchParams;
  const preferencesSaved = searchParamValue(preferencesParam) === "saved";
  const waitlistConfirmation = waitlistConfirmationStatus(waitlist);
  const [invitations, attendedEvents, preferences, creditBalance] = await Promise.all([
    getInvitations(member.id),
    getAttendedEvents(member.id),
    getPreferences(member.id),
    getCreditBalance(member.id),
  ]);
  const eventGroupSummaries = await getEventGroupSummaries([
    ...invitations.map((invitation) => invitation.events),
    ...attendedEvents.map((attendee) => attendee.events),
  ]);
  const now = await getRequestTimestamp();

  const pendingInvitations = sortUpcomingEvents(
    invitations.filter(
      (invitation) =>
        isPendingInvitation(invitation) &&
        isActiveEvent(invitation.events) &&
        !isPastEvent(invitation.events, now),
    ),
  );
  const upcomingInvitationEventIds = new Set(
    invitations
      .filter(
        (invitation) =>
          invitation.status === "confirmed" ||
          isJoinedWaitlistInvitation(invitation),
      )
      .map((invitation) => invitation.event_id),
  );
  const upcomingEvents = [
    ...sortUpcomingEvents(
      invitations.filter(
        (invitation) =>
          (invitation.status === "confirmed" ||
            isJoinedWaitlistInvitation(invitation)) &&
          isActiveEvent(invitation.events) &&
          !isPastEvent(invitation.events, now),
      ),
    ).map((invitation) => ({
      event: invitation.events,
      eventId: invitation.event_id,
      invitation,
      key: `invitation-${invitation.id}`,
      status: invitation.status,
    })),
    ...sortUpcomingEvents(
      attendedEvents.filter(
        (attendee) =>
          upcomingAttendeeStatuses.includes(attendee.status) &&
          !upcomingInvitationEventIds.has(attendee.event_id) &&
          isActiveEvent(attendee.events) &&
          !isPastEvent(attendee.events, now),
      ),
    ).map((attendee) => ({
      event: attendee.events,
      eventId: attendee.event_id,
      key: `attendee-${attendee.id}`,
      status: attendee.is_host ? "host" : attendee.status,
    })),
  ].sort(
    (left, right) => eventTimestamp(left.event) - eventTimestamp(right.event),
  );
  const pastInvitations = sortPastEvents(
    invitations.filter(
      (invitation) =>
        isRejectedInvitation(invitation) ||
        (isPastEvent(invitation.events, now) &&
          (pastInvitationStatuses.includes(invitation.status) ||
            invitation.status === "cancelled")),
    ),
  );
  const pastInvitationEventIds = new Set(
    pastInvitations.map((invitation) => invitation.event_id),
  );
  const pastEvents = [
    ...pastInvitations.map((invitation) => ({
      event: invitation.events,
      eventId: invitation.event_id,
      invitation,
      key: `invitation-${invitation.id}`,
      status: invitation.status,
    })),
    ...sortPastEvents(
      attendedEvents.filter(
        (attendee) =>
          !pastInvitationEventIds.has(attendee.event_id) &&
          isPastEvent(attendee.events, now) &&
          (pastAttendeeStatuses.includes(attendee.status) ||
            isCompletedEvent(attendee.events)),
      ),
    ).map((attendee) => ({
      event: attendee.events,
      eventId: attendee.event_id,
      key: `attendee-${attendee.id}`,
      status: attendee.is_host ? "host" : attendee.status,
    })),
  ].sort(
    (left, right) => eventTimestamp(right.event) - eventTimestamp(left.event),
  );
  return (
    <>
      <section className="grid gap-2 px-1 sm:px-0">
        <h1 className="font-display text-3xl font-black leading-tight text-wine-burgundy">
          {dictionary.goingOut.title}
        </h1>
      </section>

      <RouteToast
        clearSearchParams={["preferences"]}
        title={dictionary.goingOut.preferencesSaved}
        toastKey={preferencesSaved ? "preferences-saved" : null}
      />
      <RouteToast
        clearSearchParams={
          waitlistConfirmation === "cancelled" ? ["waitlist"] : []
        }
        description={
          waitlistConfirmation === "joined"
            ? dictionary.goingOut.waitlistJoinedDescription
            : dictionary.goingOut.waitlistCancelledDescription
        }
        title={
          waitlistConfirmation === "joined"
            ? dictionary.goingOut.waitlistJoinedTitle
            : dictionary.goingOut.waitlistCancelledTitle
        }
        toastKey={
          waitlistConfirmation ? `waitlist-${waitlistConfirmation}` : null
        }
      />
      <WaitlistConfirmation dictionary={dictionary} status={waitlistConfirmation} />

      <PreferencesStrip dictionary={dictionary} preferences={preferences} />

      <section className="grid gap-4">
        {pendingInvitations.length || !upcomingEvents.length ? (
          <EventSection icon={Inbox} title={dictionary.goingOut.newInvitations}>
            {pendingInvitations.length ? (
              pendingInvitations.map((invitation) => (
                <PendingInvitationCard
                  creditBalance={creditBalance}
                  dictionary={dictionary}
                  key={invitation.id}
                  invitation={invitation}
                  locale={locale}
                  now={now}
                  preferences={preferences}
                  summary={eventGroupSummaries[invitation.event_id]}
                />
              ))
            ) : (
              <EmptyEventState
                title={dictionary.goingOut.noInvitationsTitle}
                body={dictionary.goingOut.noInvitationsBody}
                ctaHref="/my-story"
                ctaLabel={dictionary.goingOut.updateStoryCta}
              />
            )}
          </EventSection>
        ) : null}

        {upcomingEvents.length ? (
          <EventSection icon={CalendarDays} title={dictionary.goingOut.upcomingEvents}>
            {upcomingEvents.map((item) => (
              <UpcomingEventCard
                dictionary={dictionary}
                key={item.key}
                item={item}
                locale={locale}
                summary={eventGroupSummaries[item.eventId]}
                wantsToHost={preferences?.wants_to_host ?? false}
              />
            ))}
          </EventSection>
        ) : null}

        {pastEvents.length ? (
          <CollapsibleEventSection
            countLabel={dictionary.goingOut.eventCount(pastEvents.length)}
            expandLabel={dictionary.common.expand}
            hideLabel={dictionary.common.hide}
            icon={History}
            title={dictionary.goingOut.pastEvents}
          >
            {pastEvents.map((item) => (
              <PastEventCard
                creditBalance={creditBalance}
                dictionary={dictionary}
                key={item.key}
                item={item}
                locale={locale}
                now={now}
                preferences={preferences}
                summary={eventGroupSummaries[item.eventId]}
              />
            ))}
          </CollapsibleEventSection>
        ) : null}
      </section>
    </>
  );
}
