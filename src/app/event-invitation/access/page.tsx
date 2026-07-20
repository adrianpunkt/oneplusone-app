import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { AutoSubmitButton } from "@/components/forms/auto-submit-button";
import { PublicInvitationLogo } from "@/components/public-invitation-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  preflightEventInvitationAccess,
  resolveActiveMemberEventInvitationAccess,
} from "@/lib/event-invitation-access";
import { getRequestLocaleFallback } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Open event invitation",
};

const copy = {
  en: {
    button: "Continue to invitation",
    title: "Private event invitation",
  },
  es: {
    button: "Continuar a la invitación",
    title: "Invitación privada a un evento",
  },
} as const;

export default async function EventInvitationAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = firstValue(params.token);
  if (!token) redirect("/event-invitation?access=invalid");

  const activeMemberAccess = await resolveActiveMemberEventInvitationAccess(token);
  if (activeMemberAccess) {
    redirect(`/event-invitation/complete?token=${encodeURIComponent(token)}`);
  }

  const accessStatus = await preflightEventInvitationAccess(token);
  if (accessStatus !== "valid") {
    redirect(`/event-invitation?access=${accessStatus}`);
  }

  const locale = await getRequestLocaleFallback();
  const text = copy[locale];

  return (
    <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center gap-5">
          <PublicInvitationLogo className="mx-auto w-44" priority />
          <div className="flex items-center justify-center gap-2 text-ocean-blue">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <CardTitle>{text.title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid justify-items-center gap-5">
          <form
            action="/event-invitation/access/claim"
            className="flex w-full justify-center"
            method="post"
          >
            <input name="token" type="hidden" value={token} />
            <AutoSubmitButton
              autoSubmit
              className="w-full sm:w-auto"
              delayMs={2_000}
              size="lg"
              type="submit"
            >
              {text.button}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </AutoSubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() || "" : value?.trim() || "";
}
