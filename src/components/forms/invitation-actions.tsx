"use client";

import { useActionState, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, XCircle } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  cancelInvitationAction,
  confirmInvitationAction,
  declineInvitationAction,
  joinWaitlistAction,
  type EventActionState,
} from "@/lib/actions/events";
import type { EventInvitation } from "@/lib/types";

const initialState: EventActionState = {};

export type InvitationActionCopy = {
  cancel: string;
  cancelEventDescription: string;
  cancelEventTitle: string;
  cancelWaitlist: string;
  cancelWaitlistDescription: string;
  cancelWaitlistTitle: string;
  cancelling: string;
  cannotMakeIt: string;
  confirmSeat: string;
  confirming: string;
  eventCancelled: string;
  joinWaitlist: string;
  joining: string;
  keepIt: string;
  responseSaved: string;
  seatConfirmed: string;
  updating: string;
  waitlistCancelled: string;
  waitlistJoined: string;
};

type InvitationDecisionTarget = Pick<
  EventInvitation,
  "confirmed_at" | "id" | "responded_at" | "status"
>;

export function ConfirmInvitationForm({
  copy,
  invitationId,
}: {
  copy: InvitationActionCopy;
  invitationId: string;
}) {
  const [state, action] = useActionState(confirmInvitationAction, initialState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <SubmitButton pendingLabel={copy.confirming}>
        <CheckCircle2 className="h-4 w-4" />
        {copy.confirmSeat}
      </SubmitButton>
      <ActionStatus
        error={state.error}
        ok={state.ok}
        successMessage={copy.seatConfirmed}
        toastKey={state}
      />
    </form>
  );
}

export function CancelInvitationForm({
  context = "event",
  copy,
  invitationId,
}: {
  context?: "event" | "waitlist";
  copy: InvitationActionCopy;
  invitationId: string;
}) {
  const [state, action] = useActionState(cancelInvitationAction, initialState);
  const [open, setOpen] = useState(false);
  const isWaitlist = context === "waitlist";
  const triggerLabel = isWaitlist ? copy.cancelWaitlist : copy.cancel;
  const title = isWaitlist ? copy.cancelWaitlistTitle : copy.cancelEventTitle;
  const description = isWaitlist
    ? copy.cancelWaitlistDescription
    : copy.cancelEventDescription;
  const submitLabel = isWaitlist ? copy.cancelWaitlist : copy.cancel;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog.Root open={open && !state.ok} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button type="button" variant="secondary">
            <XCircle className="h-4 w-4" />
            {triggerLabel}
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-wine-burgundy/35 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-wine-burgundy/10 bg-white p-5 shadow-2xl">
            <div className="grid gap-2">
              <Dialog.Title className="font-display text-xl font-extrabold text-wine-burgundy">
                {title}
              </Dialog.Title>
              <Dialog.Description className="text-sm leading-6 text-muted">
                {description}
              </Dialog.Description>
            </div>
            <form action={action} className="grid gap-4">
              <input type="hidden" name="invitation_id" value={invitationId} />
              {state.error ? (
                <ActionStatus error={state.error} toastKey={state} />
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">
                    {copy.keepIt}
                  </Button>
                </Dialog.Close>
                <SubmitButton
                  variant="destructive"
                  pendingLabel={copy.cancelling}
                >
                  <XCircle className="h-4 w-4" />
                  {submitLabel}
                </SubmitButton>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ActionStatus
        ok={state.ok}
        successMessage={isWaitlist ? copy.waitlistCancelled : copy.eventCancelled}
        toastKey={state}
      />
    </div>
  );
}

export function JoinWaitlistForm({
  copy,
  invitationId,
}: {
  copy: InvitationActionCopy;
  invitationId: string;
}) {
  const [state, action] = useActionState(joinWaitlistAction, initialState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <SubmitButton pendingLabel={copy.joining}>
        <CheckCircle2 className="h-4 w-4" />
        {copy.joinWaitlist}
      </SubmitButton>
      <ActionStatus
        error={state.error}
        ok={state.ok}
        successMessage={copy.waitlistJoined}
        toastKey={state}
      />
    </form>
  );
}

export function DeclineInvitationForm({
  copy,
  invitationId,
}: {
  copy: InvitationActionCopy;
  invitationId: string;
}) {
  const [state, action] = useActionState(declineInvitationAction, initialState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <SubmitButton variant="secondary" pendingLabel={copy.updating}>
        <XCircle className="h-4 w-4" />
        {copy.cannotMakeIt}
      </SubmitButton>
      <ActionStatus
        error={state.error}
        ok={state.ok}
        successMessage={copy.responseSaved}
        toastKey={state}
      />
    </form>
  );
}

export function InvitationDecisionForms({
  copy,
  invitation,
}: {
  copy: InvitationActionCopy;
  invitation: InvitationDecisionTarget;
}) {
  const isWaitlistAvailable =
    invitation.status === "waitlisted" && !invitation.responded_at;
  const isOnWaitlist =
    invitation.status === "waitlisted" && Boolean(invitation.responded_at);
  const canRejoinWaitlist =
    (invitation.status === "declined" || invitation.status === "cancelled") &&
    !invitation.confirmed_at;

  if (invitation.status === "confirmed") {
    return (
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <CancelInvitationForm copy={copy} invitationId={invitation.id} />
      </div>
    );
  }

  if (
    invitation.status === "invited" ||
    isWaitlistAvailable ||
    isOnWaitlist ||
    canRejoinWaitlist
  ) {
    return (
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {invitation.status === "invited" ? (
          <ConfirmInvitationForm copy={copy} invitationId={invitation.id} />
        ) : null}
        {isWaitlistAvailable || canRejoinWaitlist ? (
          <JoinWaitlistForm copy={copy} invitationId={invitation.id} />
        ) : null}
        {isWaitlistAvailable || isOnWaitlist ? (
          <DeclineInvitationForm copy={copy} invitationId={invitation.id} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <DisabledInvitationAction label={invitation.status} />
    </div>
  );
}

export function DisabledInvitationAction({ label }: { label: string }) {
  return (
    <Button variant="secondary" disabled>
      {label}
    </Button>
  );
}
