import { notFound } from "next/navigation";

import { SendMessageForm } from "@/components/forms/send-message-form";
import { MessageThreadRefresh } from "@/components/messages/message-thread-refresh";
import { Badge } from "@/components/ui/badge";
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
  const { conversation, messages } = await getConversation(conversationId);

  if (!conversation) notFound();

  return (
    <>
      <MessageThreadRefresh conversationId={conversation.id} />
      <section className="grid gap-2">
        <Badge variant={conversation.status === "open" ? "ocean" : "muted"}>
          {conversation.status}
        </Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine">
          {conversation.events?.title || "Conversation"}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Pending conversations allow one first message until the other person replies.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Thread</CardTitle>
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
