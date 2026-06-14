"use client";

import { useActionState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  cancelInvitationAction,
  confirmInvitationAction,
  type EventActionState,
} from "@/lib/actions/events";

const initialState: EventActionState = {};

export function ConfirmInvitationForm({ invitationId }: { invitationId: string }) {
  const [state, action] = useActionState(confirmInvitationAction, initialState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <SubmitButton pendingLabel="Confirming...">
        <CheckCircle2 className="h-4 w-4" />
        Confirm seat
      </SubmitButton>
      <ActionStatus error={state.error} ok={state.ok} />
    </form>
  );
}

export function CancelInvitationForm({ invitationId }: { invitationId: string }) {
  const [state, action] = useActionState(cancelInvitationAction, initialState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <SubmitButton variant="secondary" pendingLabel="Cancelling...">
        <XCircle className="h-4 w-4" />
        Cancel
      </SubmitButton>
      <ActionStatus error={state.error} ok={state.ok} />
    </form>
  );
}

export function DisabledInvitationAction({ label }: { label: string }) {
  return (
    <Button variant="secondary" disabled>
      {label}
    </Button>
  );
}
