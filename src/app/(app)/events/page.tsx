import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";

import {
  InvitationDecisionForms,
} from "@/components/forms/invitation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import { getAttendedEvents, getInvitations } from "@/lib/data/portal";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const { member } = await requireMemberContext();
  const [invitations, attendedEvents] = await Promise.all([
    getInvitations(member.id),
    getAttendedEvents(member.id),
  ]);

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Events</Badge>
        <h1 className="font-display text-3xl font-black text-wine">
          Invitations and past tables
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Confirmed seats use 1 credit. If you cancel and someone from the waitlist takes your
          place, the credit can be returned by the team.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>First come, first served once a group is ready.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {invitations.length ? (
            invitations.map((invitation) => (
              <article
                key={invitation.id}
                className="grid gap-4 rounded-lg border border-wine/10 bg-white p-4 lg:grid-cols-[1fr_auto]"
              >
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{invitation.status}</Badge>
                    <h2 className="font-display text-lg font-extrabold text-wine">
                      {invitation.events?.title || "Event"}
                    </h2>
                  </div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                    <CalendarDays className="h-4 w-4 text-lipstick" />
                    {formatDateTime(invitation.events?.starts_at)}
                  </p>
                  {invitation.events?.city ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                      <MapPin className="h-4 w-4 text-lipstick" />
                      {invitation.events.city}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Button asChild variant="secondary">
                    <Link href={`/events/${invitation.event_id}`}>Details</Link>
                  </Button>
                  <InvitationDecisionForms invitation={invitation} />
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-lg bg-blush p-4 text-sm font-semibold text-muted">
              No invitations yet. We will show them here as soon as there is a group worth
              showing up for.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past and confirmed events</CardTitle>
          <CardDescription>Past attended events unlock post-event messages.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {attendedEvents.length ? (
            attendedEvents.map((attendee) => (
              <Link
                key={attendee.id}
                href={`/events/${attendee.event_id}`}
                className="grid gap-2 rounded-lg border border-wine/10 bg-blush p-4 transition hover:border-lipstick/25"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={attendee.status === "attended" ? "ocean" : "muted"}>
                    {attendee.status}
                  </Badge>
                  <h2 className="font-display text-lg font-extrabold text-wine">
                    {attendee.events?.title || "Event"}
                  </h2>
                </div>
                <p className="text-sm font-semibold text-muted">
                  {formatDateTime(attendee.events?.starts_at)}
                </p>
              </Link>
            ))
          ) : (
            <p className="rounded-lg bg-blush p-4 text-sm font-semibold text-muted">
              No event history yet.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
