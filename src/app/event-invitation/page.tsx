import Link from "next/link";
import { cookies } from "next/headers";
import { CalendarDays, Clock3, Languages, MapPin, UsersRound } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { PendingEventInvitationActions } from "@/components/forms/pending-event-invitation-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reconcileEventMembershipCheckout } from "@/lib/event-membership-payments";
import {
  eventInvitationSessionCookie,
  getPublicInvitationSession,
  getPublicPaymentResult,
  resolveInternalInvitationSession,
} from "@/lib/event-invitations";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
import type { PublicEventPaymentResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { robots: { follow: false, index: false } };

const copy = {
  en: {
    accessInvalid: "This invitation link is invalid or has expired. Ask the club team for a fresh invitation.",
    accept: "Accept and join the club",
    ageRange: (min: number, max: number) => `Mostly ages ${min}–${max}`,
    availableCredit: "Your joining credit remains available for another event.",
    cityPending: "City to be confirmed",
    credit: (count: number) => `${count} joining credit${count === 1 ? "" : "s"} for this seat`,
    decline: "I can’t make it",
    declineDetails: "Anything else? (optional)",
    declineReason: "Why can’t you join?",
    deadline: "Respond by",
    error: "Something went wrong. Please try again.",
    format: { brunch: "Brunch", dinner: "Dinner", other: "Event" },
    fullAfter: "Restaurant and host details are shared only after the founders confirm the event.",
    intention: "Most people in this proposed group are looking for",
    invitation: "Private event invitation",
    language: (value: string) => `Hosted in ${value === "es" ? "Spanish" : "English"}`,
    login: "Continue to member login",
    paymentCancelled: "Checkout was cancelled. Your invitation remains here.",
    paymentFailed: "We could not verify this payment. Please try again or contact the club team.",
    paymentPending: "Your payment is still processing. This page will reflect the result once Stripe confirms it.",
    preference: "You can finish your event preferences after activating membership.",
    reasons: {
      event_fit: "This event isn’t the right fit",
      other_commitment: "I have another commitment",
      prefer_not_to_say: "Prefer not to say",
      prefers_sunday_brunch: "I would prefer Sunday brunch",
      weekend_unavailable: "I’m unavailable that weekend",
    },
    saving: "Saving…",
    seatConfirmed: "Your payment is complete and your seat is confirmed.",
    title: "A table is taking shape",
    waitlisted: "Your payment is complete. You are priority-waitlisted and your credit has not been spent.",
  },
  es: {
    accessInvalid: "Este enlace de invitación no es válido o ha caducado. Pide al equipo un enlace nuevo.",
    accept: "Aceptar y unirme al club",
    ageRange: (min: number, max: number) => `Principalmente entre ${min} y ${max} años`,
    availableCredit: "Tu crédito de bienvenida sigue disponible para otro evento.",
    cityPending: "Ciudad por confirmar",
    credit: (count: number) => `${count} crédito${count === 1 ? "" : "s"} de bienvenida para esta plaza`,
    decline: "No puedo asistir",
    declineDetails: "¿Algo más? (opcional)",
    declineReason: "¿Por qué no puedes asistir?",
    deadline: "Responde antes del",
    error: "Algo ha fallado. Inténtalo de nuevo.",
    format: { brunch: "Brunch", dinner: "Cena", other: "Evento" },
    fullAfter: "El restaurante y el host se comparten cuando los fundadores confirman el evento.",
    intention: "La mayoría de este grupo propuesto busca",
    invitation: "Invitación privada a un evento",
    language: (value: string) => `El evento será en ${value === "es" ? "español" : "inglés"}`,
    login: "Continuar al acceso de miembros",
    paymentCancelled: "Has cancelado el pago. Tu invitación sigue disponible aquí.",
    paymentFailed: "No hemos podido verificar el pago. Inténtalo de nuevo o contacta con el equipo.",
    paymentPending: "Tu pago sigue procesándose. Esta página mostrará el resultado cuando Stripe lo confirme.",
    preference: "Podrás completar tus preferencias de eventos después de activar la membresía.",
    reasons: {
      event_fit: "Este evento no encaja conmigo",
      other_commitment: "Tengo otro compromiso",
      prefer_not_to_say: "Prefiero no decirlo",
      prefers_sunday_brunch: "Preferiría un brunch el domingo",
      weekend_unavailable: "No estoy disponible ese fin de semana",
    },
    saving: "Guardando…",
    seatConfirmed: "Tu pago está completo y tu plaza está confirmada.",
    title: "Una mesa está tomando forma",
    waitlisted: "Tu pago está completo. Estás en la lista de espera prioritaria y tu crédito no se ha gastado.",
  },
} as const;

export default async function EventInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string; payment?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const requestLocale = await getRequestLocaleFallback();
  const sessionToken = cookieStore.get(eventInvitationSessionCookie)?.value || "";
  const internalSession = await resolveInternalInvitationSession(sessionToken);
  let invitation = await getPublicInvitationSession(sessionToken);
  const locale = invitation?.locale || requestLocale;
  const text = copy[locale];
  let paymentResult: PublicEventPaymentResult | null = null;

  if (internalSession && params.payment === "success" && params.session_id) {
    const sync = await reconcileEventMembershipCheckout(
      params.session_id,
      internalSession.invitationId,
    );
    paymentResult = sync.result || await getPublicPaymentResult(sessionToken, params.session_id);
    invitation = await getPublicInvitationSession(sessionToken);
  }

  if (!invitation) {
    return (
      <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
        <Card className="w-full max-w-xl">
          <CardHeader><BrandLogo className="w-44" priority /><CardTitle>{text.invitation}</CardTitle></CardHeader>
          <CardContent><p className="text-sm leading-6 text-muted">{text.accessInvalid}</p></CardContent>
        </Card>
      </main>
    );
  }

  const event = invitation.event;
  const eventDate = formatEventDate(event.startsAt, event.timezone, locale);
  const deadline = formatEventDate(event.rsvpDeadlineAt, event.timezone, locale);
  const loginNext = paymentResult?.loginNext || `/events/${event.id}`;

  return (
    <main className="min-h-screen bg-blush-pink px-4 py-8 sm:py-12">
      <div className="mx-auto grid max-w-2xl gap-6">
        <BrandLogo className="w-44" priority />
        <Card>
          <CardHeader>
            <Badge className="w-fit" variant="wine-burgundy">{text.invitation}</Badge>
            <CardTitle className="font-display text-3xl font-black text-wine-burgundy">{text.title}</CardTitle>
            <CardDescription>{text.fullAfter}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {paymentResult ? <PaymentNotice copy={text} result={paymentResult} /> : null}
            {params.payment === "cancelled" ? (
              <p className="rounded-lg bg-blush-pink p-3 text-sm font-semibold text-muted">{text.paymentCancelled}</p>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact icon={<CalendarDays className="h-4 w-4" />} label={eventDate} />
              <Fact icon={<MapPin className="h-4 w-4" />} label={event.city || text.cityPending} />
              <Fact icon={<Languages className="h-4 w-4" />} label={text.language(event.languageCode || locale)} />
              <Fact icon={<UsersRound className="h-4 w-4" />} label={text.format[event.eventFormat]} />
              {event.ageRange.min && event.ageRange.max ? (
                <Fact icon={<UsersRound className="h-4 w-4" />} label={text.ageRange(event.ageRange.min, event.ageRange.max)} />
              ) : null}
              <Fact icon={<Clock3 className="h-4 w-4" />} label={`${text.deadline} ${deadline}`} />
            </dl>
            {event.majorityIntention ? (
              <p className="rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-4 text-sm leading-6 text-ocean-blue">
                {text.intention} {event.majorityIntention}.
              </p>
            ) : null}
            <div className="grid gap-1 text-sm text-muted">
              <p>{text.credit(event.creditCost)}</p>
              {event.preferenceNudge ? <p>{text.preference}</p> : null}
            </div>
            {invitation.canApply && invitation.invitation.responseStatus !== "declined" ? (
              <PendingEventInvitationActions copy={{
                accept: text.accept,
                decline: text.decline,
                declineDetails: text.declineDetails,
                declineReason: text.declineReason,
                error: text.error,
                reasons: text.reasons,
                saving: text.saving,
              }} />
            ) : null}
            {paymentResult?.ok || invitation.invitation.seatStatus === "confirmed" ? (
              <Button asChild><Link href={`/login?next=${encodeURIComponent(loginNext)}`}>{text.login}</Link></Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Fact({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex items-center gap-2 rounded-lg bg-blush-pink p-3 text-sm font-semibold text-wine-burgundy">{icon}{label}</div>;
}

function PaymentNotice({
  copy: text,
  result,
}: {
  copy: (typeof copy)["en"] | (typeof copy)["es"];
  result: PublicEventPaymentResult;
}) {
  const message = result.status === "confirmed"
    ? text.seatConfirmed
    : result.status === "waitlisted"
      ? text.waitlisted
      : result.status === "payment_pending"
        ? text.paymentPending
        : text.paymentFailed;
  return (
    <div className="rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-4 text-sm font-semibold leading-6 text-ocean-blue">
      <p>{message}</p>
      {result.creditAvailable && result.status === "waitlisted" ? <p>{text.availableCredit}</p> : null}
    </div>
  );
}

function formatEventDate(value: string, timezone: string, locale: "en" | "es") {
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
