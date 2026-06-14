"use client";

import { useActionState } from "react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { savePreferencesAction, type FormActionState } from "@/lib/actions/profile";
import type { EventPreferences } from "@/lib/types";

const initialState: FormActionState = {};

export function PreferencesForm({
  preferences,
}: {
  preferences: EventPreferences | null;
}) {
  const [state, action] = useActionState(savePreferencesAction, initialState);

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4">
          <Checkbox
            name="prefers_saturday_dinner"
            defaultChecked={preferences?.prefers_saturday_dinner ?? true}
          />
          <span>
            <span className="block text-sm font-bold text-wine">Saturday dinners</span>
            <span className="block text-sm leading-6 text-muted">Evening tables and slower conversations.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4">
          <Checkbox
            name="prefers_sunday_brunch"
            defaultChecked={preferences?.prefers_sunday_brunch ?? true}
          />
          <span>
            <span className="block text-sm font-bold text-wine">Sunday brunches</span>
            <span className="block text-sm leading-6 text-muted">Daytime, lighter, and easier to fit in.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4 sm:col-span-2">
          <Checkbox name="wants_to_host" defaultChecked={preferences?.wants_to_host ?? false} />
          <span>
            <span className="block text-sm font-bold text-wine">I am open to hosting</span>
            <span className="block text-sm leading-6 text-muted">
              Hosts help the group find the table and get the first conversation moving.
            </span>
          </span>
        </label>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="dietary">Dietary restrictions</Label>
        <Textarea
          id="dietary"
          name="dietary_restrictions"
          defaultValue={preferences?.dietary_restrictions || ""}
          placeholder="Allergies, vegetarian/vegan, or anything we should consider."
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="hostNotes">Host notes</Label>
        <Textarea
          id="hostNotes"
          name="host_notes"
          defaultValue={preferences?.host_notes || ""}
          placeholder="Anything that would help us decide when hosting makes sense."
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Save preferences</SubmitButton>
        <ActionStatus error={state.error} ok={state.ok} />
      </div>
    </form>
  );
}
