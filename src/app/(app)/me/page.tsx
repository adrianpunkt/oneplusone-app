import Link from "next/link";
import { BookHeart, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import { getPreferences } from "@/lib/data/portal";
import { storyValue } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const { member, profile } = await requireMemberContext();
  const preferences = await getPreferences(member.id);
  const firstName = storyValue(profile?.profile_json, "profile.first_name");
  const location = storyValue(profile?.profile_json, "profile.event_location");

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Me</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine sm:text-4xl">
          Your details.
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Keep the private information we use for matching and planning up to date.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-lipstick" />
              My going out preferences
            </CardTitle>
            <CardDescription>
              Dinner, brunch, dietary, and hosting preferences for future tables.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
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
              <BookHeart className="h-5 w-5 text-lipstick" />
              My story
            </CardTitle>
            <CardDescription>
              Your private story helps us make thoughtful introductions.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-blush p-3">
                <dt className="text-xs font-bold uppercase text-faint">First name</dt>
                <dd className="mt-1 text-sm font-semibold text-wine">{firstName || "Not set"}</dd>
              </div>
              <div className="rounded-lg bg-blush p-3">
                <dt className="text-xs font-bold uppercase text-faint">Can meet in</dt>
                <dd className="mt-1 text-sm font-semibold text-wine">{location || "Not set"}</dd>
              </div>
            </dl>
            <Button asChild variant="secondary">
              <Link href="/profile">Review my story</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
