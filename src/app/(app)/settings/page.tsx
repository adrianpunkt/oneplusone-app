import { ShieldCheck } from "lucide-react";

import { SignOutButton } from "@/components/app/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { member } = await requireMemberContext();

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Settings</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine">
          Account
        </h1>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-lipstick" />
            Login and membership
          </CardTitle>
          <CardDescription>
            Your account is linked by the email used for your story or membership payment.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-blush p-3">
              <dt className="text-xs font-bold uppercase text-faint">Email</dt>
              <dd className="mt-1 text-sm font-semibold text-wine">{member.email}</dd>
            </div>
            <div className="rounded-lg bg-blush p-3">
              <dt className="text-xs font-bold uppercase text-faint">Membership</dt>
              <dd className="mt-1 text-sm font-semibold capitalize text-wine">
                {member.membership_status}
              </dd>
            </div>
          </dl>
          <SignOutButton />
        </CardContent>
      </Card>
    </>
  );
}
