"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessageAction, type MessageActionState } from "@/lib/actions/messages";

const initialState: MessageActionState = {};

export function SendMessageForm({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendMessageAction, initialState);

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <Textarea name="body" maxLength={2000} placeholder="Write a message..." required />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Sending...">
          <Send className="h-4 w-4" />
          Send
        </SubmitButton>
        <ActionStatus error={state.error} ok={state.ok} />
      </div>
    </form>
  );
}
