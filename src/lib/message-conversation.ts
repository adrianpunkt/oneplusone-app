type ConversationSendState = {
  initiated_by_member_id: string;
  status: "pending" | "open" | "closed";
};

type MessageSendState = {
  deleted_at: string | null;
  sender_member_id: string;
};

export function isConversationWaitingForReply({
  conversation,
  memberId,
  messages,
}: {
  conversation: ConversationSendState;
  memberId: string;
  messages: MessageSendState[];
}) {
  return (
    conversation.status === "pending" &&
    conversation.initiated_by_member_id === memberId &&
    messages.some(
      (message) =>
        message.sender_member_id === memberId && !message.deleted_at,
    )
  );
}
