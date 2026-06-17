import { notFound } from "next/navigation";
import { CalendarDays, MapPin, UsersRound } from "lucide-react";

import {
  InvitationDecisionForms,
} from "@/components/forms/invitation-actions";
import { StartConversationForm } from "@/components/forms/start-conversation-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import { getEventDetail } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import type { Locale } from "@/lib/i18n/locales";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusLabels: Record<Locale, Record<string, string>> = {
  en: {},
  es: {
    cancelled: "cancelado",
    completed: "completado",
    confirmed: "confirmado",
    draft: "borrador",
    inviting: "invitando",
  },
};

function statusLabel(status: string, locale: Locale) {
  return statusLabels[locale][status] || status;
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const { attendee, event, eventAttendees, invitation } = await getEventDetail(id, member.id);

  if (!event) notFound();

  const canMessage = attendee?.status === "attended" || attendee?.status === "host";
  const title = localizeText(event.title, event.localized_content, locale, "title");
  const description = localizeText(event.description, event.localized_content, locale, "description");
  const memberNotes = localizeText(event.member_notes, event.localized_content, locale, "member_notes");

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">{dictionary.events.formats[event.event_format]}</Badge>
        <h1 className="font-display text-3xl font-black text-wine">
          {title}
        </h1>
        <div className="flex flex-wrap gap-3 text-sm font-semibold text-muted">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-lipstick" />
            {formatDateTime(event.starts_at, locale)}
          </span>
          {event.city ? (
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-lipstick" />
              {event.city}
            </span>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.events.eventDetails}</CardTitle>
            <CardDescription>{description || dictionary.events.detailsFallback}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-blush p-3">
                <dt className="text-xs font-semibold uppercase text-faint">{dictionary.events.venue}</dt>
                <dd className="mt-1 text-sm font-semibold text-wine">
                  {event.venue_name || dictionary.events.sharedAfterConfirmation}
                </dd>
              </div>
              <div className="rounded-lg bg-blush p-3">
                <dt className="text-xs font-semibold uppercase text-faint">{dictionary.events.status}</dt>
                <dd className="mt-1 text-sm font-semibold capitalize text-wine">
                  {statusLabel(event.status, locale)}
                </dd>
              </div>
            </dl>
            {memberNotes ? (
              <p className="rounded-lg border border-ocean/15 bg-ocean/8 p-4 text-sm leading-6 text-ocean">
                {memberNotes}
              </p>
            ) : null}
            {invitation ? <InvitationDecisionForms copy={dictionary.actions} invitation={invitation} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-lipstick" />
              {dictionary.events.peopleFromTable}
            </CardTitle>
            <CardDescription>
              {dictionary.events.peopleDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {canMessage && eventAttendees.length ? (
              eventAttendees.map((person) => (
                <article key={person.member_id} className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-lg font-extrabold text-wine">{person.first_name}</p>
                    <Badge variant="muted">{dictionary.events.pastEvent}</Badge>
                  </div>
                  <StartConversationForm
                    copy={{
                      firstMessagePlaceholder: dictionary.messages.firstMessagePlaceholder,
                      firstMessageSent: dictionary.messages.firstMessageSent,
                      sendFirst: dictionary.messages.sendFirst,
                      sending: dictionary.messages.sending,
                    }}
                    eventId={event.id}
                    recipientMemberId={person.member_id}
                  />
                </article>
              ))
            ) : (
              <p className="rounded-lg bg-blush p-4 text-sm font-semibold text-muted">
                {dictionary.events.messagingAfterEvent}
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
