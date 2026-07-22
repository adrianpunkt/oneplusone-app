import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, MapPin, ShieldCheck, XCircle } from "lucide-react";

import { PublicInvitationLogo } from "@/components/public-invitation-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  resolveEventInvitationDeclineToken,
  type EventInvitationDeclineContext,
  type EventInvitationDeclineStatus,
} from "@/lib/event-invitation-decline";
import { isEventInvitationDeclineReasonForFormat } from "@/lib/event-invitation-decline-reasons";
import { getRequestLocaleFallback } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { follow: false, index: false },
  title: "Respond to event invitation",
};

const copy = {
  en: {
    already_declined: "You have already told us that you cannot attend this event.",
    already_declinedTitle: "Response already received",
    deadline_passed: "The RSVP deadline has passed, so this invitation can no longer be changed.",
    deadline_passedTitle: "The response window has closed",
    description: "Please help us improve your dating experience.",
    details: "Anything else you’d like us to know? (optional)",
    detailsPlaceholder: "Add an optional note",
    expired: "This private response link has expired.",
    expiredTitle: "This link has expired",
    invalid: "This private response link is not valid.",
    invalidTitle: "Invalid link",
    keep: "Keep my invitation",
    kept: "In case you change your mind, use the link in your email to apply for a seat.",
    keptTitle: "Your invitation is still valid",
    reason: "Let us know what happened",
    reasons: {
      event_type_not_interested: "I’m not interested in this kind of events",
      weekend_unavailable: "I cannot make it this weekend",
      prefers_saturday_dinner: "I would prefer Saturday dinners instead",
      prefers_sunday_brunch: "I would prefer Sunday brunches instead",
      event_fit: "This event isn't a good fit for me",
      other_commitment: "Something else",
    },
    retry: "We could not check this invitation right now. Please reopen the link and try again.",
    retryTitle: "Please try again",
    send: "Send response",
    success: "We have recorded that you cannot attend.",
    successTitle: "Thanks for letting us know",
    title: "Cannot make it?",
    unavailable: "This invitation is no longer available for a decline response.",
    unavailableTitle: "Invitation unavailable",
    validation: "Choose a reason before sending your response.",
    format: { brunch: "Brunch", dinner: "Dinner", other: "Event" },
  },
  es: {
    already_declined: "Ya nos has indicado que no puedes asistir a este evento.",
    already_declinedTitle: "Respuesta ya recibida",
    deadline_passed: "El plazo de confirmación ha terminado, así que esta invitación ya no se puede cambiar.",
    deadline_passedTitle: "El plazo de respuesta ha terminado",
    description: "Ayúdanos a mejorar tu experiencia de citas.",
    details: "¿Quieres contarnos algo más? (opcional)",
    detailsPlaceholder: "Añade una nota opcional",
    expired: "Este enlace privado de respuesta ha caducado.",
    expiredTitle: "Este enlace ha caducado",
    invalid: "Este enlace privado de respuesta no es válido.",
    invalidTitle: "Enlace no válido",
    keep: "Conservar mi invitación",
    kept: "Si cambias de opinión, usa el enlace de tu correo electrónico para solicitar una plaza.",
    keptTitle: "Tu invitación sigue siendo válida",
    reason: "Cuéntanos qué ha pasado",
    reasons: {
      event_type_not_interested: "No me interesan este tipo de eventos",
      weekend_unavailable: "No puedo asistir este fin de semana",
      prefers_saturday_dinner: "Preferiría las cenas de los sábados",
      prefers_sunday_brunch: "Preferiría los brunches de los domingos",
      event_fit: "Este evento no encaja conmigo",
      other_commitment: "Otro motivo",
    },
    retry: "No hemos podido comprobar esta invitación ahora mismo. Vuelve a abrir el enlace e inténtalo de nuevo.",
    retryTitle: "Inténtalo de nuevo",
    send: "Enviar respuesta",
    success: "Hemos registrado que no puedes asistir.",
    successTitle: "Gracias por avisarnos",
    title: "¿No puedes asistir?",
    unavailable: "Esta invitación ya no está disponible para registrar que no puedes asistir.",
    unavailableTitle: "Invitación no disponible",
    validation: "Elige un motivo antes de enviar tu respuesta.",
    format: { brunch: "Brunch", dinner: "Cena", other: "Evento" },
  },
} as const;

type Locale = keyof typeof copy;
type DisplayStatus = EventInvitationDeclineStatus | "kept" | "success" | "validation";

export default async function EventInvitationDeclinePage({
  searchParams,
}: {
  searchParams: Promise<{
    locale?: string | string[];
    status?: string | string[];
    token?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const requestedLocale = localeValue(params.locale);
  const requestedStatus = firstValue(params.status);
  const token = firstValue(params.token);
  const fallbackLocale = requestedLocale || await getRequestLocaleFallback();

  if (requestedStatus === "success" || requestedStatus === "kept") {
    return <StatusCard locale={fallbackLocale} status={requestedStatus} />;
  }

  if (!token) return <StatusCard locale={fallbackLocale} status="invalid" />;

  const resolution = await resolveEventInvitationDeclineToken(token);
  const locale = resolution.locale || fallbackLocale;
  if (resolution.status !== "valid" || !resolution.context) {
    const status = resolution.status === "valid" ? "unavailable" : resolution.status;
    return <StatusCard locale={locale} status={status} />;
  }

  const validation = requestedStatus === "validation" || requestedStatus === "retry"
    ? requestedStatus
    : null;
  const text = copy[locale];
  const context = resolution.context;
  const reasons = Object.entries(text.reasons).filter(([reason]) =>
    reason === "event_type_not_interested"
      ? context.memberStatus === "pending"
      : isEventInvitationDeclineReasonForFormat(reason, context.eventFormat)
  );

  return (
    <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center gap-5 text-center">
          <PublicInvitationLogo className="w-44" priority />
          <div className="grid gap-2">
            <div className="flex items-center justify-center gap-2 text-ocean-blue">
              <XCircle aria-hidden="true" className="h-5 w-5" />
              <CardTitle>{text.title}</CardTitle>
            </div>
            <p className="text-sm leading-6 text-muted">{text.description}</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <EventSummary context={context} locale={locale} />
          <form action="/event-invitation/decline/confirm" className="grid gap-5" method="post">
            <input name="locale" type="hidden" value={locale} />
            <input name="token" type="hidden" value={token} />
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold text-wine-burgundy">
                {text.reason}
              </legend>
              {reasons.map(([value, label]) => (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine-burgundy/10 bg-white p-3 text-sm font-semibold text-wine-burgundy transition has-[:checked]:border-lipstick-red/40 has-[:checked]:bg-blush-pink hover:bg-blush-pink/60"
                  key={value}
                >
                  <input
                    className="mt-0.5 h-4 w-4 shrink-0 accent-lipstick-red"
                    name="reason"
                    required
                    type="radio"
                    value={value}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
              {text.details}
              <Textarea
                className="min-h-24 resize-none font-normal"
                maxLength={500}
                name="details"
                placeholder={text.detailsPlaceholder}
              />
            </label>
            {validation ? (
              <p className="text-sm font-semibold text-red-700" role="alert">
                {validation === "validation" ? text.validation : text.retry}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild className="w-full" size="lg" variant="secondary">
                <Link href={`/event-invitation/decline?status=kept&locale=${locale}`}>
                  {text.keep}
                </Link>
              </Button>
              <Button className="w-full" size="lg" type="submit" variant="destructive">
                {text.send}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function EventSummary({ context, locale }: {
  context: EventInvitationDeclineContext;
  locale: Locale;
}) {
  const text = copy[locale];
  return (
    <div className="grid gap-3 rounded-xl border border-wine-burgundy/10 bg-white/70 p-4 text-sm text-wine-burgundy">
      <p className="font-display text-lg font-extrabold">
        {text.format[context.eventFormat]}
      </p>
      <p className="flex items-start gap-2">
        <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ocean-blue" />
        <span>{formatEventDate(context.startsAt, context.timezone, locale)}</span>
      </p>
      <p className="flex items-start gap-2">
        <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ocean-blue" />
        <span>{context.city}</span>
      </p>
    </div>
  );
}

function StatusCard({ locale, status }: { locale: Locale; status: Exclude<DisplayStatus, "valid" | "validation"> }) {
  const text = copy[locale];
  const successful = status === "success" || status === "kept" || status === "already_declined";
  const title = status === "success"
    ? text.successTitle
    : status === "kept"
      ? text.keptTitle
      : text[`${status}Title`];
  const message = text[status];

  return (
    <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center gap-5">
          <PublicInvitationLogo className="w-44" priority />
          <div className="flex items-center justify-center gap-2 text-ocean-blue">
            {status === "success" ? (
              <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
            ) : successful ? (
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            ) : (
              <XCircle aria-hidden="true" className="h-5 w-5" />
            )}
            <CardTitle>{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted">{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}

function formatEventDate(value: string, timezone: string, locale: Locale) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
  }
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() || "" : value?.trim() || "";
}

function localeValue(value: string | string[] | undefined): Locale | null {
  const locale = firstValue(value);
  return locale === "en" || locale === "es" ? locale : null;
}
