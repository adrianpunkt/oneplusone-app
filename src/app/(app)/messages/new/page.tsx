import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StartConversationForm } from "@/components/forms/start-conversation-form";
import { AvatarPreview } from "@/components/messages/avatar-preview";
import { FirstMessageInfoDialog } from "@/components/messages/first-message-info-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { requireMemberContextForRender } from "@/lib/data/member";
import { getConversations, getEventDetail } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{
    eventId?: string | string[];
    recipientMemberId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const eventId = firstSearchParam(query.eventId);
  const recipientMemberId = firstSearchParam(query.recipientMemberId);

  if (
    !UUID_PATTERN.test(eventId) ||
    !UUID_PATTERN.test(recipientMemberId)
  ) {
    notFound();
  }

  const { locale, member } = await requireMemberContextForRender();
  const dictionary = getDictionary(locale);
  const [eventDetail, conversations] = await Promise.all([
    getEventDetail(eventId, member.id),
    getConversations(member.id),
  ]);

  const existingConversation = conversations.find(
    (conversation) =>
      conversation.event_id === eventId &&
      ((conversation.initiated_by_member_id === member.id &&
        conversation.recipient_member_id === recipientMemberId) ||
        (conversation.initiated_by_member_id === recipientMemberId &&
          conversation.recipient_member_id === member.id)),
  );

  if (existingConversation) {
    redirect(`/messages/${existingConversation.id}`);
  }

  const { event, eventAttendees, feedback, invitation } = eventDetail;
  if (!event) notFound();

  const eventPath = `/events/${encodeURIComponent(event.id)}`;
  const hasConfirmedSeat =
    invitation?.seat_status === "confirmed" && !invitation.cancelled_at;

  if (!feedback) {
    redirect(`${eventPath}/feedback`);
  }
  if (!feedback.attended || !hasConfirmedSeat) {
    redirect(eventPath);
  }

  const recipient = eventAttendees.find(
    (person) => person.member_id === recipientMemberId,
  );
  if (!recipient) notFound();

  return (
    <div className="fixed inset-x-0 bottom-0 top-[81px] z-10 px-0 pb-0 md:left-[260px] md:top-0 md:px-6 md:py-6 lg:px-8">
      <FirstMessageInfoDialog
        actionLabel={dictionary.messages.firstMessageInfoAction}
        description={dictionary.messages.firstMessageInfoBody(
          recipient.first_name,
        )}
        title={dictionary.messages.firstMessageInfoTitle}
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
            imageUrl={recipient.imageUrl}
            name={recipient.first_name}
            thumbnailUrl={recipient.thumbnailUrl}
          />
          <h1 className="truncate font-display text-xl font-extrabold text-wine-burgundy">
            {recipient.first_name}
          </h1>
        </section>

        <Card className="min-h-0 flex-1 overflow-hidden rounded-none md:rounded-lg">
          <CardContent className="h-full min-h-0 p-0">
            <div className="h-full min-h-0 overflow-y-auto bg-blush-pink p-3">
              <p className="rounded-lg bg-white p-4 text-sm font-semibold text-muted">
                {dictionary.messages.noMessagesYetPeriod}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="shrink-0 border-t border-wine-burgundy/10 bg-white md:rounded-lg md:border md:border-wine-burgundy/10">
          <StartConversationForm
            copy={{
              messageSent: dictionary.messages.firstMessageSent,
              sendMessage: dictionary.messages.sendMessage,
              sending: dictionary.messages.sending,
              writePlaceholder: dictionary.messages.firstMessagePlaceholder,
            }}
            eventId={event.id}
            recipientMemberId={recipient.member_id}
          />
        </div>
      </div>
    </div>
  );
}
