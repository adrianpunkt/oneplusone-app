import { notFound } from "next/navigation";

import { SendMessageForm } from "@/components/forms/send-message-form";
import { CorrespondentAvatar } from "@/components/messages/correspondent-avatar";
import { MessageThreadRefresh } from "@/components/messages/message-thread-refresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import { getConversation } from "@/lib/data/portal";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { member } = await requireMemberContext();
  const { conversation, messages } = await getConversation(conversationId, member.id);

  if (!conversation) notFound();

  const correspondent = conversation.correspondent || {
    imageUrl: "",
    name: "Member",
  };

  return (
    <>
      <MessageThreadRefresh conversationId={conversation.id} />
      <section className="flex min-w-0 items-center gap-4">
        <CorrespondentAvatar
          className="h-16 w-16"
          imageUrl={correspondent.imageUrl}
          name={correspondent.name}
        />
        <div className="grid min-w-0 gap-1">
          <h1 className="truncate font-display text-3xl font-black tracking-tight text-wine">
            {correspondent.name}
          </h1>
          {conversation.events?.title ? (
            <p className="truncate text-sm font-semibold text-muted">
              {conversation.events.title}
            </p>
          ) : null}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
          <CardDescription>{formatDateTime(conversation.updated_at)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-h-[52vh] gap-3 overflow-y-auto rounded-lg bg-blush p-3">
            {messages.length ? (
              messages.map((message) => {
                const own = message.sender_member_id === member.id;
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm",
                      own
                        ? "ml-auto bg-lipstick text-white"
                        : "mr-auto bg-white text-ink",
                    )}
                  >
                    <p>{message.deleted_at ? "This message was deleted." : message.body}</p>
                    <p className={cn("mt-2 text-[11px] font-semibold", own ? "text-white/70" : "text-faint")}>
                      {formatDateTime(message.created_at)}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="rounded-lg bg-white p-4 text-sm font-semibold text-muted">
                No messages yet.
              </p>
            )}
          </div>
          <SendMessageForm conversationId={conversation.id} />
        </CardContent>
      </Card>
    </>
  );
}
