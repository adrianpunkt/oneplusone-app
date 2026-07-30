import { notFound } from "next/navigation";
import { Clock3, MessageCircleHeart, Sparkles } from "lucide-react";

import { EventRoundBoundary } from "@/components/app/event-round-boundary";
import { EventPageHeader } from "@/components/app/event-page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import {
  getMyEventRoundQuestion,
  type EventRoundType,
} from "@/lib/data/event-round";
import { getDictionary } from "@/lib/i18n/dictionaries";

const roundCopy = {
  en: {
    expiredBody:
      "This event question was available for 24 hours after the event started and can no longer be opened.",
    expiredTitle: "This question has expired",
    lockedBody:
      "Your question stays hidden until the event starts. You can open the link again once you're at the event.",
    opensIn: "Unlocks in",
    passing:
      "Anyone can pass on a question without explaining why. Keep the round relaxed and make room for everyone.",
    refreshing: "Refreshing now",
    sharing: {
      descriptionAfterEmphasis:
        ". Continue until everyone has answered one question.",
      descriptionBeforeEmphasis:
        "When drinks arrive, read your question aloud and ",
      descriptionEmphasis: "nominate someone else to answer",
      eyebrow: "Sharing round",
      lockedTitle: "Sharing question",
    },
    spicy: {
      descriptionAfterEmphasis:
        ". Then nominate the next person to open and answer theirs.",
      descriptionBeforeEmphasis:
        "When food arrives, read your question aloud and ",
      descriptionEmphasis: "answer it yourself",
      eyebrow: "Spicy round",
      lockedTitle: "Spicy question",
    },
    yourQuestion: "Your question",
  },
  es: {
    expiredBody:
      "Esta pregunta estuvo disponible durante las 24 horas posteriores al inicio del evento y ya no se puede abrir.",
    expiredTitle: "Esta pregunta ha caducado",
    lockedBody:
      "Tu pregunta permanecerá oculta hasta que empiece el evento. Puedes volver a abrir el enlace cuando estés en el evento.",
    opensIn: "Se desbloquea en",
    passing:
      "Cualquiera puede pasar de una pregunta sin explicar el motivo. Mantened un ambiente relajado y dejad espacio para que participe todo el mundo.",
    refreshing: "Actualizando ahora",
    sharing: {
      descriptionAfterEmphasis:
        ". Continuad hasta que todo el mundo haya respondido una pregunta.",
      descriptionBeforeEmphasis:
        "Cuando lleguen las bebidas, lee tu pregunta en voz alta y ",
      descriptionEmphasis: "elige a otra persona para responder",
      eyebrow: "Ronda Sharing",
      lockedTitle: "Pregunta Sharing",
    },
    spicy: {
      descriptionAfterEmphasis:
        ". Después, elige a la siguiente persona para que abra y responda la suya.",
      descriptionBeforeEmphasis:
        "Cuando llegue la comida, lee tu pregunta en voz alta y ",
      descriptionEmphasis: "respóndela tú",
      eyebrow: "Ronda Spicy",
      lockedTitle: "Pregunta Spicy",
    },
    yourQuestion: "Tu pregunta",
  },
} as const;

export async function EventRoundQuestionPage({
  eventId,
  roundType,
}: {
  eventId: string;
  roundType: EventRoundType;
}) {
  const { locale } = await requireMemberContextForRender();
  const access = await getMyEventRoundQuestion(eventId, roundType);
  if (access.status === "unavailable") notFound();

  const dictionary = getDictionary(locale);
  const copy = roundCopy[access.languageCode];
  const round = roundType === "sharing_time" ? copy.sharing : copy.spicy;
  const RoundIcon = roundType === "sharing_time"
    ? MessageCircleHeart
    : Sparkles;

  return (
    <>
      <EventPageHeader
        event={{
          city: access.city,
          confirmation_released_at: access.opensAt,
          starts_at: access.startsAt,
          timezone: access.timezone,
          venue_address: null,
          venue_name: access.venueName,
        }}
        locale={locale}
        pendingTooltip={dictionary.events.venuePendingTooltip}
        title={access.eventTitle}
      />

      {access.status === "locked" ? (
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-ocean-blue/10 text-ocean-blue">
              <Clock3 aria-hidden="true" className="h-5 w-5" />
            </div>
            <CardTitle>{round.lockedTitle}</CardTitle>
            <CardDescription>{copy.lockedBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-4 text-sm font-semibold text-ocean-blue">
              <EventRoundBoundary
                boundaryAt={access.opensAt}
                copy={{
                  availableFor: copy.opensIn,
                  refreshing: copy.refreshing,
                }}
              />
            </p>
          </CardContent>
        </Card>
      ) : access.status === "expired" ? (
        <Card>
          <CardHeader>
            <CardTitle>{copy.expiredTitle}</CardTitle>
            <CardDescription>{copy.expiredBody}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-lipstick-red/10 text-lipstick-red">
                <RoundIcon aria-hidden="true" className="h-5 w-5" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-lipstick-red">
                {round.eyebrow}
              </p>
              <CardDescription>
                {round.descriptionBeforeEmphasis}
                {round.descriptionEmphasis ? (
                  <strong className="font-bold">
                    {round.descriptionEmphasis}
                  </strong>
                ) : null}
                {round.descriptionAfterEmphasis} {copy.passing}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-lipstick-red/20 bg-blush-pink">
            <CardHeader>
              <p className="text-xs font-bold uppercase tracking-wide text-lipstick-red">
                {copy.yourQuestion}
              </p>
              <CardTitle className="text-2xl leading-snug">
                {access.question}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}
    </>
  );
}
