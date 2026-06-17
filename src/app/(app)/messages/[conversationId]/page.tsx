import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SendMessageForm } from "@/components/forms/send-message-form";
import { AvatarPreview } from "@/components/messages/avatar-preview";
import { MessageThreadRefresh } from "@/components/messages/message-thread-refresh";
import { Card, CardContent } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getConversation } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { requirePublicSupabaseEnv } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { locale, member } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const { conversation, messages } = await getConversation(conversationId, member.id);
  const supabaseConfig = requirePublicSupabaseEnv();

  if (!conversation) notFound();

  const correspondent = conversation.correspondent || {
    imageUrl: "",
    name: dictionary.messages.member,
    thumbnailUrl: "",
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[81px] z-10 px-0 pb-0 md:left-[260px] md:top-0 md:px-6 md:py-6 lg:px-8">
      <MessageThreadRefresh
        conversationId={conversation.id}
        supabaseConfig={supabaseConfig}
      />
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-0 md:gap-2">
        <section className="flex min-h-[3.25rem] min-w-0 shrink-0 items-center gap-2 border-b border-wine/10 bg-white/95 px-4 py-1.5 shadow-[0_8px_22px_rgba(68,10,18,0.05)] backdrop-blur sm:px-6 md:rounded-lg md:border md:px-3">
          <Link
            aria-label={dictionary.messages.back}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-wine transition-colors hover:bg-lipstick/8 hover:text-lipstick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick/35 focus-visible:ring-offset-2"
            href="/messages"
            title={dictionary.messages.back}
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <AvatarPreview
            className="h-9 w-9"
            imageUrl={correspondent.imageUrl}
            name={correspondent.name}
          />
          <h1 className="truncate font-display text-xl font-extrabold text-wine">
            {correspondent.name}
          </h1>
        </section>

        <Card className="min-h-0 flex-1 overflow-hidden rounded-none md:rounded-lg">
          <CardContent className="h-full min-h-0 p-0">
            <div className="h-full min-h-0 overflow-y-auto bg-blush p-3">
              <div className="grid gap-3">
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
                        <p>{message.deleted_at ? dictionary.messages.deleted : message.body}</p>
                        <p className={cn("mt-2 text-xs font-semibold", own ? "text-white/70" : "text-faint")}>
                          {formatDateTime(message.created_at, locale)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-lg bg-white p-4 text-sm font-semibold text-muted">
                    {dictionary.messages.noMessagesYetPeriod}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="shrink-0 border-t border-wine/10 bg-white md:rounded-lg md:border md:border-wine/10">
          <SendMessageForm
            conversationId={conversation.id}
            copy={{
              messageSent: dictionary.messages.messageSent,
              sendMessage: dictionary.messages.sendMessage,
              sending: dictionary.messages.sending,
              writePlaceholder: dictionary.messages.writePlaceholder,
            }}
          />
        </div>
      </div>
    </div>
  );
}
