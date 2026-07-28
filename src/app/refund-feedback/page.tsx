import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CheckCircle2, MessageCircleHeart } from "lucide-react";

import { RefundFeedbackForm } from "@/components/forms/refund-feedback-form";
import { PublicInvitationLogo } from "@/components/public-invitation-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  REFUND_FEEDBACK_COOKIE_NAME,
  resolveRefundFeedbackAccess,
} from "@/lib/membership-refund-feedback";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Refund feedback",
};

const copy = {
  en: {
    comments: "Anything else you would like us to know? (optional)",
    commentsPlaceholder: "Your comments",
    confirmationDescription: "Your feedback is very important to us.",
    confirmationTitle: "Thank you!",
    description:
      "Tell us more about what didn't work for you. Your feedback is much appreciated.",
    expired: "This private feedback link is invalid or has expired.",
    reasons: {
      personal_circumstances: "My personal circumstances changed",
      event_format_or_atmosphere: "The event format or atmosphere was not right for me",
      people_or_connections: "I did not meet the kind of people I hoped to connect with",
      not_enough_suitable_events: "There were not enough suitable events",
      price_or_value: "The membership did not feel like good value",
      app_or_signup_experience: "The app or sign-up experience was difficult",
      other: "Other",
    },
    saved: "Thank you. Your feedback has been shared with our team.",
    saving: "Sharing...",
    submit: "Share feedback",
    submitted: "Your feedback has been shared with our team.",
    title: "Help us offer a better dating experience",
  },
  es: {
    comments: "¿Hay algo más que quieras contarnos? (opcional)",
    commentsPlaceholder: "Tus comentarios",
    confirmationDescription: "Tu opinión es muy importante para nosotros.",
    confirmationTitle: "¡Gracias!",
    description:
      "Cuéntanos más sobre lo que no funcionó para ti. Agradecemos mucho tus comentarios.",
    expired: "Este enlace privado de comentarios no es válido o ha caducado.",
    reasons: {
      personal_circumstances: "Mis circunstancias personales cambiaron",
      event_format_or_atmosphere: "El formato o el ambiente de los eventos no era lo que buscaba",
      people_or_connections: "No conocí al tipo de personas con las que esperaba conectar",
      not_enough_suitable_events: "No había suficientes eventos adecuados",
      price_or_value: "La membresía no me pareció una buena relación calidad-precio",
      app_or_signup_experience: "La aplicación o el registro fueron difíciles",
      other: "Otro",
    },
    saved: "Gracias. Hemos compartido tus comentarios con nuestro equipo.",
    saving: "Enviando...",
    submit: "Compartir comentarios",
    submitted: "Tus comentarios se han compartido con nuestro equipo.",
    title: "Ayúdanos a ofrecer una mejor experiencia de citas",
  },
} as const;

export default async function RefundFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(REFUND_FEEDBACK_COOKIE_NAME)?.value || "";
  const access = await resolveRefundFeedbackAccess(token);
  const requestedLocale = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const locale = access.status === "valid"
    ? access.context.refund.locale
    : requestedLocale === "es"
      ? "es"
      : "en";
  const text = copy[locale];
  const isSubmitted = access.status === "valid" && Boolean(access.context.feedback);

  return (
    <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
      <Card className="w-full max-w-xl">
        <CardHeader className="items-center gap-5 pb-8 text-center">
          <PublicInvitationLogo className="mx-auto w-44" priority />
          {access.status === "valid" ? (
            <div className="grid justify-items-center gap-2">
              <div
                className={
                  isSubmitted
                    ? "flex justify-center"
                    : "flex items-start justify-center gap-2 sm:items-center"
                }
              >
                {!isSubmitted ? (
                  <MessageCircleHeart
                    aria-hidden
                    className="mt-0.5 h-7 w-7 shrink-0 text-ocean-blue sm:mt-0"
                  />
                ) : null}
                <CardTitle className={isSubmitted ? "text-center" : "text-left"}>
                  {isSubmitted ? text.confirmationTitle : text.title}
                </CardTitle>
              </div>
              <CardDescription>
                {isSubmitted ? text.confirmationDescription : text.description}
              </CardDescription>
            </div>
          ) : (
            <CardTitle>{text.expired}</CardTitle>
          )}
        </CardHeader>
        {access.status === "valid" ? (
          <CardContent>
            {access.context.feedback ? (
              <p className="flex items-center justify-center gap-3 rounded-lg bg-ocean-blue/8 p-4 text-center text-sm font-semibold text-ocean-blue">
                <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0" />
                {text.submitted}
              </p>
            ) : (
              <RefundFeedbackForm copy={text} />
            )}
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
