import type { Metadata } from "next";
import { MailX, ShieldCheck } from "lucide-react";

import { PublicInvitationLogo } from "@/components/public-invitation-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRequestLocaleFallback } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Event invitation email preferences",
};

const copy = {
  en: {
    button: "Stop event invitation emails",
    description:
      "You will stop receiving new event invitations. You can turn them back on later from your Going-out preferences.",
    invalid:
      "This unsubscribe link is no longer valid. You can ignore the invitation email.",
    success: "You have been unsubscribed from future event invitations.",
    successTitle: "You’re unsubscribed",
    title: "Unsubscribe from event invitations?",
  },
  es: {
    button: "Dejar de recibir invitaciones",
    description:
      "Dejarás de recibir nuevas invitaciones a eventos. Más adelante podrás volver a activarlas desde tus preferencias de salidas.",
    invalid:
      "Este enlace para darse de baja ya no es válido. Puedes ignorar el correo de invitación.",
    success: "Te has dado de baja de futuras invitaciones a eventos.",
    successTitle: "Te has dado de baja",
    title: "¿Darte de baja de las invitaciones a eventos?",
  },
} as const;

export default async function EventInvitationUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{
    locale?: string | string[];
    status?: string | string[];
    token?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const requestedLocale = firstValue(params.locale);
  const locale = requestedLocale === "en" || requestedLocale === "es"
    ? requestedLocale
    : await getRequestLocaleFallback();
  const status = firstValue(params.status);
  const token = firstValue(params.token);
  const text = copy[locale];
  const succeeded = status === "success";
  const invalid = status === "invalid" || !token;

  return (
    <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center gap-5">
          <PublicInvitationLogo className="w-44" priority />
          <div className="flex items-center justify-center gap-2 text-ocean-blue">
            {succeeded ? (
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            ) : (
              <MailX aria-hidden="true" className="h-5 w-5" />
            )}
            <CardTitle>{succeeded ? text.successTitle : text.title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid justify-items-center gap-5">
          <p className="text-sm leading-6 text-wine-burgundy/75">
            {succeeded ? text.success : invalid ? text.invalid : text.description}
          </p>
          {!succeeded && !invalid ? (
            <form action="/event-invitation/unsubscribe/confirm" method="post">
              <input name="locale" type="hidden" value={locale} />
              <input name="token" type="hidden" value={token} />
              <Button size="lg" type="submit" variant="secondary">
                {text.button}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() || "" : value?.trim() || "";
}
