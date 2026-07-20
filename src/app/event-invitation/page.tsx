import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Heart,
  Info,
  Languages,
  MapPin,
  UsersRound,
  VenusAndMars,
} from "lucide-react";

import { PendingEventInvitationActions } from "@/components/forms/pending-event-invitation-actions";
import { SupportQuestionDialog } from "@/components/forms/support-question-dialog";
import { PublicInvitationLogo } from "@/components/public-invitation-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverTooltip } from "@/components/ui/hover-tooltip";
import {
  getPublicInvitationSession,
  getPublicPaymentResult,
  readEventInvitationSessionToken,
  resolveInternalInvitationSession,
} from "@/lib/event-invitations";
import { getEventGenderBalanceMessage } from "@/lib/event-gender-balance";
import { getDictionary, profileOptionLabel } from "@/lib/i18n/dictionaries";
import { languageFlag } from "@/lib/i18n/locales";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
import type { PublicEventPaymentResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { robots: { follow: false, index: false } };

const copy = {
  en: {
    accessDeadline: "The event RSVP deadline has passed and reservations are no longer accepted.",
    accessInvalid: "This invitation link is invalid.",
    accessResent: "This link has expired, so we sent you a new link. Please check your email and click on the last invitation link you received.",
    accessRetry: "This link has expired, but we could not send a new one right now. Reopen this link to try again.",
    accessUnavailable: "This invitation is no longer available.",
    accept: "Join the club and reserve a seat",
    availableCredit: "Your joining credit remains available for another event.",
    decline: "I’m not interested",
    declineDescription:
      "Tell us why. It helps us understand which events could work better for you.",
    declineDetails: "Anything else you’d like us to know? (optional)",
    declineDetailsPlaceholder: "For example, what kind of event would interest you?",
    declineReason: "Why aren’t you interested?",
    declineSubmit: "Send response",
    declining: "Sending…",
    deadline: (value: string) => `Respond by ${value} to reserve your seat`,
    error: "Something went wrong. Please try again.",
    feedbackMaybe: "Maybe next time.",
    feedbackOptOut: "We will no longer send you invitations to our events.",
    feedbackThanks: "Thanks for the feedback.",
    eventLocation: (format: string, city: string | null) => city
      ? { prefix: `${format} in`, value: city }
      : { prefix: "", value: `${format} — city to be confirmed` },
    format: { brunch: "Brunch", dinner: "Dinner", other: "Event" },
    groupProfile: (capacity: number, min: number | null, max: number | null) =>
      min && max ? `Max ${capacity} people, ages ${min}–${max}` : `Max ${capacity} people`,
    imageAlt: {
      brunch: "A group of singles sharing brunch around a table",
      dinner: "A group of singles sharing dinner around a table",
    },
    fullAfter:
      "We found a group of people who match your profile. We sent invitations to everyone and final details will be confirmed after everyone reserves their seat",
    intention: (value: string) => `Most people in the group are looking for “${value}”`,
    invitation: "Private event invitation",
    joining: "Joining…",
    keepInvitation: "Keep my invitation",
    language: (value: string) => ({
      prefix: "Event in",
      value: value === "es" ? "Spanish" : "English",
    }),
    login: "Continue to member login",
    paymentCancelled: "Checkout was cancelled. Your invitation remains here.",
    paymentFailed: "We could not verify this payment. Please try again or contact the club team.",
    paymentPending: "Your payment is still processing. This page will reflect the result once Stripe confirms it.",
    preference:
      "You can complete your application and join the club by paying the one-time 15 EUR membership fee which includes this event.",
    venueDisclaimer: "Venue and address will be announced on Thursday.",
    reasons: {
      event_type_not_interested: "I’m not interested in this kind of events",
      weekend_unavailable: "I cannot make it this weekend",
      prefers_sunday_brunch: "I would prefer Sunday brunches instead",
      event_fit: "This event isn't a good fit for me",
      other_commitment: "Something else",
    },
    seatConfirmed: "Your payment is complete and your seat is reserved.",
    title: (format: string) => `Singles ${format.toLocaleLowerCase("en-GB")} this weekend`,
    waitlisted: "Your payment is complete. You are priority-waitlisted and your credit has not been spent.",
    balanceWaitlisted:
      "Your payment is complete. We reserved your joining credit while we wait for one more person to balance the group. Your seat will be reserved automatically when they join, or we’ll return the credit.",
    paymentHoldExpiredWaitlisted:
      "Your payment is complete. The 10-minute seat hold expired before checkout finished, but your original application priority is retained and your joining credit is still available.",
  },
  es: {
    accessDeadline: "El plazo de confirmación del evento ha terminado y ya no se aceptan reservas.",
    accessInvalid: "Este enlace de invitación no es válido.",
    accessResent: "Este enlace ha caducado, así que te hemos enviado uno nuevo. Revisa tu email y haz clic en el último enlace de invitación que hayas recibido.",
    accessRetry: "Este enlace ha caducado, pero ahora mismo no hemos podido enviarte uno nuevo. Vuelve a abrir este enlace para intentarlo de nuevo.",
    accessUnavailable: "Esta invitación ya no está disponible.",
    accept: "Únete al club y reserva una plaza",
    availableCredit: "Tu crédito de bienvenida sigue disponible para otro evento.",
    decline: "No me interesa",
    declineDescription:
      "Cuéntanos por qué. Nos ayuda a entender qué eventos podrían interesarte más.",
    declineDetails: "¿Quieres contarnos algo más? (opcional)",
    declineDetailsPlaceholder: "Por ejemplo, ¿qué tipo de evento te interesaría?",
    declineReason: "¿Por qué no te interesa?",
    declineSubmit: "Enviar respuesta",
    declining: "Enviando…",
    deadline: (value: string) => `Responde antes del ${value} para reservar tu plaza`,
    error: "Algo ha fallado. Inténtalo de nuevo.",
    feedbackMaybe: "Quizás la próxima vez.",
    feedbackOptOut: "Ya no te enviaremos invitaciones a nuestros eventos.",
    feedbackThanks: "Gracias por tus comentarios.",
    eventLocation: (format: string, city: string | null) => city
      ? { prefix: `${format} en`, value: city }
      : { prefix: "", value: `${format} — ciudad por confirmar` },
    format: { brunch: "Brunch", dinner: "Cena", other: "Evento" },
    groupProfile: (capacity: number, min: number | null, max: number | null) =>
      min && max
        ? `Máximo ${capacity} personas, edades ${min}–${max}`
        : `Máximo ${capacity} personas`,
    imageAlt: {
      brunch: "Un grupo de solteros compartiendo un brunch alrededor de una mesa",
      dinner: "Un grupo de solteros compartiendo una cena alrededor de una mesa",
    },
    fullAfter:
      "Encontramos un grupo de personas que encajan con tu perfil. Enviamos invitaciones a todos y confirmaremos los detalles finales cuando todos reserven su plaza",
    intention: (value: string) => `La mayoría de las personas del grupo busca «${value}»`,
    invitation: "Invitación privada a un evento",
    joining: "Uniéndote…",
    keepInvitation: "Conservar mi invitación",
    language: (value: string) => ({
      prefix: "Evento en",
      value: value === "es" ? "español" : "inglés",
    }),
    login: "Continuar al acceso de miembros",
    paymentCancelled: "Has cancelado el pago. Tu invitación sigue disponible aquí.",
    paymentFailed: "No hemos podido verificar el pago. Inténtalo de nuevo o contacta con el equipo.",
    paymentPending: "Tu pago sigue procesándose. Esta página mostrará el resultado cuando Stripe lo confirme.",
    preference:
      "Puedes completar tu solicitud y unirte al club pagando la cuota única de membresía de 15 EUR, que incluye este evento.",
    venueDisclaimer: "El lugar y la dirección se anunciarán el jueves.",
    reasons: {
      event_type_not_interested: "No me interesan este tipo de eventos",
      weekend_unavailable: "No puedo asistir este fin de semana",
      prefers_sunday_brunch: "Preferiría los brunches de los domingos",
      event_fit: "Este evento no encaja conmigo",
      other_commitment: "Otro motivo",
    },
    seatConfirmed: "Tu pago está completo y tu plaza está reservada.",
    title: (format: string) => `${format} para solteros este fin de semana`,
    waitlisted: "Tu pago está completo. Estás en la lista de espera prioritaria y tu crédito no se ha gastado.",
    balanceWaitlisted:
      "Tu pago está completo. Hemos reservado tu crédito de bienvenida mientras esperamos a una persona más para equilibrar el grupo. Tu plaza se reservará automáticamente cuando se una o te devolveremos el crédito.",
    paymentHoldExpiredWaitlisted:
      "Tu pago está completo. La reserva de plaza de 10 minutos caducó antes de terminar el proceso, pero conservas la prioridad original de tu solicitud y tu crédito de bienvenida sigue disponible.",
  },
} as const;

export default async function EventInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string; payment?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  if (params.payment === "success" && params.session_id) {
    redirect(
      `/event-invitation/complete?session_id=${encodeURIComponent(params.session_id)}`,
    );
  }

  const cookieStore = await cookies();
  const requestLocale = await getRequestLocaleFallback();
  const sessionToken = readEventInvitationSessionToken(cookieStore);
  const internalSession = await resolveInternalInvitationSession(sessionToken);
  const invitation = await getPublicInvitationSession(sessionToken);
  const locale = invitation?.locale || requestLocale;
  const text = copy[locale];
  const supportCopy = getDictionary(locale).actions.support;
  let paymentResult: PublicEventPaymentResult | null = null;

  if (params.payment === "pending" && params.session_id) {
    paymentResult = await getPublicPaymentResult(sessionToken, params.session_id);
  }

  if (
    internalSession?.membershipStatus === "active"
    && params.payment !== "session_failed"
  ) {
    redirect("/event-invitation/complete");
  }

  if (!invitation || params.access === "deadline") {
    const accessMessage = params.access === "deadline"
      ? text.accessDeadline
      : params.access === "resent"
        ? text.accessResent
        : params.access === "retry"
          ? text.accessRetry
          : params.access === "unavailable"
            ? text.accessUnavailable
            : text.accessInvalid;
    return (
      <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="justify-items-center">
            <PublicInvitationLogo className="mx-auto w-44" priority />
            <CardTitle>{text.invitation}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-sm leading-6 text-muted">{accessMessage}</p></CardContent>
        </Card>
      </main>
    );
  }

  if (invitation.invitation.responseStatus === "declined") {
    const confirmation = invitation.invitation.declineReason === "event_type_not_interested"
      ? text.feedbackOptOut
      : text.feedbackMaybe;
    return (
      <main className="grid min-h-screen place-items-center bg-blush-pink px-4 py-10">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="justify-items-center gap-5">
            <PublicInvitationLogo className="mx-auto w-44" priority />
            <div className="grid gap-2">
              <CardTitle>{text.feedbackThanks}</CardTitle>
              <CardDescription className="text-base leading-7">
                {confirmation}
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const event = invitation.event;
  const eventImage = event.eventFormat === "brunch"
    ? { alt: text.imageAlt.brunch, src: "/events/event-brunch.webp" }
    : event.eventFormat === "dinner"
      ? { alt: text.imageAlt.dinner, src: "/events/event-dinner.webp" }
      : null;
  const eventLanguage = event.languageCode || locale;
  const eventLocation = text.eventLocation(text.format[event.eventFormat], event.city);
  const eventCountry = eventCountryDetails(event.timezone, locale);
  const eventLanguageLabel = text.language(eventLanguage);
  const genderBalanceMessage = getEventGenderBalanceMessage(
    event.genderBalanceEnabled,
    locale,
  );
  const hasSecondaryFacts = Boolean(genderBalanceMessage || event.majorityIntention);
  const eventDate = formatEventDate(event.startsAt, event.timezone, locale);
  const deadline = formatEventDate(event.rsvpDeadlineAt, event.timezone, locale);
  return (
    <main className="min-h-screen bg-blush-pink px-4 py-8 sm:py-12">
      <div className="mx-auto grid max-w-2xl gap-6">
        {!eventImage ? <PublicInvitationLogo className="w-44" priority /> : null}
        <Card>
          {eventImage ? (
            <div className="relative aspect-[16/9] overflow-hidden rounded-t-lg bg-blush-pink">
              <Image
                alt={eventImage.alt}
                className="object-cover object-center"
                fill
                preload
                sizes="(max-width: 704px) calc(100vw - 2rem), 672px"
                src={eventImage.src}
              />
              <PublicInvitationLogo
                className="absolute left-4 top-4 z-10 w-28 sm:left-5 sm:top-5 sm:w-36"
                imageClassName="brightness-0 invert drop-shadow-[0_2px_8px_rgba(0,0,0,0.28)]"
                priority
              />
            </div>
          ) : null}
          <CardHeader>
            <Badge className="w-fit" variant="wine-burgundy">{text.invitation}</Badge>
            <CardTitle className="font-display text-3xl font-black text-wine-burgundy">
              {text.title(text.format[event.eventFormat])}
            </CardTitle>
            <CardDescription>{text.fullAfter}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {paymentResult ? <PaymentNotice copy={text} result={paymentResult} /> : null}
            {params.payment === "cancelled" ? (
              <p className="rounded-lg bg-blush-pink p-3 text-sm font-semibold text-muted">{text.paymentCancelled}</p>
            ) : null}
            {["failed", "session_failed"].includes(params.payment || "") ? (
              <p className="rounded-lg bg-blush-pink p-3 text-sm font-semibold text-muted">{text.paymentFailed}</p>
            ) : null}
            <dl className={`grid gap-3 ${hasSecondaryFacts ? "sm:grid-cols-2" : ""}`}>
              <div className="grid gap-3 sm:h-full sm:grid-rows-4">
                <Fact
                  icon={<MapPin className="h-5 w-5 shrink-0" />}
                  label={(
                    <FlaggedLabel
                      flag={event.city ? eventCountry?.flag : undefined}
                      prefix={eventLocation.prefix}
                      trailing={event.city ? <InfoTooltip label={text.venueDisclaimer} /> : undefined}
                      tooltip={event.city ? eventCountry?.label : undefined}
                      value={eventLocation.value}
                    />
                  )}
                />
                <Fact
                  icon={<UsersRound className="h-5 w-5 shrink-0" />}
                  label={text.groupProfile(event.capacity, event.ageRange.min, event.ageRange.max)}
                />
                <Fact
                  icon={<CalendarDays className="h-5 w-5 shrink-0" />}
                  label={eventDate}
                />
                <Fact
                  icon={<Languages className="h-5 w-5 shrink-0" />}
                  label={(
                    <FlaggedLabel
                      flag={languageFlag(eventLanguage)}
                      prefix={eventLanguageLabel.prefix}
                      tooltip={eventLanguageLabel.value}
                      value={eventLanguageLabel.value}
                    />
                  )}
                />
              </div>
              {hasSecondaryFacts ? (
                <div className="grid gap-3 sm:h-full sm:grid-rows-2">
                  {genderBalanceMessage ? (
                    <Fact
                      alignTop
                      className={event.majorityIntention ? "" : "sm:row-span-2"}
                      icon={<VenusAndMars className="mt-0.5 h-5 w-5 shrink-0" />}
                      label={genderBalanceMessage}
                    />
                  ) : null}
                  {event.majorityIntention ? (
                    <Fact
                      alignTop
                      className={genderBalanceMessage ? "" : "sm:row-span-2"}
                      icon={<Heart className="mt-0.5 h-5 w-5 shrink-0" />}
                      label={text.intention(
                        profileOptionLabel(event.majorityIntention, locale).toLocaleLowerCase(
                          locale === "es" ? "es-ES" : "en-GB",
                        ),
                      )}
                    />
                  ) : null}
                </div>
              ) : null}
            </dl>
            <p className="flex items-start gap-2 rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-4 text-sm font-semibold leading-6 text-ocean-blue">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
              {text.deadline(deadline)}
            </p>
            {event.preferenceNudge ? (
              <p className="mx-auto w-full max-w-lg text-center text-sm leading-6 text-muted">
                {text.preference}
              </p>
            ) : null}
            {invitation.canApply ? (
              <PendingEventInvitationActions copy={{
                accept: text.accept,
                decline: text.decline,
                declineDescription: text.declineDescription,
                declineDetails: text.declineDetails,
                declineDetailsPlaceholder: text.declineDetailsPlaceholder,
                declineReason: text.declineReason,
                declineSubmit: text.declineSubmit,
                declining: text.declining,
                error: text.error,
                joining: text.joining,
                keepInvitation: text.keepInvitation,
                paymentCancelled: text.paymentCancelled,
                reasons: text.reasons,
              }} />
            ) : null}
            {paymentResult?.ok || invitation.invitation.seatStatus === "confirmed" ? (
              <Button asChild><Link href="/event-invitation/complete">{text.login}</Link></Button>
            ) : null}
            <SupportQuestionDialog
              copy={supportCopy}
              locale={locale}
              useInvitationEmail
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Fact({
  alignTop = false,
  className = "",
  icon,
  label,
}: {
  alignTop?: boolean;
  className?: string;
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <div
      className={`flex ${alignTop ? "items-start" : "items-center"} gap-2 rounded-lg bg-blush-pink p-3 text-sm font-semibold text-wine-burgundy ${className}`}
    >
      {icon}
      {label}
    </div>
  );
}

function FlaggedLabel({
  flag,
  prefix,
  trailing,
  tooltip,
  value,
}: {
  flag?: string;
  prefix: string;
  trailing?: React.ReactNode;
  tooltip?: string;
  value: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {prefix ? <span>{prefix}</span> : null}
      {flag && tooltip ? (
        <span
          aria-label={tooltip}
          className="group relative inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/40 focus-visible:ring-offset-2"
          tabIndex={0}
        >
          <span aria-hidden="true" className="text-xl leading-none">{flag}</span>
          <HoverTooltip>{tooltip}</HoverTooltip>
        </span>
      ) : null}
      <span>{value}</span>
      {trailing}
    </span>
  );
}

function InfoTooltip({ label }: { label: string }) {
  return (
    <span
      aria-label={label}
      className="group relative inline-flex cursor-help rounded-full outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/40 focus-visible:ring-offset-2"
      tabIndex={0}
    >
      <Info aria-hidden="true" className="h-4 w-4 text-ocean-blue" />
      <HoverTooltip className="w-56 whitespace-normal text-left leading-4 sm:w-64">
        {label}
      </HoverTooltip>
    </span>
  );
}

function eventCountryDetails(timezone: string, locale: "en" | "es") {
  if (["Europe/Madrid", "Atlantic/Canary"].includes(timezone)) {
    return { flag: "🇪🇸", label: locale === "es" ? "España" : "Spain" };
  }
  if (["Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira"].includes(timezone)) {
    return { flag: "🇵🇹", label: "Portugal" };
  }
  return null;
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
      ? result.waitlistReason === "balance"
        ? text.balanceWaitlisted
        : result.waitlistReason === "payment_hold_expired"
          ? text.paymentHoldExpiredWaitlisted
          : text.waitlisted
      : result.status === "payment_pending"
        ? text.paymentPending
        : text.paymentFailed;
  return (
    <div className="rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-4 text-sm font-semibold leading-6 text-ocean-blue">
      <p>{message}</p>
      {result.creditAvailable &&
      result.status === "waitlisted" &&
      result.waitlistReason !== "payment_hold_expired" ? (
        <p>{text.availableCredit}</p>
      ) : null}
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
