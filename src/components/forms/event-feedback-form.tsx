"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  submitEventFeedbackAction,
  type EventFeedbackActionState,
} from "@/lib/actions/events";
import { cn } from "@/lib/utils";

export type EventFeedbackCopy = {
  attendance: string;
  yes: string;
  no: string;
  nonattendance: string;
  nonattendanceReasons: {
    scheduleChange: string;
    illness: string;
    eventNotAppealing: string;
    other: string;
  };
  nonattendanceOtherLabel: string;
  nonattendanceOtherPlaceholder: string;
  overall: string;
  overallLow: string;
  overallHigh: string;
  compatibility: string;
  compatibilityLow: string;
  compatibilityHigh: string;
  questions: string;
  questionsLow: string;
  questionsHigh: string;
  restaurant: string;
  restaurantLow: string;
  restaurantHigh: string;
  host: string;
  hostLow: string;
  hostHigh: string;
  connections: string;
  comments: string;
  saving: string;
  submit: string;
};

const initialState: EventFeedbackActionState = {};

export function EventFeedbackForm({
  copy,
  eventId,
  hasHost,
  initialAttendance = null,
  initialOverallRating = null,
  isHost,
}: {
  copy: EventFeedbackCopy;
  eventId: string;
  hasHost: boolean;
  initialAttendance?: "yes" | "no" | null;
  initialOverallRating?: number | null;
  isHost: boolean;
}) {
  const [state, action] = useActionState(
    submitEventFeedbackAction,
    initialState,
  );
  const [attendance, setAttendance] = useState<"yes" | "no" | null>(
    initialAttendance,
  );
  const [nonattendanceReason, setNonattendanceReason] = useState<string>("");
  const [fallbackConnectionChoice, setFallbackConnectionChoice] =
    useState<"yes" | "no" | null>(null);

  const requiresHostRating = hasHost && !isHost;

  return (
    <form action={action} className="grid w-full min-w-0 max-w-2xl gap-6">
      <input name="event_id" type="hidden" value={eventId} />
      <input
        name="requires_host_rating"
        type="hidden"
        value={requiresHostRating ? "true" : "false"}
      />

      <fieldset className="min-w-0">
        <legend className="mb-3 text-base font-semibold text-wine-burgundy">
          {copy.attendance}
        </legend>
        <div className="flex flex-wrap gap-2">
          <Choice
            checked={attendance === "yes"}
            label={copy.yes}
            name="attended"
            onChange={() => setAttendance("yes")}
            required
            value="yes"
          />
          <Choice
            checked={attendance === "no"}
            label={copy.no}
            name="attended"
            onChange={() => setAttendance("no")}
            required
            value="no"
          />
        </div>
      </fieldset>

      {attendance === "no" ? (
        <fieldset className="min-w-0">
          <legend className="mb-3 text-base font-semibold text-wine-burgundy">
            {copy.nonattendance}
          </legend>
          <div className="grid max-w-xl gap-2">
            <ReasonChoice
              checked={nonattendanceReason === "illness"}
              label={copy.nonattendanceReasons.illness}
              name="nonattendance_reason"
              onChange={() => setNonattendanceReason("illness")}
              required
              value="illness"
            />
            <ReasonChoice
              checked={nonattendanceReason === "schedule_change"}
              label={copy.nonattendanceReasons.scheduleChange}
              name="nonattendance_reason"
              onChange={() => setNonattendanceReason("schedule_change")}
              required
              value="schedule_change"
            />
            <ReasonChoice
              checked={nonattendanceReason === "event_not_appealing"}
              label={copy.nonattendanceReasons.eventNotAppealing}
              name="nonattendance_reason"
              onChange={() => setNonattendanceReason("event_not_appealing")}
              required
              value="event_not_appealing"
            />
            <ReasonChoice
              checked={nonattendanceReason === "other"}
              label={copy.nonattendanceReasons.other}
              name="nonattendance_reason"
              onChange={() => setNonattendanceReason("other")}
              required
              value="other"
            />
            <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
              {copy.nonattendanceOtherLabel}
              <Textarea
                className="min-h-20 resize-none font-normal"
                maxLength={300}
                name="nonattendance_other"
                placeholder={copy.nonattendanceOtherPlaceholder}
                required={nonattendanceReason === "other"}
              />
            </label>
          </div>
        </fieldset>
      ) : null}

      {attendance === "yes" ? (
        <div className="grid min-w-0 gap-6">
          <StarRating
            highLabel={copy.overallHigh}
            initialValue={initialOverallRating}
            label={copy.overall}
            lowLabel={copy.overallLow}
            name="overall_rating"
          />
          <StarRating
            highLabel={copy.compatibilityHigh}
            label={copy.compatibility}
            lowLabel={copy.compatibilityLow}
            name="group_compatibility_rating"
          />
          <StarRating
            highLabel={copy.questionsHigh}
            label={copy.questions}
            lowLabel={copy.questionsLow}
            name="questions_rating"
          />
          <StarRating
            highLabel={copy.restaurantHigh}
            label={copy.restaurant}
            lowLabel={copy.restaurantLow}
            name="restaurant_rating"
          />
          {requiresHostRating ? (
            <StarRating
              highLabel={copy.hostHigh}
              label={copy.host}
              lowLabel={copy.hostLow}
              name="host_rating"
            />
          ) : null}

          <fieldset className="min-w-0">
            <legend className="mb-3 text-base font-semibold text-wine-burgundy">
              {copy.connections}
            </legend>
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Choice
                  checked={fallbackConnectionChoice === "yes"}
                  label={copy.yes}
                  name="wants_to_connect"
                  onChange={() => setFallbackConnectionChoice("yes")}
                  required
                  value="yes"
                />
                <Choice
                  checked={fallbackConnectionChoice === "no"}
                  label={copy.no}
                  name="wants_to_connect"
                  onChange={() => setFallbackConnectionChoice("no")}
                  required
                  value="no"
                />
              </div>
            </div>
          </fieldset>

          <label className="grid gap-2 text-base font-semibold text-wine-burgundy">
            {copy.comments}
            <Textarea
              className="min-h-28 font-normal"
              maxLength={2000}
              name="comments"
            />
          </label>
        </div>
      ) : null}

      {attendance ? (
        <div className="grid justify-items-start gap-3">
          <ActionStatus error={state.error} />
          <SubmitButton className="justify-self-start" pendingLabel={copy.saving}>
            {copy.submit}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

function ReasonChoice({
  checked,
  label,
  name,
  onChange,
  required = false,
  value,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: () => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine-burgundy/10 bg-white p-3 text-sm font-semibold text-wine-burgundy transition has-[:checked]:border-lipstick-red/40 has-[:checked]:bg-blush-pink hover:bg-blush-pink/60">
      <input
        checked={checked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-lipstick-red"
        name={name}
        onChange={onChange}
        required={required}
        type="radio"
        value={value}
      />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}

function Choice({
  checked,
  label,
  name,
  onChange,
  required = false,
  value,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: () => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="inline-flex max-w-full cursor-pointer">
      <input
        checked={checked}
        className="peer sr-only"
        name={name}
        onChange={onChange}
        required={required}
        type="radio"
        value={value}
      />
      <span className="flex min-h-10 max-w-full items-center justify-center rounded-lg border border-wine-burgundy/12 bg-white px-3 py-1.5 text-center text-sm font-semibold break-words text-wine-burgundy shadow-sm transition hover:border-lipstick-red/35 hover:bg-blush-pink peer-checked:border-lipstick-red peer-checked:bg-lipstick-red peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ocean-blue/35 peer-focus-visible:ring-offset-2">
        {label}
      </span>
    </label>
  );
}

function StarRating({
  highLabel,
  initialValue = null,
  label,
  lowLabel,
  name,
}: {
  highLabel: string;
  initialValue?: number | null;
  label: string;
  lowLabel: string;
  name: string;
}) {
  const [selected, setSelected] = useState<number | null>(initialValue);

  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-base font-semibold leading-6 text-wine-burgundy">
        {label}
      </legend>
      <div className="grid gap-2">
        <div className="grid w-full max-w-56 grid-cols-5 gap-1 sm:max-w-60">
          {[1, 2, 3, 4, 5].map((value) => (
            <label className="min-w-0 cursor-pointer" key={value}>
              <input
                checked={selected === value}
                className="peer sr-only"
                name={name}
                onChange={() => setSelected(value)}
                required
                type="radio"
                value={value}
              />
              <span
                className={cn(
                  "flex aspect-square w-full min-w-0 items-center justify-center rounded-lg text-faint transition hover:bg-blush-pink hover:text-lipstick-red peer-focus-visible:ring-2 peer-focus-visible:ring-ocean-blue/35 peer-focus-visible:ring-offset-2",
                  selected !== null && value <= selected
                    ? "text-lipstick-red"
                    : "",
                )}
              >
                <Star
                  aria-hidden="true"
                  className="h-6 w-6 sm:h-7 sm:w-7"
                  fill={
                    selected !== null && value <= selected
                      ? "currentColor"
                      : "none"
                  }
                />
                <span className="sr-only">{value}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex w-full max-w-56 justify-between gap-4 text-xs font-semibold text-faint sm:max-w-60">
          <span className="min-w-0">{lowLabel}</span>
          <span className="min-w-0 text-right">{highLabel}</span>
        </div>
      </div>
    </fieldset>
  );
}
