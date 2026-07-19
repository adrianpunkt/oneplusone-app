import Link from "next/link";
import { connection } from "next/server";
import { CalendarDays } from "lucide-react";

import { EventLanguage } from "@/components/app/event-language";
import { EventLocation } from "@/components/app/event-location";
import {
  InvitationDecisionForms,
} from "@/components/forms/invitation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import {
  getAttendedEvents,
  getCreditBalance,
  getInvitations,
  getPreferences,
} from "@/lib/data/portal";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import type { Locale } from "@/lib/i18n/locales";
import type { EventInvitation } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
  return statusLabels[locale][status] || status;
}

function invitationDisplayStatus(
  invitation: EventInvitation,
  dictionary: Dictionary,
  locale: Locale,
) {
  if (invitation.status === "waitlisted" && invitation.responded_at) {
    return dictionary.goingOut.status.onWaitlist;
  }

  if (!invitation.responded_at && invitation.response_mode === "waitlist") {
    return dictionary.goingOut.status.waitlistAvailable;
  }

  if (
    !invitation.responded_at &&
    invitation.status === "waitlisted" &&
    invitation.response_mode === "confirm"
  ) {
    return statusLabel("invited", locale);
  }

  return statusLabel(invitation.status, locale);
}

async function getRequestTimestamp() {
  await connection();
  return Date.now();
}

export default async function EventsPage() {
  const { locale, member } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const [invitations, attendedEvents, creditBalance, preferences, now] = await Promise.all([
    getInvitations(member.id),
    getAttendedEvents(member.id),
    getCreditBalance(member.id),
    getPreferences(member.id),
    getRequestTimestamp(),
  ]);

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine-burgundy">{dictionary.events.badge}</Badge>
        <h1 className="font-display text-3xl font-black text-wine-burgundy">
          {dictionary.events.title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {dictionary.events.intro}
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{dictionary.events.invitations}</CardTitle>
          <CardDescription>{dictionary.events.invitationsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {invitations.length ? (
            invitations.map((invitation) => (
              <article
                key={invitation.id}
                className="grid gap-4 rounded-lg border border-wine-burgundy/10 bg-white p-4 lg:grid-cols-[1fr_auto]"
              >
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="uppercase">
                      {invitationDisplayStatus(invitation, dictionary, locale)}
                    </Badge>
                    <h2 className="font-display text-lg font-extrabold text-wine-burgundy">
                      {localizeText(invitation.events?.title, invitation.events?.localized_content, locale, "title") || dictionary.common.event}
                    </h2>
                  </div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                    <CalendarDays className="h-4 w-4 text-lipstick-red" />
                    {formatDateTime(invitation.events?.starts_at, locale)}
                  </p>
                  <EventLocation
                    event={invitation.events}
                    pendingTooltip={dictionary.events.venuePendingTooltip}
                  />
                  {invitation.events?.language_code ? (
                    <EventLanguage
                      languageCode={invitation.events.language_code}
                      locale={locale}
                      tooltip={dictionary.events.languageTooltips[invitation.events.language_code]}
                    />
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Button asChild variant="secondary">
                    <Link href={`/events/${invitation.event_id}`}>{dictionary.common.details}</Link>
                  </Button>
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
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-lg bg-blush-pink p-4 text-sm font-semibold text-muted">
              {dictionary.events.noInvitations}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dictionary.events.pastConfirmed}</CardTitle>
          <CardDescription>{dictionary.events.pastConfirmedDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {attendedEvents.length ? (
            attendedEvents.map((attendee) => (
              <Link
                key={attendee.id}
                href={`/events/${attendee.event_id}`}
                className="grid gap-2 rounded-lg border border-wine-burgundy/10 bg-blush-pink p-4 transition hover:border-lipstick-red/25"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={attendee.status === "attended" ? "ocean-blue" : "muted"}>
                    {statusLabel(attendee.status, locale)}
                  </Badge>
                  <h2 className="font-display text-lg font-extrabold text-wine-burgundy">
                    {localizeText(attendee.events?.title, attendee.events?.localized_content, locale, "title") || dictionary.common.event}
                  </h2>
                </div>
                <p className="text-sm font-semibold text-muted">
                  {formatDateTime(attendee.events?.starts_at, locale)}
                </p>
              </Link>
            ))
          ) : (
            <p className="rounded-lg bg-blush-pink p-4 text-sm font-semibold text-muted">
              {dictionary.events.noHistory}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
