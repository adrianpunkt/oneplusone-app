"use client";

import {
  MessageComposerForm,
  type SendMessageCopy,
} from "@/components/forms/send-message-form";
import { startConversationAction } from "@/lib/actions/messages";

export type StartConversationCopy = SendMessageCopy;

export function StartConversationForm({
  copy,
  eventId,
  recipientMemberId,
}: {
  copy: StartConversationCopy;
  eventId: string;
  recipientMemberId: string;
}) {
  return (
    <MessageComposerForm
      action={startConversationAction}
      copy={copy}
      hiddenFields={{
        event_id: eventId,
        recipient_member_id: recipientMemberId,
      }}
    />
  );
}
