"use client";

import { useActionState } from "react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  submitEventFeedbackAction,
  type EventFeedbackActionState,
} from "@/lib/actions/events";

type Copy = {
  comments: string;
  detail: string;
  host: string;
  hosting: string;
  overall: string;
  questions: string;
  restaurant: string;
  saved: string;
  saving: string;
  submit: string;
};

const initialState: EventFeedbackActionState = {};

export function EventFeedbackForm({
  copy,
  eventId,
  hasHost,
  isHost,
}: {
  copy: Copy;
  eventId: string;
  hasHost: boolean;
  isHost: boolean;
}) {
  const [state, action] = useActionState(submitEventFeedbackAction, initialState);
  if (state.ok) return <p className="rounded-lg bg-ocean-blue/8 p-4 text-sm font-semibold text-ocean-blue">{copy.saved}</p>;

  return (
    <form action={action} className="grid gap-4">
      <input name="event_id" type="hidden" value={eventId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Rating label={copy.overall} name="overall_rating" required />
        <Rating label={copy.questions} name="questions_rating" />
        <Rating label={copy.restaurant} name="restaurant_rating" />
        {hasHost && !isHost ? <Rating label={copy.host} name="host_rating" /> : null}
        {isHost ? <Rating label={copy.hosting} name="hosting_experience_rating" /> : null}
      </div>
      <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
        {copy.comments}
        <Textarea maxLength={2000} name="comments" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
        {copy.detail}
        <Textarea maxLength={2000} name="one_star_detail" />
      </label>
      <ActionStatus error={state.error} />
      <SubmitButton pendingLabel={copy.saving}>{copy.submit}</SubmitButton>
    </form>
  );
}

function Rating({ label, name, required = false }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
      {label}
      <select className="h-11 rounded-md border border-wine-burgundy/15 bg-white px-3" defaultValue="" name={name} required={required}>
        <option disabled value="">—</option>
        {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
  );
}
