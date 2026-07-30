import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { MessageCircle, UsersRound } from "lucide-react";

import { EventPageHeader } from "@/components/app/event-page-header";
import { AvatarPreview } from "@/components/messages/avatar-preview";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getConversations, getEventDetail } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import { formatDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";

export const dynamic = "force-dynamic";

const connectCopy: Record<
  Locale,
  {
    backToEvents: string;
    description: string;
    messagingRequiresAttendance: string;
  }
> = {
  en: {
    backToEvents: "Back to events",
    description: "Send a private message to anyone from your group.",
    messagingRequiresAttendance:
      "Messaging is available only to members who attended the event.",
  },
  es: {
    backToEvents: "Volver a eventos",
    description: "Envía un mensaje privado a cualquier persona de tu grupo.",
    messagingRequiresAttendance:
      "Los mensajes solo están disponibles para quienes asistieron al evento.",
  },
};

async function getRequestTimestamp() {
  await connection();
  return Date.now();
}

export default async function EventConnectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale, member } = await requireMemberContextForRender();
  const [eventDetail, conversations, now] = await Promise.all([
    getEventDetail(id, member.id),
    getConversations(member.id, { includeLastMessage: true }),
    getRequestTimestamp(),
  ]);
  const { event, eventAttendees, feedback, invitation } = eventDetail;

  if (!event) notFound();

  const eventPath = `/events/${encodeURIComponent(event.id)}`;
  const eventEnded =
    event.status === "completed" ||
    new Date(event.ends_at || event.starts_at).getTime() <= now;
  const hasConfirmedSeat =
    invitation?.seat_status === "confirmed" && !invitation.cancelled_at;

  if (!eventEnded || !hasConfirmedSeat) {
    redirect(eventPath);
  }
  if (!feedback) {
    redirect(`${eventPath}/feedback`);
  }

  const dictionary = getDictionary(locale);
  const copy = connectCopy[locale];
  const title = localizeText(
    event.title,
    event.localized_content,
    locale,
    "title",
  );
  const conversationsByMemberId = new Map(
    conversations
      .filter((conversation) => conversation.event_id === event.id)
      .map((conversation) => [
        conversation.initiated_by_member_id === member.id
          ? conversation.recipient_member_id
          : conversation.initiated_by_member_id,
        conversation,
      ]),
  );

  return (
    <>
      <EventPageHeader
        backHref="/going-out"
        backLabel={copy.backToEvents}
        event={event}
        locale={locale}
        pendingTooltip={dictionary.events.venuePendingTooltip}
        title={title}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound
              aria-hidden="true"
              className="h-5 w-5 text-lipstick-red"
            />
            {dictionary.events.peopleFromTable}
          </CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {feedback.attended && eventAttendees.length ? (
            eventAttendees.map((person) => {
              const conversation = conversationsByMemberId.get(
                person.member_id,
              );
              const receivedMessage =
                conversation?.lastMessage?.direction === "received"
                  ? conversation.lastMessage
                  : null;
              const href = conversation
                ? `/messages/${conversation.id}`
                : `/messages/new?${new URLSearchParams({
                    eventId: event.id,
                    recipientMemberId: person.member_id,
                  }).toString()}`;

              return (
                <article
                  className="flex flex-col gap-4 rounded-lg border border-wine-burgundy/10 bg-blush-pink p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={person.member_id}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarPreview
                      className="h-12 w-12"
                      imageUrl={person.imageUrl}
                      name={person.first_name}
                      thumbnailUrl={person.thumbnailUrl}
                    />
                    <div className="grid min-w-0 gap-0.5">
                      <p className="min-w-0 break-words font-display text-lg font-extrabold text-wine-burgundy">
                        {person.first_name}
                      </p>
                      {receivedMessage ? (
                        <p className="text-sm font-semibold text-muted">
                          {dictionary.messages.messageReceivedOn(
                            formatDate(receivedMessage.createdAt, locale),
                          )}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button asChild className="w-full sm:w-auto">
                    <Link href={href}>
                      <MessageCircle aria-hidden="true" className="h-4 w-4" />
                      {receivedMessage
                        ? dictionary.messages.respondToMessage
                        : dictionary.messages.sendMessage}
                    </Link>
                  </Button>
                </article>
              );
            })
          ) : (
            <p className="rounded-lg bg-blush-pink p-4 text-sm font-semibold text-muted">
              {feedback.attended
                ? dictionary.events.messagingAfterEvent
                : copy.messagingRequiresAttendance}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
