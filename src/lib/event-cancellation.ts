import type { Locale } from "@/lib/i18n/locales";

export const eventCancellationReasons = [
  "illness",
  "schedule_changed",
  "no_longer_interested",
  "something_else",
] as const;

export type EventCancellationReason = (typeof eventCancellationReasons)[number];

export type EventCancellationCreditOutcome =
  | "not_spent"
  | "refunded"
  | "replacement_pending";

export function isEventCancellationReason(
  value: string,
): value is EventCancellationReason {
  return (eventCancellationReasons as readonly string[]).includes(value);
}

export function eventCancellationReasonLabel(
  value: string,
  locale: Locale,
) {
  const labels: Record<EventCancellationReason, Record<Locale, string>> = {
    illness: { en: "Not feeling well", es: "No me encuentro bien" },
    no_longer_interested: {
      en: "No longer interested in this event",
      es: "Ya no me interesa este evento",
    },
    schedule_changed: { en: "My plans changed", es: "Han cambiado mis planes" },
    something_else: { en: "Something else", es: "Otro motivo" },
  };

  return isEventCancellationReason(value)
    ? labels[value][locale]
    : locale === "es" ? "Otro motivo" : "Another reason";
}

export function eventCancellationOutcomeLabel(
  value: string,
  locale: Locale,
) {
  if (value === "replacement_pending") {
    return locale === "es"
      ? "Tu crédito sigue asignado mientras buscamos a alguien que ocupe tu plaza. Si confirmamos un reemplazo, te lo devolveremos automáticamente y te avisaremos por email. Si no lo encontramos, te escribiremos seis horas antes del evento y todavía podrás asistir."
      : "Your credit stays assigned while we look for someone to take your place. If we confirm a replacement, we will return it automatically and email you. If we cannot find one, we will let you know six hours before the event, and you can still attend.";
  }
  if (value === "refunded") {
    return locale === "es"
      ? "El crédito reservado para esta plaza se ha devuelto automáticamente a tu cuenta."
      : "The credit reserved for this place has been returned to your account automatically.";
  }
  return locale === "es"
    ? "Te hemos quitado de la lista de espera. No se utilizó ningún crédito."
    : "We have removed you from the waitlist. No credit was used.";
}
