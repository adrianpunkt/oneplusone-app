import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CalendarDays, Clock3, Languages, MapPinned, UsersRound } from "lucide-react";

import { AddToCalendarButton } from "@/components/app/add-to-calendar-button";
import { EventLanguage } from "@/components/app/event-language";
import { EventLocation } from "@/components/app/event-location";
import {
  InvitationDecisionForms,
} from "@/components/forms/invitation-actions";
import { EventFeedbackForm } from "@/components/forms/event-feedback-form";
import { StartConversationForm } from "@/components/forms/start-conversation-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getCreditBalance, getEventDetail, getPreferences } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import type { Locale } from "@/lib/i18n/locales";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusLabels: Record<Locale, Record<string, string>> = {
  en: {},
  es: {
    cancelled: "cancelado",
    completed: "completado",
    confirmed: "confirmado",
    draft: "borrador",
    inviting: "invitando",
  },
};

const detailCopy = {
  en: {
    addCalendar: "Add to calendar",
    age: "Age range",
    attendees: "Confirmed attendees",
    calendarDescription: "Your one plus one club event",
    creditCost: "Credit cost",
    deadline: "RSVP deadline",
    feedback: "Event feedback",
    feedbackDescription: "Submitting feedback unlocks messaging with your table.",
    format: "Format",
    fullAfter: "Full restaurant and host details are shared after founder confirmation.",
    host: "Your host",
    hostFallback: "A member of your table",
    hostMaterials: "Host materials",
    instructions: "Event instructions",
    intention: "Majority intention",
    preferencesNudge: "Check that your food, timing, and hosting preferences are up to date.",
    preferencesLink: "Review preferences",
    restaurantImage: "Restaurant",
    feedbackForm: {
      comments: "Anything else you want us to know?",
      detail: "Required detail for any one-star rating",
      host: "Host",
      hosting: "Hosting experience",
      overall: "Overall",
      questions: "Conversation questions",
      restaurant: "Restaurant",
      saved: "Feedback saved. Messaging is now available.",
      saving: "Saving…",
      submit: "Submit feedback",
    },
  },
  es: {
    addCalendar: "Añadir al calendario",
    age: "Rango de edad",
    attendees: "Asistentes confirmados",
    calendarDescription: "Tu evento de one plus one club",
    creditCost: "Coste en créditos",
    deadline: "Fecha límite de RSVP",
    feedback: "Valoración del evento",
    feedbackDescription: "Enviar tu valoración desbloquea los mensajes con tu mesa.",
    format: "Formato",
    fullAfter: "El restaurante y el host se comparten después de la confirmación de los fundadores.",
    host: "Tu host",
    hostFallback: "Una persona de tu mesa",
    hostMaterials: "Materiales para el host",
    instructions: "Instrucciones del evento",
    intention: "Intención mayoritaria",
    preferencesNudge: "Comprueba que tus preferencias de comida, horario y host estén al día.",
    preferencesLink: "Revisar preferencias",
    restaurantImage: "Restaurante",
    feedbackForm: {
      comments: "¿Algo más que quieras contarnos?",
      detail: "Detalle obligatorio para cualquier valoración de una estrella",
      host: "Host",
      hosting: "Experiencia como host",
      overall: "General",
      questions: "Preguntas de conversación",
      restaurant: "Restaurante",
      saved: "Valoración guardada. Ya puedes enviar mensajes.",
      saving: "Guardando…",
      submit: "Enviar valoración",
    },
  },
} as const;

function statusLabel(status: string, locale: Locale) {
  return statusLabels[locale][status] || status;
}

async function getRequestTimestamp() {
  await connection();
  return Date.now();
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale, member } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const [eventDetail, creditBalance, preferences, now] = await Promise.all([
    getEventDetail(id, member.id),
    getCreditBalance(member.id),
    getPreferences(member.id),
    getRequestTimestamp(),
  ]);
  const { event, eventAttendees, feedback, host, invitation, isHost, materials, summary } = eventDetail;

  if (!event) notFound();

  const copy = detailCopy[locale];
  const detailsReleased = Boolean(
    event.confirmation_released_at && invitation?.seat_status === "confirmed",
  );
  const eventEnded = event.status === "completed" ||
    new Date(event.ends_at || event.starts_at).getTime() <= now;
  const canMessage = Boolean(feedback && invitation?.seat_status === "confirmed" && eventEnded);
  const title = localizeText(event.title, event.localized_content, locale, "title");
  const description = localizeText(event.description, event.localized_content, locale, "description");
  const memberNotes = localizeText(event.member_notes, event.localized_content, locale, "member_notes");

  return (
    <>
      <section className="grid gap-2">
        <h1 className="font-display text-3xl font-black text-wine-burgundy">
          {title}
        </h1>
        <div className="flex flex-wrap gap-3 text-sm font-semibold text-muted">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-lipstick-red" />
            {formatDateTime(event.starts_at, locale)}
          </span>
          <EventLocation
            event={event}
            pendingTooltip={dictionary.events.venuePendingTooltip}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.events.eventDetails}</CardTitle>
            <CardDescription>{description || dictionary.events.detailsFallback}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!detailsReleased ? (
              <p className="rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-4 text-sm font-semibold leading-6 text-ocean-blue">
                {copy.fullAfter}
              </p>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-blush-pink p-3">
                <dt className="text-xs font-semibold uppercase text-faint">{dictionary.events.venue}</dt>
                <dd className="mt-1 text-sm font-semibold text-wine-burgundy">
                  {detailsReleased ? event.venue_name : dictionary.events.sharedAfterConfirmation}
                </dd>
              </div>
              <div className="rounded-lg bg-blush-pink p-3">
                <dt className="text-xs font-semibold uppercase text-faint">{dictionary.events.status}</dt>
                <dd className="mt-1 text-sm font-semibold capitalize text-wine-burgundy">
                  {statusLabel(event.status, locale)}
                </dd>
              </div>
              {event.language_code ? (
                <div className="rounded-lg bg-blush-pink p-3">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase text-faint">
                    <Languages className="h-3.5 w-3.5" />
                    {dictionary.events.language}
                  </dt>
                  <dd className="mt-1">
                    <EventLanguage
                      className="text-wine-burgundy"
                      languageCode={event.language_code}
                      locale={locale}
                      tooltip={dictionary.events.languageTooltips[event.language_code]}
                    />
                  </dd>
                </div>
              ) : null}
              <div className="rounded-lg bg-blush-pink p-3">
                <dt className="text-xs font-semibold uppercase text-faint">{copy.format}</dt>
                <dd className="mt-1 text-sm font-semibold capitalize text-wine-burgundy">
                  {dictionary.events.formats[event.event_format]}
                </dd>
              </div>
              <div className="rounded-lg bg-blush-pink p-3">
                <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase text-faint"><Clock3 className="h-3.5 w-3.5" />{copy.deadline}</dt>
                <dd className="mt-1 text-sm font-semibold text-wine-burgundy">{formatDateTime(event.rsvp_deadline_at, locale)}</dd>
              </div>
              <div className="rounded-lg bg-blush-pink p-3">
                <dt className="text-xs font-semibold uppercase text-faint">{copy.creditCost}</dt>
                <dd className="mt-1 text-sm font-semibold text-wine-burgundy">{event.credit_cost}</dd>
              </div>
              {summary && summary.ageMin !== null && summary.ageMax !== null ? (
                <div className="rounded-lg bg-blush-pink p-3">
                  <dt className="text-xs font-semibold uppercase text-faint">{copy.age}</dt>
                  <dd className="mt-1 text-sm font-semibold text-wine-burgundy">{summary.ageMin}–{summary.ageMax}</dd>
                </div>
              ) : null}
              {summary?.majorityIntention ? (
                <div className="rounded-lg bg-blush-pink p-3 sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase text-faint">{copy.intention}</dt>
                  <dd className="mt-1 text-sm font-semibold text-wine-burgundy">{summary.majorityIntention}</dd>
                </div>
              ) : null}
              {detailsReleased && summary?.participantCount !== null ? (
                <div className="rounded-lg bg-blush-pink p-3">
                  <dt className="text-xs font-semibold uppercase text-faint">{copy.attendees}</dt>
                  <dd className="mt-1 text-sm font-semibold text-wine-burgundy">{summary?.participantCount}</dd>
                </div>
              ) : null}
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-wine-burgundy/10 p-4 text-sm text-muted">
              <p>{copy.preferencesNudge}</p>
              <Link className="font-semibold text-wine-burgundy underline underline-offset-4" href="/preferences">{copy.preferencesLink}</Link>
            </div>
            {detailsReleased && event.restaurant_image_url ? (
              <div
                aria-label={copy.restaurantImage}
                className="aspect-[16/9] rounded-xl bg-cover bg-center"
                role="img"
                style={{ backgroundImage: `url(${JSON.stringify(event.restaurant_image_url)})` }}
              />
            ) : null}
            {detailsReleased && event.venue_address ? (
              <p className="flex items-start gap-2 rounded-lg bg-blush-pink p-4 text-sm font-semibold text-wine-burgundy">
                <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-lipstick-red" />
                {event.venue_address}
              </p>
            ) : null}
            {detailsReleased && host ? (
              <div className="rounded-lg border border-wine-burgundy/10 p-4">
                <p className="text-xs font-semibold uppercase text-faint">{copy.host}</p>
                <p className="mt-1 font-display text-lg font-extrabold text-wine-burgundy">{host.first_name || copy.hostFallback}</p>
                {host.public_intro ? <p className="mt-2 text-sm leading-6 text-muted">{host.public_intro}</p> : null}
              </div>
            ) : null}
            {detailsReleased && event.event_instructions ? (
              <div className="rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-4">
                <p className="text-xs font-semibold uppercase text-ocean-blue">{copy.instructions}</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ocean-blue">{event.event_instructions}</p>
              </div>
            ) : null}
            {detailsReleased ? (
              <AddToCalendarButton
                copy={{ add: copy.addCalendar, defaultDescription: copy.calendarDescription }}
                event={{
                  description: event.event_instructions || description,
                  endsAt: event.ends_at,
                  id: event.id,
                  location: [event.venue_name, event.venue_address].filter(Boolean).join(", "),
                  startsAt: event.starts_at,
                  title,
                }}
              />
            ) : null}
            {memberNotes ? (
              <p className="rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-4 text-sm leading-6 text-ocean-blue">
                {memberNotes}
              </p>
            ) : null}
            {invitation ? (
              <InvitationDecisionForms
                confirmedCancelLink
                copy={dictionary.actions}
                creditBalance={creditBalance}
                eventCopy={{
                  languageTooltips: dictionary.events.languageTooltips,
                  venuePendingTooltip: dictionary.events.venuePendingTooltip,
                }}
                hostingCopy={dictionary.preferences}
                invitation={invitation}
                locale={locale}
                now={now}
                wantsToHost={preferences?.wants_to_host ?? false}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-lipstick-red" />
              {dictionary.events.peopleFromTable}
            </CardTitle>
            <CardDescription>
              {dictionary.events.peopleDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {canMessage && eventAttendees.length ? (
              eventAttendees.map((person) => (
                <article key={person.member_id} className="grid gap-3 rounded-lg border border-wine-burgundy/10 bg-blush-pink p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-lg font-extrabold text-wine-burgundy">{person.first_name}</p>
                    <Badge variant="muted">{dictionary.events.pastEvent}</Badge>
                  </div>
                  <StartConversationForm
                    copy={{
                      firstMessagePlaceholder: dictionary.messages.firstMessagePlaceholder,
                      firstMessageSent: dictionary.messages.firstMessageSent,
                      sendFirst: dictionary.messages.sendFirst,
                      sending: dictionary.messages.sending,
                    }}
                    eventId={event.id}
                    recipientMemberId={person.member_id}
                  />
                </article>
              ))
            ) : (
              <p className="rounded-lg bg-blush-pink p-4 text-sm font-semibold text-muted">
                {dictionary.events.messagingAfterEvent}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {isHost && materials.length ? (
        <Card>
          <CardHeader><CardTitle>{copy.hostMaterials}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {materials.filter((material) => material.locale === locale).map((material) => (
              <a className="rounded-lg border border-wine-burgundy/10 bg-white px-4 py-2 text-sm font-semibold text-wine-burgundy" href={material.public_url} key={material.id} rel="noreferrer" target="_blank">
                {material.kind.replaceAll("_", " ")} · v{material.version}
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {eventEnded && invitation?.seat_status === "confirmed" ? (
        <Card>
          <CardHeader>
            <CardTitle>{copy.feedback}</CardTitle>
            <CardDescription>{copy.feedbackDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {feedback ? (
              <p className="rounded-lg bg-ocean-blue/8 p-4 text-sm font-semibold text-ocean-blue">{copy.feedbackForm.saved}</p>
            ) : (
              <EventFeedbackForm copy={copy.feedbackForm} eventId={event.id} hasHost={Boolean(host)} isHost={isHost} />
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
