import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import { getConversations } from "@/lib/data/portal";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const { member } = await requireMemberContext();
  const conversations = await getConversations(member.id);

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Messages</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine">
          Conversations
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          You can send one first message after a shared event. If they reply, the conversation
          stays open.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-lipstick" />
            Your chats
          </CardTitle>
          <CardDescription>Realtime updates appear as new messages arrive.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {conversations.length ? (
            conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/messages/${conversation.id}`}
                className="grid gap-2 rounded-lg border border-wine/10 bg-blush p-4 transition hover:border-lipstick/25"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={conversation.status === "open" ? "ocean" : "muted"}>
                    {conversation.status}
                  </Badge>
                  <h2 className="font-display text-lg font-black text-wine">
                    {conversation.events?.title || "Conversation"}
                  </h2>
                </div>
                <p className="text-sm font-semibold text-muted">
                  Updated {formatDateTime(conversation.updated_at)}
                </p>
              </Link>
            ))
          ) : (
            <p className="rounded-lg bg-blush p-4 text-sm font-semibold text-muted">
              No conversations yet. Open a past event to send a first message.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
