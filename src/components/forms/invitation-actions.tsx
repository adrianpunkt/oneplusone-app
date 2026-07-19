"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, Star, X, XCircle } from "lucide-react";

import { EventLanguage } from "@/components/app/event-language";
import { EventLocation } from "@/components/app/event-location";
import { ActionStatus } from "@/components/forms/action-status";
import {
  HostingInfoDialog,
  type HostingInfoCopy,
} from "@/components/forms/hosting-info-dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelInvitationAction,
  confirmInvitationAction,
  declineInvitationAction,
  joinWaitlistAction,
  restoreInvitationAction,
  type EventActionState,
} from "@/lib/actions/events";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import type { EventInvitation, EventRecord } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const initialState: EventActionState = {};

export type InvitationActionCopy = {
  applyCreditCharge: string;
  applyForSeat: string;
  applyRefundPolicy: string;
  applyTitle: string;
  and: string;
  balance: string;
  cancel: string;
  cancelEventDescription: string;
  cancelEventTitle: string;
  cancelWaitlist: string;
  cancelWaitlistDescription: string;
  cancelWaitlistTitle: string;
  cancelling: string;
  cannotMakeIt: string;
  confirmApplication: string;
  confirming: string;
  credit: string;
  credits: string;
  day: string;
  days: string;
  declineDescription: string;
  declineDetailsLabel: string;
  declineDetailsPlaceholder: string;
  declineReasonLabel: string;
  declineReasons: {
    eventFit: string;
    otherCommitment: string;
    preferNotToSay: string;
    sundayBrunch: string;
    weekendUnavailable: string;
  };
  declineSubmit: string;
  declining: string;
  eventCancelled: string;
  getCredits: string;
  hour: string;
  hours: string;
  joinWaitlist: string;
  joining: string;
  keepIt: string;
  notEnoughCredits: string;
  notNow: string;
  minute: string;
  minutes: string;
  needToCancel: string;
  responseSaved: string;
  seatConfirmed: string;
  startsIn: string;
  startsSoon: string;
  eventStarted: string;
  updating: string;
  waitlistCancelled: string;
  waitlistJoined: string;
};

type InvitationDecisionTarget = Pick<
  EventInvitation,
  | "confirmed_at"
  | "events"
  | "id"
  | "replacement_found"
  | "responded_at"
  | "response_mode"
  | "status"
>;

type HostingConfirmationCopy = HostingInfoCopy &
  Pick<Dictionary["preferences"], "hostDescription" | "hostLabel">;

type InvitationEventCopy = Pick<
  Dictionary["events"],
  "languageTooltips" | "venuePendingTooltip"
>;

function relativeEventTime(
  startsAt: string,
  now: number,
  copy: InvitationActionCopy,
) {
  const differenceMinutes = Math.floor(
    (new Date(startsAt).getTime() - now) / 60_000,
  );

  if (differenceMinutes < 0) return copy.eventStarted;
  if (differenceMinutes === 0) return copy.startsSoon;

  const days = Math.floor(differenceMinutes / (24 * 60));
  const hours = Math.floor((differenceMinutes % (24 * 60)) / 60);
  const minutes = differenceMinutes % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? copy.day : copy.days}`);
    if (hours > 0) {
      parts.push(`${hours} ${hours === 1 ? copy.hour : copy.hours}`);
    }
  } else if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? copy.hour : copy.hours}`);
    if (minutes > 0) {
      parts.push(`${minutes} ${minutes === 1 ? copy.minute : copy.minutes}`);
    }
  } else {
    parts.push(`${minutes} ${minutes === 1 ? copy.minute : copy.minutes}`);
  }

  return `${copy.startsIn} ${parts.join(` ${copy.and} `)}`;
}

function canConfirmInvitation(invitation: InvitationDecisionTarget) {
  if (invitation.status === "declined") {
    return invitation.response_mode === "confirm";
  }

  if (invitation.responded_at) return false;

  if (invitation.status === "invited") {
    return invitation.response_mode !== "closed" &&
      invitation.response_mode !== "waitlist";
  }

  return invitation.status === "waitlisted" &&
    invitation.response_mode === "confirm";
}

function isWaitlistAvailable(invitation: InvitationDecisionTarget) {
  if (invitation.responded_at) return false;
  if (invitation.response_mode === "waitlist") return true;

  return invitation.status === "waitlisted" &&
    invitation.response_mode !== "confirm";
}

export function ConfirmInvitationForm({
  creditBalance,
  event,
  eventCopy,
  hostingCopy,
  locale,
  now,
  restore = false,
  stacked = false,
  copy,
  invitationId,
  wantsToHost,
}: {
  creditBalance: number;
  event: EventRecord | null | undefined;
  eventCopy: InvitationEventCopy;
  hostingCopy: HostingConfirmationCopy;
  locale: Locale;
  now: number;
  restore?: boolean;
  stacked?: boolean;
  copy: InvitationActionCopy;
  invitationId: string;
  wantsToHost: boolean;
}) {
  const [state, action] = useActionState(
    restore ? restoreInvitationAction : confirmInvitationAction,
    initialState,
  );
  const [open, setOpen] = useState(false);
  const [isHosting, setIsHosting] = useState(wantsToHost);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const successMessage = state.confirmationStatus === "waitlisted"
    ? copy.waitlistJoined
    : copy.seatConfirmed;

  const creditLabel = creditBalance === 1 ? copy.credit : copy.credits;
  const hasEnoughCredits = restore || creditBalance >= 1;
  const relativeTime = event?.starts_at
    ? relativeEventTime(event.starts_at, now, copy)
    : "";

  return (
    <div
      className={`flex w-full flex-wrap items-center gap-2 ${
        stacked ? "sm:w-full" : "sm:w-auto"
      }`}
    >
      <Dialog.Root open={open && !state.ok} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button
            className={`h-11 w-full ${
              stacked ? "sm:h-9 sm:w-full" : "sm:h-10 sm:w-auto"
            }`}
            type="button"
          >
            {copy.applyForSeat}
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-wine-burgundy/35 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-wine-burgundy/10 bg-white shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              dismissButtonRef.current?.focus();
            }}
          >
            <div className="relative shrink-0 border-b border-wine-burgundy/10 px-4 py-4 sm:border-b-0 sm:px-5 sm:pb-4 sm:pt-5">
              <Dialog.Title className="pr-10 font-display text-xl font-extrabold leading-tight text-wine-burgundy sm:pr-8">
                {copy.applyTitle}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  aria-label={copy.notNow}
                  className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full text-muted transition hover:bg-blush-pink hover:text-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 sm:right-4 sm:top-4 sm:h-10 sm:w-10"
                  ref={dismissButtonRef}
                  type="button"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="grid min-h-0 flex-auto content-start gap-3 overflow-y-auto overscroll-contain px-4 py-4 sm:gap-4 sm:px-5 sm:pt-0">
              {event ? (
                <div className="grid gap-2 rounded-lg border border-wine-burgundy/10 bg-white p-3 text-sm font-semibold text-muted">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <CalendarDays
                      aria-hidden="true"
                      className="h-4 w-4 text-lipstick-red"
                    />
                    <time dateTime={event.starts_at}>
                      {formatDateTime(event.starts_at, locale)}
                    </time>
                    {relativeTime ? (
                      <span className="text-ocean-blue">· {relativeTime}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <EventLocation
                      event={event}
                      pendingTooltip={eventCopy.venuePendingTooltip}
                    />
                    {event.language_code ? (
                      <EventLanguage
                        languageCode={event.language_code}
                        locale={locale}
                        tooltip={eventCopy.languageTooltips[event.language_code]}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 rounded-lg border border-lipstick-red/15 bg-blush-pink p-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-muted">
                    {copy.balance}
                  </span>
                  <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold text-wine-burgundy">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-lipstick-red text-white">
                      <Star
                        className="h-3 w-3"
                        fill="currentColor"
                        stroke="currentColor"
                      />
                    </span>
                    {creditBalance} {creditLabel}
                  </span>
                </div>
                <Dialog.Description className="text-sm leading-6 text-muted">
                  {copy.applyCreditCharge} {copy.applyRefundPolicy}
                </Dialog.Description>
                {!restore && !hasEnoughCredits ? (
                  <p className="text-sm font-semibold text-lipstick-red">
                    {copy.notEnoughCredits}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-3">
                <div className="flex items-start justify-between gap-4">
                  <label
                    htmlFor={`hosting-${invitationId}`}
                    className="cursor-pointer text-sm font-semibold text-wine-burgundy"
                  >
                    {hostingCopy.hostLabel}
                  </label>
                  <Switch
                    aria-label={hostingCopy.hostLabel}
                    checked={isHosting}
                    id={`hosting-${invitationId}`}
                    onCheckedChange={setIsHosting}
                  />
                </div>
                <p className="text-sm leading-6 text-muted">
                  {hostingCopy.hostDescription}
                </p>
                <div>
                  <HostingInfoDialog
                    copy={hostingCopy}
                    onAccept={() => setIsHosting(true)}
                    onDecline={() => setIsHosting(false)}
                  />
                </div>
              </div>
            </div>

            <form
              action={action}
              className="grid shrink-0 gap-3 border-t border-wine-burgundy/10 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-5"
            >
              <input type="hidden" name="invitation_id" value={invitationId} />
              <input
                type="hidden"
                name="wants_to_host"
                value={isHosting ? "true" : "false"}
              />
              {state.error ? (
                <ActionStatus error={state.error} toastKey={state} />
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <Button
                    className="h-11 w-full sm:h-10 sm:w-auto"
                    type="button"
                    variant="secondary"
                  >
                    {copy.notNow}
                  </Button>
                </Dialog.Close>
                {hasEnoughCredits ? (
                  <SubmitButton
                    className="h-11 w-full sm:h-10 sm:w-auto"
                    pendingLabel={copy.confirming}
                  >
                    {copy.confirmApplication}
                  </SubmitButton>
                ) : (
                  <Button asChild className="h-11 w-full sm:h-10 sm:w-auto">
                    <Link href="/credits">{copy.getCredits}</Link>
                  </Button>
                )}
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ActionStatus
        ok={state.ok}
        successMessage={successMessage}
        toastKey={state}
      />
    </div>
  );
}

export function CancelInvitationForm({
  context = "event",
  copy,
  invitationId,
  linkTrigger = false,
}: {
  context?: "event" | "waitlist";
  copy: InvitationActionCopy;
  invitationId: string;
  linkTrigger?: boolean;
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
          {linkTrigger ? (
            <button
              className="text-sm font-semibold text-muted underline decoration-wine-burgundy/25 underline-offset-4 transition hover:text-wine-burgundy hover:decoration-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 focus-visible:ring-offset-2"
              type="button"
            >
              {copy.needToCancel}
            </button>
          ) : (
            <Button type="button" variant="secondary">
              <XCircle className="h-4 w-4" />
              {triggerLabel}
            </Button>
          )}
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
  stacked = false,
}: {
  copy: InvitationActionCopy;
  invitationId: string;
  stacked?: boolean;
}) {
  const [state, action] = useActionState(joinWaitlistAction, initialState);

  return (
    <form
      action={action}
      className={`flex w-full flex-wrap items-center gap-2 ${
        stacked ? "sm:w-full" : "sm:w-auto"
      }`}
    >
      <input type="hidden" name="invitation_id" value={invitationId} />
      <SubmitButton
        className={`h-11 w-full ${
          stacked ? "sm:h-9 sm:w-full" : "sm:h-10 sm:w-auto"
        }`}
        pendingLabel={copy.joining}
      >
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
  linkTrigger = false,
  stacked = false,
}: {
  copy: InvitationActionCopy;
  invitationId: string;
  linkTrigger?: boolean;
  stacked?: boolean;
}) {
  const [state, action] = useActionState(declineInvitationAction, initialState);
  const [open, setOpen] = useState(false);
  const reasonOptions = [
    ["weekend_unavailable", copy.declineReasons.weekendUnavailable],
    ["prefers_sunday_brunch", copy.declineReasons.sundayBrunch],
    ["event_fit", copy.declineReasons.eventFit],
    ["other_commitment", copy.declineReasons.otherCommitment],
    ["prefer_not_to_say", copy.declineReasons.preferNotToSay],
  ] as const;

  return (
    <div
      className={`flex w-full flex-wrap items-center gap-2 ${
        stacked ? "sm:w-full" : "sm:w-auto"
      }`}
    >
      <Dialog.Root open={open && !state.ok} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          {linkTrigger ? (
            <button
              className="text-sm font-semibold text-muted underline decoration-wine-burgundy/25 underline-offset-4 transition hover:text-wine-burgundy hover:decoration-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 focus-visible:ring-offset-2"
              type="button"
            >
              {copy.declineReasonLabel}
            </button>
          ) : (
            <Button
              className={`h-11 w-full border-lipstick-red/15 bg-white hover:bg-blush-pink ${
                stacked ? "sm:h-9 sm:w-full" : "sm:h-10 sm:w-auto"
              }`}
              type="button"
              variant="secondary"
            >
              <XCircle className="h-4 w-4" />
              {copy.cannotMakeIt}
            </Button>
          )}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-wine-burgundy/35 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-wine-burgundy/10 bg-white shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]">
            <div className="relative shrink-0 border-b border-wine-burgundy/10 px-4 py-4 sm:border-b-0 sm:px-5 sm:pb-3 sm:pt-5">
              <Dialog.Title className="pr-10 font-display text-xl font-extrabold leading-tight text-wine-burgundy">
                {copy.declineReasonLabel}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  aria-label={copy.keepIt}
                  className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full text-muted transition hover:bg-blush-pink hover:text-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 sm:right-4 sm:top-4 sm:h-10 sm:w-10"
                  type="button"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <form action={action} className="flex min-h-0 flex-1 flex-col">
              <input
                type="hidden"
                name="invitation_id"
                value={invitationId}
              />
              <div className="grid min-h-0 flex-auto content-start gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:pt-0">
                <Dialog.Description className="text-sm leading-6 text-muted">
                  {copy.declineDescription}
                </Dialog.Description>

                <fieldset className="grid gap-2">
                  <legend className="sr-only">
                    {copy.declineReasonLabel}
                  </legend>
                  {reasonOptions.map(([value, label]) => (
                    <label
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine-burgundy/10 bg-white p-3 text-sm font-semibold text-wine-burgundy transition has-[:checked]:border-lipstick-red/40 has-[:checked]:bg-blush-pink hover:bg-blush-pink/60"
                      key={value}
                    >
                      <input
                        className="mt-0.5 h-4 w-4 shrink-0 accent-lipstick-red"
                        name="decline_reason"
                        required
                        type="radio"
                        value={value}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>

                <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
                  {copy.declineDetailsLabel}
                  <Textarea
                    className="min-h-20 resize-none font-normal"
                    maxLength={500}
                    name="decline_details"
                    placeholder={copy.declineDetailsPlaceholder}
                  />
                </label>
              </div>

              <div className="grid shrink-0 gap-3 border-t border-wine-burgundy/10 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-5">
                {state.error ? (
                  <ActionStatus error={state.error} toastKey={state} />
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Dialog.Close asChild>
                    <Button
                      className="h-11 w-full sm:h-10 sm:w-auto"
                      type="button"
                      variant="secondary"
                    >
                      {copy.keepIt}
                    </Button>
                  </Dialog.Close>
                  <SubmitButton
                    className="h-11 w-full sm:h-10 sm:w-auto"
                    pendingLabel={copy.declining}
                    variant="destructive"
                  >
                    {copy.declineSubmit}
                  </SubmitButton>
                </div>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ActionStatus
        ok={state.ok}
        successMessage={copy.responseSaved}
        toastKey={state}
      />
    </div>
  );
}

export function InvitationDecisionForms({
  confirmedCancelLink = false,
  creditBalance,
  eventCopy,
  hostingCopy,
  copy,
  invitation,
  locale,
  now,
  wantsToHost,
}: {
  confirmedCancelLink?: boolean;
  creditBalance: number;
  eventCopy: InvitationEventCopy;
  hostingCopy: HostingConfirmationCopy;
  copy: InvitationActionCopy;
  invitation: InvitationDecisionTarget;
  locale: Locale;
  now: number;
  wantsToHost: boolean;
}) {
  const canConfirm = canConfirmInvitation(invitation);
  const waitlistAvailable = isWaitlistAvailable(invitation);
  const isOnWaitlist =
    invitation.status === "waitlisted" && Boolean(invitation.responded_at);
  const canDecline =
    !invitation.confirmed_at &&
    ["invited", "waitlisted"].includes(invitation.status);
  const canRestoreConfirmation =
    invitation.status === "cancelled" &&
    Boolean(invitation.confirmed_at) &&
    !invitation.replacement_found;
  const stackDecisionActions =
    canDecline && (canConfirm || waitlistAvailable);

  if (invitation.status === "confirmed") {
    return (
      <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center lg:justify-end">
        <CancelInvitationForm
          copy={copy}
          invitationId={invitation.id}
          linkTrigger={confirmedCancelLink}
        />
      </div>
    );
  }

  if (canRestoreConfirmation) {
    return (
      <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center lg:justify-end">
        <ConfirmInvitationForm
          creditBalance={creditBalance}
          event={invitation.events}
          eventCopy={eventCopy}
          hostingCopy={hostingCopy}
          locale={locale}
          now={now}
          restore
          copy={copy}
          invitationId={invitation.id}
          wantsToHost={wantsToHost}
        />
      </div>
    );
  }

  if (
    canConfirm ||
    waitlistAvailable ||
    isOnWaitlist ||
    canDecline
  ) {
    return (
      <div
        className={
          stackDecisionActions
            ? "grid w-full content-center gap-2 sm:w-52 lg:justify-self-end"
            : "grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center lg:justify-end"
        }
      >
        {canConfirm ? (
          <ConfirmInvitationForm
            copy={copy}
            creditBalance={creditBalance}
            event={invitation.events}
            eventCopy={eventCopy}
            hostingCopy={hostingCopy}
            invitationId={invitation.id}
            locale={locale}
            now={now}
            stacked={stackDecisionActions}
            wantsToHost={wantsToHost}
          />
        ) : null}
        {waitlistAvailable ? (
          <JoinWaitlistForm
            copy={copy}
            invitationId={invitation.id}
            stacked={stackDecisionActions}
          />
        ) : null}
        {canDecline ? (
          <DeclineInvitationForm
            copy={copy}
            invitationId={invitation.id}
            stacked={stackDecisionActions}
          />
        ) : null}
      </div>
    );
  }

  if (["cancelled", "declined", "expired"].includes(invitation.status)) {
    return null;
  }

  return (
    <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center lg:justify-end">
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
