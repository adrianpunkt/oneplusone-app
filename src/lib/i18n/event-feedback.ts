import type { EventFeedbackCopy } from "@/components/forms/event-feedback-form";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export const eventFeedbackPageCopy = {
  en: {
    backToEvents: "Back to events",
    description:
      "We’d love to hear about your experience. Please answer the questions below to unlock messaging and connect with the other members from this event. Thank you!",
    form: {
      attendance: "Did you attend the event?",
      yes: "Yes",
      no: "No",
      nonattendance: "What stopped you from attending?",
      overall: "How would you rate your overall experience?",
      overallLow: "Poor",
      overallHigh: "Excellent",
      compatibility: "How compatible did you feel with your group?",
      compatibilityLow: "Not at all",
      compatibilityHigh: "Very compatible",
      questions: "How much did you enjoy the question rounds?",
      questionsLow: "Not at all",
      questionsHigh: "Loved them",
      restaurant:
        "How would you rate the restaurant? (food, atmosphere, service)",
      restaurantLow: "Poor",
      restaurantHigh: "Excellent",
      host: "How would you rate your host?",
      hostLow: "Poor",
      hostHigh: "Excellent",
      connections:
        "Would you like to connect with any other member from this event?",
      comments: "Anything else you'd like to share? (optional)",
      saving: "Saving…",
      submit: "Submit feedback",
    },
    title: "Event feedback",
  },
  es: {
    backToEvents: "Volver a eventos",
    description:
      "Nos encantaría conocer tu experiencia. Responde a las preguntas a continuación para desbloquear los mensajes y conectar con los demás miembros de este evento. ¡Gracias!",
    form: {
      attendance: "¿Asististe al evento?",
      yes: "Sí",
      no: "No",
      nonattendance: "¿Qué te impidió asistir?",
      overall: "¿Cómo valorarías tu experiencia en general?",
      overallLow: "mala",
      overallHigh: "excelente",
      compatibility: "¿Qué tan compatible te sentiste con el grupo?",
      compatibilityLow: "nada compatible",
      compatibilityHigh: "muy compatible",
      questions: "¿Cuánto disfrutaste las rondas de preguntas?",
      questionsLow: "nada",
      questionsHigh: "me encantaron",
      restaurant:
        "¿Cómo valorarías el restaurante? (comida, ambiente, servicio)",
      restaurantLow: "malo",
      restaurantHigh: "excelente",
      host: "¿Cómo valorarías a tu anfitrión/a?",
      hostLow: "mal",
      hostHigh: "excelente",
      connections:
        "¿Te gustaría conectar con alguna otra persona de este evento?",
      comments: "¿Algo más que quieras compartir? (opcional)",
      saving: "Guardando…",
      submit: "Enviar valoración",
    },
    title: "Valoración del evento",
  },
} as const;

export function getEventFeedbackFormCopy(
  locale: Locale,
  dictionary: Dictionary,
): EventFeedbackCopy {
  return {
    ...eventFeedbackPageCopy[locale].form,
    nonattendanceOtherLabel: dictionary.actions.cancellationDetailsLabel,
    nonattendanceOtherPlaceholder:
      dictionary.actions.cancellationDetailsPlaceholder,
    nonattendanceReasons: {
      eventNotAppealing:
        dictionary.actions.cancellationReasons.noLongerInterested,
      illness: dictionary.actions.cancellationReasons.illness,
      other: dictionary.actions.cancellationReasons.somethingElse,
      scheduleChange: dictionary.actions.cancellationReasons.scheduleChanged,
    },
  };
}
