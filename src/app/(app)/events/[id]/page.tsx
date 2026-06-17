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
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member } = await requireMemberContext();
  const { attendee, event, eventAttendees, invitation } = await getEventDetail(id, member.id);

  if (!event) notFound();

  const canMessage = attendee?.status === "attended" || attendee?.status === "host";

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">{event.event_format}</Badge>
        <h1 className="font-display text-3xl font-black text-wine">
          {event.title}
        </h1>
        <div className="flex flex-wrap gap-3 text-sm font-semibold text-muted">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-lipstick" />
            {formatDateTime(event.starts_at)}
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
            <CardTitle>Event details</CardTitle>
            <CardDescription>{event.description || "Details will appear here."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-blush p-3">
                <dt className="text-xs font-semibold uppercase text-faint">Venue</dt>
                <dd className="mt-1 text-sm font-semibold text-wine">
                  {event.venue_name || "Shared after confirmation"}
                </dd>
              </div>
              <div className="rounded-lg bg-blush p-3">
                <dt className="text-xs font-semibold uppercase text-faint">Status</dt>
                <dd className="mt-1 text-sm font-semibold capitalize text-wine">{event.status}</dd>
              </div>
            </dl>
            {event.member_notes ? (
              <p className="rounded-lg border border-ocean/15 bg-ocean/8 p-4 text-sm leading-6 text-ocean">
                {event.member_notes}
              </p>
            ) : null}
            {invitation ? <InvitationDecisionForms invitation={invitation} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-lipstick" />
              People from your table
            </CardTitle>
            <CardDescription>
              First names only. Messaging unlocks after a shared past event.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {canMessage && eventAttendees.length ? (
              eventAttendees.map((person) => (
                <article key={person.member_id} className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-lg font-extrabold text-wine">{person.first_name}</p>
                    <Badge variant="muted">Past event</Badge>
                  </div>
                  <StartConversationForm eventId={event.id} recipientMemberId={person.member_id} />
                </article>
              ))
            ) : (
              <p className="rounded-lg bg-blush p-4 text-sm font-semibold text-muted">
                Attendee messaging appears here after the event is marked attended.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
