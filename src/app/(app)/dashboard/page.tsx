import Link from "next/link";
import { CalendarDays, CreditCard, MessageCircle, Sparkles, Utensils } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import {
  getConversations,
  getCreditBalance,
  getInvitations,
  getPreferences,
} from "@/lib/data/portal";
import { formatDateTime, storyValue } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { member, profile } = await requireMemberContext();
  const [balance, invitations, preferences, conversations] = await Promise.all([
    getCreditBalance(member.id),
    getInvitations(member.id),
    getPreferences(member.id),
    getConversations(member.id),
  ]);

  const nextInvitation = invitations.find((invitation) =>
    ["invited", "waitlisted", "confirmed"].includes(invitation.status),
  );
  const firstName = storyValue(profile?.profile_json, "profile.first_name") || "there";

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Member portal</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine sm:text-4xl">
          Hi {firstName}.
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Your profile, credits, invitations, and post-event conversations live here.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-lipstick" />
              {balance} credits
            </CardTitle>
            <CardDescription>Credits do not expire.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link href="/credits">Manage credits</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-lipstick" />
              {nextInvitation ? nextInvitation.status : "No invite yet"}
            </CardTitle>
            <CardDescription>
              {nextInvitation?.events
                ? `${nextInvitation.events.title} - ${formatDateTime(nextInvitation.events.starts_at)}`
                : "We will show invitations here when a table is ready."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link href="/events">Open events</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-lipstick" />
              {conversations.length} conversations
            </CardTitle>
            <CardDescription>Reach out after shared events.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link href="/messages">Open messages</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-lipstick" />
              Your story
            </CardTitle>
            <CardDescription>
              This stays private. It helps us form better small tables.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-blush p-3">
                <dt className="text-xs font-bold uppercase text-faint">Looking for</dt>
                <dd className="mt-1 text-sm font-semibold text-wine">
                  {storyValue(profile?.profile_json, "profile.available_relationships") || "Not set"}
                </dd>
              </div>
              <div className="rounded-lg bg-blush p-3">
                <dt className="text-xs font-bold uppercase text-faint">Can meet in</dt>
                <dd className="mt-1 text-sm font-semibold text-wine">
                  {storyValue(profile?.profile_json, "profile.event_location") || "Not set"}
                </dd>
              </div>
            </dl>
            <Button asChild>
              <Link href="/profile">Review story</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Utensils className="h-5 w-5 text-lipstick" />
              Going out
            </CardTitle>
            <CardDescription>
              {preferences
                ? "Your dinner and brunch preferences are saved."
                : "Tell us when and how you like to show up."}
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
              <Link href="/preferences">Update preferences</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
