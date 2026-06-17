import Link from "next/link";

import { MessageHeartIcon } from "@/components/app/message-heart-icon";
import { CorrespondentAvatar } from "@/components/messages/correspondent-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getConversations } from "@/lib/data/portal";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import { formatDate } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
type ConversationSummary = Awaited<ReturnType<typeof getConversations>>[number];

function eventContext(
  conversation: ConversationSummary,
  dictionary: Dictionary,
  locale: Locale,
) {
  const event = conversation.events;
  if (!event) return dictionary.messages.metAfterEvent;

  const eventFormat = dictionary.events.formats[event.event_format];

  return dictionary.messages.metAt(eventFormat, event.city || "", formatDate(event.starts_at, locale));
}

function lastMessageContext(
  conversation: ConversationSummary,
  dictionary: Dictionary,
  locale: Locale,
) {
  if (!conversation.lastMessage) return dictionary.messages.noMessagesYet;
  if (conversation.lastMessage.isUnread) {
    return dictionary.messages.newMessageReceived(formatDate(conversation.lastMessage.createdAt, locale));
  }

  return dictionary.messages.lastMessage(
    dictionary.messages.directions[conversation.lastMessage.direction],
    formatDate(conversation.lastMessage.createdAt, locale),
  );
}

function NotificationHeart() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-lipstick drop-shadow-sm"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default async function MessagesPage() {
  const { locale, member } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const conversations = await getConversations(member.id, {
    includeCorrespondents: true,
    includeLastMessage: true,
  });
  const unreadConversationCount = conversations.filter((conversation) =>
    Boolean(conversation.lastMessage?.isUnread),
  ).length;

  return (
    <>
      <section className="grid gap-2">
        <h1 className="font-display text-3xl font-black text-wine">
          {dictionary.messages.title}
        </h1>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageHeartIcon
              className="h-6 w-6 text-lipstick"
              count={unreadConversationCount}
              iconClassName="h-6 w-6"
            />
            {dictionary.messages.conversations}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {conversations.length ? (
            conversations.map((conversation) => {
              const correspondent = conversation.correspondent || {
                imageUrl: "",
                name: dictionary.messages.member,
                thumbnailUrl: "",
              };
              const hasNewMessage = Boolean(conversation.lastMessage?.isUnread);

              return (
                <Link
                  key={conversation.id}
                  href={`/messages/${conversation.id}`}
                  className={cn(
                    "relative flex min-w-0 items-center gap-3 overflow-hidden rounded-lg border p-4 shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-lipstick/35 hover:bg-white hover:shadow-[0_16px_30px_rgba(68,10,18,0.10)]",
                    hasNewMessage
                      ? "border-lipstick/70 bg-white shadow-[0_16px_34px_rgba(225,63,68,0.16)] ring-2 ring-lipstick/15 before:absolute before:inset-y-4 before:left-0 before:w-1 before:rounded-r-full before:bg-lipstick"
                      : "border-wine/10 bg-blush",
                  )}
                >
                  <CorrespondentAvatar
                    className="h-12 w-12"
                    imageUrl={correspondent.thumbnailUrl || correspondent.imageUrl}
                    name={correspondent.name}
                  />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <h2 className="truncate font-display text-lg font-extrabold text-wine">
                        {correspondent.name}
                      </h2>
                      {hasNewMessage ? (
                        <Badge className="shrink-0 rounded-md px-2 py-0.5 text-xs">
                          {dictionary.messages.new}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-sm font-semibold text-muted">
                      {eventContext(conversation, dictionary, locale)}
                    </p>
                    <p
                      className={cn(
                        "flex min-w-0 items-center gap-1.5 text-xs font-semibold",
                        hasNewMessage ? "text-lipstick" : "text-faint",
                      )}
                    >
                      {hasNewMessage ? <NotificationHeart /> : null}
                      <span className="truncate">
                        {lastMessageContext(conversation, dictionary, locale)}
                      </span>
                    </p>
                  </div>
                </Link>
              );
            })
          ) : (
            <p className="rounded-lg border border-wine/10 bg-blush p-4 text-sm font-semibold leading-6 text-muted">
              {dictionary.messages.noConversations}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
