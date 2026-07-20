import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { PublicInvitationLogo } from "@/components/public-invitation-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const locale = await getRequestLocaleFallback();
  const text = copy[locale];

  return (
    <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
      <Card className="w-full max-w-xl">
        <CardHeader className="gap-5">
          <PublicInvitationLogo className="w-44" priority />
          <div className="flex items-center gap-2 text-ocean-blue">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <CardTitle>{text.title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form action="/event-invitation/access/claim" method="post">
            <input name="token" type="hidden" value={token} />
            <Button className="w-full sm:w-auto" size="lg" type="submit">
              {text.button}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() || "" : value?.trim() || "";
}
