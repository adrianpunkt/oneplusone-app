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

export function StartConversationForm({
  eventId,
  recipientMemberId,
}: {
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
        placeholder="Write one thoughtful first message..."
        required
      />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Sending...">
          <MessageCircle className="h-4 w-4" />
          Send first message
        </SubmitButton>
        <ActionStatus
          error={state.error}
          ok={state.ok}
          successMessage="First message sent."
          toastKey={state}
        />
      </div>
    </form>
  );
}
