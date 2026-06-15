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
import {
  CancelInvitationForm,
  InvitationDecisionForms,
} from "@/components/forms/invitation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import {
  getAttendedEvents,
  getInvitations,
  getPreferences,
} from "@/lib/data/portal";
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

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function eventStatusClassName(status: string) {
  if (status === "waitlisted" || status === "host" || status === "attended") {
    return "text-ocean";
  }

  if (
    status === "cancelled" ||
    status === "declined" ||
    status === "expired" ||
    status === "no_show"
  ) {
    return "text-muted";
  }

  return "text-lipstick";
}

function EventStatusText({
  label,
  status,
}: {
  label?: string;
  status: string;
}) {
  return (
    <p
      className={`text-xs font-black uppercase ${eventStatusClassName(status)}`}
    >
      {label || statusLabel(status)}
    </p>
  );
}

function pendingInvitationStatusLabel(invitation: EventInvitation) {
  if (invitation.status === "waitlisted") {
    return invitation.responded_at ? "on waitlist" : "waitlist available";
  }

  if (
    (invitation.status === "declined" || invitation.status === "cancelled") &&
    !invitation.confirmed_at
  ) {
    return "cannot make it";
  }

  return statusLabel(invitation.status);
}

function upcomingEventStatusLabel(item: UpcomingEvent) {
  if (item.status === "waitlisted" && item.invitation?.responded_at) {
    return "on waitlist";
  }

  return statusLabel(item.status);
}

function eventTitle(event: EventRecord | null | undefined) {
  return event?.title || "Event";
}

function waitlistCalendarTitle(event: EventRecord | null | undefined) {
  const title = eventTitle(event);
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

function WaitlistConfirmation({
  status,
}: {
  status: WaitlistConfirmationStatus | null;
}) {
  if (!status) return null;

  if (status === "joined") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-wine/35 px-4 py-8 backdrop-blur-sm">
        <div
          aria-labelledby="waitlist-confirmation-title"
          aria-modal="true"
          className="grid w-full max-w-md gap-5 rounded-lg border border-wine/10 bg-white p-6 shadow-2xl"
          role="dialog"
        >
          <div className="grid gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ocean text-white">
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={3} />
            </span>
            <div className="grid gap-2">
              <h2
                className="font-display text-2xl font-black leading-tight text-wine"
                id="waitlist-confirmation-title"
              >
                You are on the waitlist!
              </h2>
              <div className="grid gap-2 text-sm leading-6 text-muted">
                <p>As soon as a seat opens up, we&apos;ll send you an email.</p>
                <p>
                  <span className="font-semibold text-wine">IMPORTANT:</span>{" "}
                  Everyone on the waitlist gets notified, and you will need to
                  confirm your attendance once in order to secure your seat.
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button asChild>
              <Link href="/going-out">Got it</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-start gap-3 rounded-lg border border-ocean/15 bg-white px-4 py-3 text-sm leading-6 text-ocean shadow-sm"
      role="status"
    >
      <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">You&apos;re off the waitlist.</p>
        <p className="text-muted">
          You can rejoin later if it is still available.
        </p>
      </div>
    </div>
  );
}

function EventMeta({
  calendarTitle,
  event,
  showCalendar = false,
}: {
  calendarTitle?: string;
  event: EventRecord | null | undefined;
  showCalendar?: boolean;
}) {
  const displayLocation = eventDisplayLocation(event);

  return (
    <div className="grid gap-2 text-sm font-semibold text-muted">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-lipstick" />
          {formatDateTime(event?.starts_at)}
        </span>
        {showCalendar && event?.starts_at ? (
          <AddToCalendarButton
            event={{
              description: event.description || event.member_notes,
              endsAt: event.ends_at,
              id: event.id,
              location: eventCalendarLocation(event),
              startsAt: event.starts_at,
              title: calendarTitle || eventTitle(event),
            }}
          />
        ) : null}
      </div>
      {displayLocation ? (
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4 text-lipstick" />
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
    <div className="grid gap-3 rounded-lg border border-dashed border-wine/15 bg-blush p-5">
      <div className="grid gap-1">
        <p className="font-display text-lg font-black text-wine">{title}</p>
        <p className="max-w-2xl text-sm leading-6 text-muted">{body}</p>
      </div>
      {ctaHref && ctaLabel ? (
        <p className="max-w-2xl text-sm leading-6 text-muted">
          <Link
            href={ctaHref}
            className="font-semibold text-lipstick underline decoration-lipstick/35 underline-offset-4 transition hover:text-wine hover:decoration-wine"
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
          <Icon className="h-5 w-5 text-lipstick" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

function CollapsibleEventSection({
  children,
  count,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  count: number;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold leading-tight text-wine">
              <Icon className="h-5 w-5 text-lipstick" />
              {title}
            </span>
            <span className="text-sm font-semibold text-muted">
              {count === 1 ? "1 event" : `${count} events`}
            </span>
          </span>
          <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-wine/10 bg-white px-3 text-xs font-semibold text-wine shadow-sm">
            <span className="group-open:hidden">Expand</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <CardContent className="grid gap-3">{children}</CardContent>
      </details>
    </Card>
  );
}

function PendingInvitationCard({
  invitation,
}: {
  invitation: EventInvitation;
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
      className={`grid gap-4 rounded-lg border border-wine/10 bg-blush p-4 ${
        hasAction ? "lg:grid-cols-[minmax(0,1fr)_auto]" : ""
      }`}
    >
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-1">
          <EventStatusText
            label={pendingInvitationStatusLabel(invitation)}
            status={invitation.status}
          />
          <h2 className="font-display text-lg font-black text-wine">
            {eventTitle(invitation.events)}
          </h2>
        </div>
        <EventMeta
          calendarTitle={
            isWaitlist ? waitlistCalendarTitle(invitation.events) : undefined
          }
          event={invitation.events}
          showCalendar={hasAction}
        />
      </div>
      {hasAction ? <InvitationDecisionForms invitation={invitation} /> : null}
    </article>
  );
}

function UpcomingEventCard({ item }: { item: UpcomingEvent }) {
  const isWaitlisted =
    item.status === "waitlisted" && Boolean(item.invitation?.responded_at);

  return (
    <article className="grid gap-4 rounded-lg border border-wine/10 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-2">
        <div className="grid gap-1">
          <EventStatusText
            label={upcomingEventStatusLabel(item)}
            status={item.status}
          />
          <h2 className="font-display text-lg font-black text-wine">
            {eventTitle(item.event)}
          </h2>
          {isWaitlisted ? (
            <p className="text-sm font-semibold text-ocean">
              We&apos;ll let you know in case anyone cancels.
            </p>
          ) : null}
        </div>
        <EventMeta
          calendarTitle={
            isWaitlisted ? waitlistCalendarTitle(item.event) : undefined
          }
          event={item.event}
          showCalendar
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {isWaitlisted && item.invitation ? (
          <CancelInvitationForm
            context="waitlist"
            invitationId={item.invitation.id}
          />
        ) : null}
        <Button asChild variant="secondary">
          <Link href={`/events/${item.eventId}`}>
            Details
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function PastEventCard({ attendee }: { attendee: EventAttendee }) {
  return (
    <Link
      href={`/events/${attendee.event_id}`}
      className="grid gap-2 rounded-lg border border-wine/10 bg-blush p-4 transition hover:border-lipstick/25 hover:bg-white"
    >
      <div className="grid gap-1">
        <EventStatusText status={attendee.status} />
        <h2 className="font-display text-lg font-black text-wine">
          {eventTitle(attendee.events)}
        </h2>
      </div>
      <EventMeta event={attendee.events} />
    </Link>
  );
}

function PreferencesStrip({
  preferences,
}: {
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
    <section className="flex flex-col gap-3 rounded-lg border border-wine/10 bg-white/88 p-4 shadow-[0_14px_35px_rgba(68,10,18,0.05)] sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-2">
        <p className="font-display text-base font-black text-wine">
          Going-out preferences
        </p>
        <div className="flex flex-wrap gap-2">
          {preferences?.prefers_saturday_dinner ? (
            <Badge>Saturday dinner</Badge>
          ) : null}
          {preferences?.prefers_sunday_brunch ? (
            <Badge>Sunday brunch</Badge>
          ) : null}
          {hasOtherEventIdeas ? <Badge>Other event ideas</Badge> : null}
          {hasLocationPreferences ? (
            <Badge variant="wine">Location preferences</Badge>
          ) : null}
          {hasDietaryPreferences ? (
            <Badge variant="wine">Dietary preferences</Badge>
          ) : null}
          {preferences?.wants_to_host ? (
            <Badge variant="ocean">Open to host</Badge>
          ) : null}
          {hasOtherPreferences ? (
            <Badge variant="wine">Other preferences</Badge>
          ) : null}
          {!hasAnyPreference ? <Badge variant="muted">Not set</Badge> : null}
        </div>
      </div>
      <Button asChild variant="secondary" size="sm" className="w-fit">
        <Link href="/preferences">Update preferences</Link>
      </Button>
    </section>
  );
}

export default async function GoingOutPage({
  searchParams,
}: GoingOutPageProps) {
  const { member } = await requireMemberContext();
  const { waitlist } = await searchParams;
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
        <h1 className="font-display text-3xl font-black tracking-tight text-wine sm:text-4xl">
          Goint-out
        </h1>
      </section>

      <WaitlistConfirmation status={waitlistConfirmation} />

      <PreferencesStrip preferences={preferences} />

      <section className="grid gap-4">
        <EventSection icon={Inbox} title="Pending invitations">
          {pendingInvitations.length ? (
            pendingInvitations.map((invitation) => (
              <PendingInvitationCard
                key={invitation.id}
                invitation={invitation}
              />
            ))
          ) : (
            <EmptyEventState
              title="We're finding your people..."
              body="As soon as enough members share your intentions, you'll be invited to an event together."
              ctaHref="/my-story/edit"
              ctaLabel="Click here in case you need to update your story"
            />
          )}
        </EventSection>

        <EventSection icon={CalendarDays} title="Upcoming events">
          {upcomingEvents.length ? (
            upcomingEvents.map((item) => (
              <UpcomingEventCard key={item.key} item={item} />
            ))
          ) : (
            <EmptyEventState
              title="No upcoming events yet."
              body="Once you confirm an invitation, the plan moves here."
            />
          )}
        </EventSection>

        <CollapsibleEventSection
          count={pastEvents.length}
          icon={History}
          title="Past events"
        >
          {pastEvents.length ? (
            pastEvents.map((attendee) => (
              <PastEventCard key={attendee.id} attendee={attendee} />
            ))
          ) : (
            <EmptyEventState
              title="No event history yet."
              body="After your first event, this will become your record of the tables you have joined."
            />
          )}
        </CollapsibleEventSection>
      </section>
    </>
  );
}
