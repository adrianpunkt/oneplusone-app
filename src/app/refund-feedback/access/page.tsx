import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { AutoSubmitButton } from "@/components/forms/auto-submit-button";
import { PublicInvitationLogo } from "@/components/public-invitation-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  refundFeedbackClaimAction,
  resolveRefundFeedbackAccess,
} from "@/lib/membership-refund-feedback";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Refund feedback",
};

const copy = {
  en: {
    button: "Continue",
    title: "Refund feedback form",
  },
  es: {
    button: "Continuar",
    title: "Formulario de comentarios sobre el reembolso",
  },
} as const;

export default async function RefundFeedbackAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = firstValue(params.token);
  const access = await resolveRefundFeedbackAccess(token);
  if (access.status !== "valid") {
    const locale = access.status === "expired" ? `&locale=${access.locale}` : "";
    redirect(`/refund-feedback?access=${access.status}${locale}`);
  }

  const text = copy[access.context.refund.locale];
  const requestHeaders = await headers();
  const claimAction = refundFeedbackClaimAction(
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host"),
    requestHeaders.get("x-forwarded-proto"),
  );

  return (
    <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center gap-5">
          <PublicInvitationLogo className="mx-auto w-44" priority />
          <CardTitle>{text.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid justify-items-center gap-5">
          <form action={claimAction} className="w-full" method="post">
            <input name="token" type="hidden" value={token} />
            <AutoSubmitButton
              autoSubmit
              className="w-full"
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
