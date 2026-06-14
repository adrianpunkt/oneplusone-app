import Link from "next/link";
import { CalendarDays, CreditCard, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import { getCreditBalance, getInvitations, getPreferences } from "@/lib/data/portal";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GoingOutPage() {
  const { member } = await requireMemberContext();
  const [balance, invitations, preferences] = await Promise.all([
    getCreditBalance(member.id),
    getInvitations(member.id),
    getPreferences(member.id),
  ]);

  const nextInvitation = invitations.find((invitation) =>
    ["invited", "waitlisted", "confirmed"].includes(invitation.status),
  );

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Going out</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine sm:text-4xl">
          Plans, preferences, and credits.
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Everything related to dinner and brunch lives here: your invitations, your saved
          preferences, and the credits you use to reserve a seat.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-lipstick" />
              Events
            </CardTitle>
            <CardDescription>
              {nextInvitation?.events
                ? `${nextInvitation.events.title} - ${formatDateTime(nextInvitation.events.starts_at)}`
                : "Invitations and past tables will show here once a group is ready."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {nextInvitation ? <Badge>{nextInvitation.status}</Badge> : <Badge variant="muted">No invite yet</Badge>}
            <Button asChild variant="secondary">
              <Link href="/events">Open events</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-lipstick" />
              Going out preferences
            </CardTitle>
            <CardDescription>
              {preferences
                ? "Your dinner and brunch preferences are saved."
                : "Tell us what kind of table works best for you."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {preferences?.prefers_saturday_dinner ? <Badge>Saturday dinner</Badge> : null}
              {preferences?.prefers_sunday_brunch ? <Badge>Sunday brunch</Badge> : null}
              {preferences?.wants_to_host ? <Badge variant="ocean">Open to host</Badge> : null}
              {!preferences ? <Badge variant="muted">Not set</Badge> : null}
            </div>
            <Button asChild variant="secondary">
              <Link href="/preferences">Change going out preferences</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-lipstick" />
              Credits
            </CardTitle>
            <CardDescription>
              One credit reserves one seat. Credits do not expire.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="font-display text-3xl font-black text-wine">{balance}</p>
            <Button asChild variant="secondary">
              <Link href="/credits">Manage credits</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
