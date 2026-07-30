import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, ClipboardCheck, Clock3 } from "lucide-react";

import { SendMessageForm } from "@/components/forms/send-message-form";
import { AvatarPreview } from "@/components/messages/avatar-preview";
import { FirstMessageResponseActions } from "@/components/messages/first-message-response-actions";
import { IncomingFirstMessageDialog } from "@/components/messages/incoming-first-message-dialog";
import { MessageThreadRefresh } from "@/components/messages/message-thread-refresh";
import { ReportConversationMemberButton } from "@/components/messages/report-conversation-member-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import {
  getConversation,
  getConversationFeedbackGate,
} from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  isConversationWaitingForReply,
  shouldShowIncomingFirstMessageNotice,
} from "@/lib/message-conversation";
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
  const { conversation, messages, participant } = await getConversation(
    conversationId,
    member.id,
  );

  if (!conversation) {
    const feedbackGate = await getConversationFeedbackGate(
      conversationId,
      member.id,
    );
    if (!feedbackGate) notFound();

    return (
      <>
        <section className="grid gap-2">
          <h1 className="font-display text-3xl font-black text-wine-burgundy">
            {dictionary.messages.title}
          </h1>
        </section>

        <Card className="border-lipstick-red/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck
                aria-hidden="true"
                className="h-6 w-6 text-lipstick-red"
              />
              {dictionary.messages.feedbackRequired}
            </CardTitle>
            <CardDescription>
              {dictionary.messages.feedbackRequiredMessageDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link
                href={`/events/${encodeURIComponent(feedbackGate.eventId)}/feedback`}
              >
                {dictionary.messages.feedbackAction}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const supabaseConfig = requirePublicSupabaseEnv();

  const correspondent = conversation.correspondent || {
    imageUrl: "",
    name: dictionary.messages.member,
    thumbnailUrl: "",
  };
  const waitingForReply = isConversationWaitingForReply({
    conversation,
    memberId: member.id,
    messages,
  });
  const isIncomingFirstMessage = shouldShowIncomingFirstMessageNotice({
    conversation,
    memberId: member.id,
    messages,
  });
  const isArchived = Boolean(participant?.archived_at);
  const showIncomingFirstMessageNotice =
    isIncomingFirstMessage && !isArchived;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[81px] z-10 px-0 pb-0 md:left-[260px] md:top-0 md:px-6 md:py-6 lg:px-8">
      {showIncomingFirstMessageNotice ? (
        <IncomingFirstMessageDialog
          key={conversation.id}
          copy={{
            action: dictionary.messages.incomingFirstMessageInfoAction,
            body: dictionary.messages.incomingFirstMessageInfoBody,
            title: dictionary.messages.incomingFirstMessageInfoTitle,
          }}
        />
      ) : null}
      <MessageThreadRefresh
        conversationId={conversation.id}
        supabaseConfig={supabaseConfig}
      />
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-0 md:gap-2">
        <section className="flex min-h-[3.25rem] min-w-0 shrink-0 items-center gap-2 border-b border-wine-burgundy/10 bg-white/95 px-4 py-1.5 shadow-[0_8px_22px_rgba(68,10,18,0.05)] backdrop-blur sm:px-6 md:rounded-lg md:border md:px-3">
          <Link
            aria-label={dictionary.messages.back}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-wine-burgundy transition-colors hover:bg-lipstick-red/8 hover:text-lipstick-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/35 focus-visible:ring-offset-2"
            href="/messages"
            title={dictionary.messages.back}
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <AvatarPreview
            className="h-9 w-9"
            imageUrl={correspondent.imageUrl}
            name={correspondent.name}
            thumbnailUrl={correspondent.thumbnailUrl}
          />
          <h1 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold text-wine-burgundy">
            {correspondent.name}
          </h1>
          <ReportConversationMemberButton
            conversationId={conversation.id}
            copy={{
              action: dictionary.messages.reportMember,
              completeAction: dictionary.messages.reportCompleteAction,
              completeBody: dictionary.messages.reportCompleteBody,
              completeTitle: dictionary.messages.reportCompleteTitle,
              detailsBody: dictionary.messages.reportDetailsBody,
              detailsLabel: dictionary.messages.reportDetailsLabel,
              detailsPlaceholder:
                dictionary.messages.reportDetailsPlaceholder,
              detailsSkip: dictionary.messages.reportDetailsSkip,
              detailsSubmit: dictionary.messages.reportDetailsSubmit,
              detailsSubmitting:
                dictionary.messages.reportDetailsSubmitting,
              detailsTitle: dictionary.messages.reportDetailsTitle,
            }}
          />
        </section>

        <Card className="min-h-0 flex-1 overflow-hidden rounded-none md:rounded-lg">
          <CardContent className="h-full min-h-0 p-0">
            <div className="h-full min-h-0 overflow-y-auto bg-blush-pink p-3">
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
                            ? "ml-auto bg-lipstick-red text-white"
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

        <div className="shrink-0 border-t border-wine-burgundy/10 bg-white md:rounded-lg md:border md:border-wine-burgundy/10">
          {waitingForReply ? (
            <div className="flex min-h-20 items-start gap-3 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lipstick-red/10 text-lipstick-red">
                <Clock3 aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="grid gap-0.5">
                <p className="text-sm font-bold text-wine-burgundy">
                  {dictionary.messages.waitingForReplyTitle}
                </p>
                <p className="text-sm leading-5 text-muted">
                  {dictionary.messages.waitingForReplyBody(
                    correspondent.name,
                  )}
                </p>
              </div>
            </div>
          ) : isArchived ? (
            <div className="flex min-h-20 items-start gap-3 px-4 py-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ocean-blue/10 text-ocean-blue">
                <Archive aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="grid gap-0.5">
                <p className="text-sm font-bold text-wine-burgundy">
                  {dictionary.messages.archivedConversationTitle}
                </p>
                <p className="text-sm leading-5 text-muted">
                  {dictionary.messages.archivedConversationBody}
                </p>
              </div>
            </div>
          ) : isIncomingFirstMessage ? (
            <FirstMessageResponseActions
              conversationId={conversation.id}
              copy={{
                archiveAction: dictionary.messages.notInterested,
                archiveBody: dictionary.messages.notInterestedBody,
                archiveCancel: dictionary.common.cancel,
                archiveConfirm: dictionary.messages.archiveConversation,
                archiveTitle: dictionary.messages.notInterestedTitle,
                archiving: dictionary.messages.archivingConversation,
                respond: dictionary.messages.respondToMessage,
                sendMessage: {
                  messageSent: dictionary.messages.messageSent,
                  sendMessage: dictionary.messages.sendMessage,
                  sending: dictionary.messages.sending,
                  writePlaceholder: dictionary.messages.writePlaceholder,
                },
              }}
            />
          ) : (
            <SendMessageForm
              conversationId={conversation.id}
              copy={{
                messageSent: dictionary.messages.messageSent,
                sendMessage: dictionary.messages.sendMessage,
                sending: dictionary.messages.sending,
                writePlaceholder: dictionary.messages.writePlaceholder,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
