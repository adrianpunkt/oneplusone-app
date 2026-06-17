"use client";

import { useActionState } from "react";
import { MessageCircle } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  startConversationAction,
  type MessageActionState,
} from "@/lib/actions/messages";

const initialState: MessageActionState = {};

export type StartConversationCopy = {
  firstMessagePlaceholder: string;
  firstMessageSent: string;
  sendFirst: string;
  sending: string;
};

export function StartConversationForm({
  copy,
  eventId,
  recipientMemberId,
}: {
  copy: StartConversationCopy;
  eventId: string;
  recipientMemberId: string;
}) {
  const [state, action] = useActionState(startConversationAction, initialState);

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="recipient_member_id" value={recipientMemberId} />
      <Textarea
        name="body"
        maxLength={2000}
        placeholder={copy.firstMessagePlaceholder}
        required
      />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel={copy.sending}>
          <MessageCircle className="h-4 w-4" />
          {copy.sendFirst}
        </SubmitButton>
        <ActionStatus
          error={state.error}
          ok={state.ok}
          successMessage={copy.firstMessageSent}
          toastKey={state}
        />
      </div>
    </form>
  );
}
