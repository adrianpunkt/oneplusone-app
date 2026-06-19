import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  History,
  Inbox,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { AddToCalendarButton } from "@/components/app/add-to-calendar-button";
import { RouteToast } from "@/components/app/route-toast";
import {
  CancelInvitationForm,
  InvitationDecisionForms,
} from "@/components/forms/invitation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import {
  getAttendedEvents,
  getInvitations,
  getPreferences,
} from "@/lib/data/portal";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import type { Locale } from "@/lib/i18n/locales";
import type { EventAttendee, EventInvitation, EventRecord } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type UpcomingEvent = {
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

function isJoinedWaitlistInvitation(invitation: EventInvitation) {
  return invitation.status === "waitlisted" && Boolean(invitation.responded_at);
}

function isPendingInvitation(invitation: EventInvitation) {
  if (invitation.status === "invited") return true;
  if (invitation.status === "waitlisted") return !invitation.responded_at;

  return (
    ["cancelled", "declined"].includes(invitation.status) &&
    !invitation.confirmed_at
  );
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
    <p
      className={`text-xs font-semibold uppercase ${eventStatusClassName(status)}`}
    >
      {label || statusLabel(status, locale)}
    </p>
  );
}

function pendingInvitationStatusLabel(
  invitation: EventInvitation,
  dictionary: Dictionary,
  locale: Locale,
) {
  if (invitation.status === "waitlisted") {
    return invitation.responded_at
      ? dictionary.goingOut.status.onWaitlist
      : dictionary.goingOut.status.waitlistAvailable;
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
  item: UpcomingEvent,
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

function waitlistCalendarTitle(
  event: EventRecord | null | undefined,
  dictionary: Dictionary,
  locale: Locale,
) {
  const title = eventTitle(event, dictionary, locale);
  return title.toUpperCase().startsWith("WAITLIST")
    ? title
    : `WAITLIST ${title}`;
}

function eventDisplayLocation(event: EventRecord | null | undefined) {
  return event?.city || event?.venue_name || event?.venue_address || "";
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
  calendarTitle,
  dictionary,
  event,
  locale,
  showCalendar = false,
}: {
  calendarTitle?: string;
  dictionary: Dictionary;
  event: EventRecord | null | undefined;
  locale: Locale;
  showCalendar?: boolean;
}) {
  const displayLocation = eventDisplayLocation(event);
  const eventDescription = localizeText(
    event?.description || event?.member_notes,
    event?.localized_content,
    locale,
    "description",
  );

  return (
    <div className="grid gap-2 text-sm font-semibold text-muted">
      <div className="flex flex-wrap items-center gap-2">
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
              title: calendarTitle || eventTitle(event, dictionary, locale),
            }}
          />
        ) : null}
      </div>
      {displayLocation ? (
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4 text-lipstick-red" />
          {displayLocation}
        </span>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-lipstick-red" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
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
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold leading-tight text-wine-burgundy">
              <Icon className="h-5 w-5 text-lipstick-red" />
              {title}
            </span>
            <span className="text-sm font-semibold text-muted">
              {countLabel}
            </span>
          </span>
          <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-wine-burgundy/10 bg-white px-3 text-xs font-semibold text-wine-burgundy shadow-sm">
            <span className="group-open:hidden">{expandLabel}</span>
            <span className="hidden group-open:inline">{hideLabel}</span>
          </span>
        </summary>
        <CardContent className="grid gap-3">{children}</CardContent>
      </details>
    </Card>
  );
}

function PendingInvitationCard({
  dictionary,
  invitation,
  locale,
}: {
  dictionary: Dictionary;
  invitation: EventInvitation;
  locale: Locale;
}) {
  const isWaitlistAvailable =
    invitation.status === "waitlisted" && !invitation.responded_at;
  const isOnWaitlist =
    invitation.status === "waitlisted" && Boolean(invitation.responded_at);
  const isWaitlist = isWaitlistAvailable || isOnWaitlist;
  const canRejoinWaitlist =
    (invitation.status === "declined" || invitation.status === "cancelled") &&
    !invitation.confirmed_at;
  const hasAction =
    invitation.status === "invited" ||
    isWaitlistAvailable ||
    isOnWaitlist ||
    canRejoinWaitlist;

  return (
    <article
      className={`grid gap-4 rounded-lg border border-wine-burgundy/10 bg-blush-pink p-4 ${
        hasAction ? "lg:grid-cols-[minmax(0,1fr)_auto]" : ""
      }`}
    >
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-1">
          <EventStatusText
            label={pendingInvitationStatusLabel(invitation, dictionary, locale)}
            locale={locale}
            status={invitation.status}
          />
          <h2 className="font-display text-lg font-extrabold text-wine-burgundy">
            {eventTitle(invitation.events, dictionary, locale)}
          </h2>
        </div>
        <EventMeta
          dictionary={dictionary}
          calendarTitle={
            isWaitlist ? waitlistCalendarTitle(invitation.events, dictionary, locale) : undefined
          }
          event={invitation.events}
          locale={locale}
          showCalendar={hasAction}
        />
      </div>
      {hasAction ? <InvitationDecisionForms copy={dictionary.actions} invitation={invitation} /> : null}
    </article>
  );
}

function UpcomingEventCard({
  dictionary,
  item,
  locale,
}: {
  dictionary: Dictionary;
  item: UpcomingEvent;
  locale: Locale;
}) {
  const isWaitlisted =
    item.status === "waitlisted" && Boolean(item.invitation?.responded_at);

  return (
    <article className="grid gap-4 rounded-lg border border-wine-burgundy/10 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-1">
          <EventStatusText
            label={upcomingEventStatusLabel(item, dictionary, locale)}
            locale={locale}
            status={item.status}
          />
          <h2 className="font-display text-lg font-extrabold text-wine-burgundy">
            {eventTitle(item.event, dictionary, locale)}
          </h2>
          {isWaitlisted ? (
            <p className="text-sm font-semibold text-ocean-blue">
              {dictionary.goingOut.waitlistNote}
            </p>
          ) : null}
        </div>
        <EventMeta
          dictionary={dictionary}
          calendarTitle={
            isWaitlisted ? waitlistCalendarTitle(item.event, dictionary, locale) : undefined
          }
          event={item.event}
          locale={locale}
          showCalendar
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {isWaitlisted && item.invitation ? (
          <CancelInvitationForm
            copy={dictionary.actions}
            context="waitlist"
            invitationId={item.invitation.id}
          />
        ) : null}
        <Button asChild variant="secondary">
          <Link href={`/events/${item.eventId}`}>
            {dictionary.common.details}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function PastEventCard({
  attendee,
  dictionary,
  locale,
}: {
  attendee: EventAttendee;
  dictionary: Dictionary;
  locale: Locale;
}) {
  return (
    <Link
      href={`/events/${attendee.event_id}`}
      className="grid gap-2 rounded-lg border border-wine-burgundy/10 bg-blush-pink p-4 transition hover:border-lipstick-red/25 hover:bg-white"
    >
      <div className="grid gap-1">
        <EventStatusText locale={locale} status={attendee.status} />
        <h2 className="font-display text-lg font-extrabold text-wine-burgundy">
          {eventTitle(attendee.events, dictionary, locale)}
        </h2>
      </div>
      <EventMeta dictionary={dictionary} event={attendee.events} locale={locale} />
    </Link>
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
    <section className="flex flex-col gap-3 rounded-lg border border-wine-burgundy/10 bg-white/88 p-4 shadow-[0_14px_35px_rgba(68,10,18,0.05)] sm:flex-row sm:items-center sm:justify-between">
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
      <Button asChild variant="secondary" size="sm" className="w-fit">
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
  const [invitations, attendedEvents, preferences] = await Promise.all([
    getInvitations(member.id),
    getAttendedEvents(member.id),
    getPreferences(member.id),
  ]);

  const pendingInvitations = sortUpcomingEvents(
    invitations.filter(
      (invitation) =>
        isPendingInvitation(invitation) && isActiveEvent(invitation.events),
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
          isActiveEvent(invitation.events),
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
          isActiveEvent(attendee.events),
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
  const pastEvents = sortPastEvents(
    attendedEvents.filter(
      (attendee) =>
        pastAttendeeStatuses.includes(attendee.status) ||
        isCompletedEvent(attendee.events),
    ),
  );
  return (
    <>
      <section className="grid gap-2">
        <h1 className="font-display text-3xl font-black text-wine-burgundy">
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
        <EventSection icon={Inbox} title={dictionary.goingOut.newInvitations}>
          {pendingInvitations.length ? (
            pendingInvitations.map((invitation) => (
              <PendingInvitationCard
                dictionary={dictionary}
                key={invitation.id}
                invitation={invitation}
                locale={locale}
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

        {upcomingEvents.length ? (
          <EventSection icon={CalendarDays} title={dictionary.goingOut.upcomingEvents}>
            {upcomingEvents.map((item) => (
              <UpcomingEventCard
                dictionary={dictionary}
                key={item.key}
                item={item}
                locale={locale}
              />
            ))}
          </EventSection>
        ) : null}

        {pastEvents.length > 1 ? (
          <CollapsibleEventSection
            countLabel={dictionary.goingOut.eventCount(pastEvents.length)}
            expandLabel={dictionary.common.expand}
            hideLabel={dictionary.common.hide}
            icon={History}
            title={dictionary.goingOut.pastEvents}
          >
            {pastEvents.map((attendee) => (
              <PastEventCard
                dictionary={dictionary}
                key={attendee.id}
                attendee={attendee}
                locale={locale}
              />
            ))}
          </CollapsibleEventSection>
        ) : null}
      </section>
    </>
  );
}
