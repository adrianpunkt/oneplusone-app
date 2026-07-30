type ConversationSendState = {
  initiated_by_member_id: string;
  recipient_member_id?: string;
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
      (message) => message.sender_member_id === memberId,
    )
  );
}

export function shouldShowIncomingFirstMessageNotice({
  conversation,
  memberId,
  messages,
}: {
  conversation: ConversationSendState;
  memberId: string;
  messages: MessageSendState[];
}) {
  if (
    conversation.status !== "pending" ||
    conversation.recipient_member_id !== memberId ||
    messages.length !== 1
  ) {
    return false;
  }

  return messages[0]?.sender_member_id === conversation.initiated_by_member_id;
}
