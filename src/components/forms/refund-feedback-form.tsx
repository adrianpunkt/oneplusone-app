"use client";

import { useActionState } from "react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  submitRefundFeedbackAction,
  type RefundFeedbackActionState,
} from "@/lib/actions/refund-feedback";
import type { RefundFeedbackReason } from "@/lib/membership-refund-feedback";

type Copy = {
  comments: string;
  commentsPlaceholder: string;
  reasons: Record<RefundFeedbackReason, string>;
  saved: string;
  saving: string;
  submit: string;
};

const initialState: RefundFeedbackActionState = {};

export function RefundFeedbackForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(submitRefundFeedbackAction, initialState);

  if (state.ok) {
    return (
      <p className="rounded-lg bg-ocean-blue/8 p-4 text-sm font-semibold text-ocean-blue" role="status">
        {copy.saved}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <fieldset className="grid gap-3">
        {Object.entries(copy.reasons).map(([value, label]) => (
          <label
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine-burgundy/10 bg-blush-pink px-4 py-3 text-sm font-semibold text-wine-burgundy"
            key={value}
          >
            <input className="mt-0.5" name="reason" required type="radio" value={value} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
        {copy.comments}
        <Textarea
          maxLength={2000}
          name="comments"
          placeholder={copy.commentsPlaceholder}
          rows={6}
        />
      </label>
      <ActionStatus error={state.error} />
      <SubmitButton pendingLabel={copy.saving}>{copy.submit}</SubmitButton>
    </form>
  );
}
