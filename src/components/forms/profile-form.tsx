"use client";

import { useActionState } from "react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveProfileAction, type FormActionState } from "@/lib/actions/profile";
import type { ProfileRegistration } from "@/lib/types";
import { storyValue } from "@/lib/utils";

const initialState: FormActionState = {};

export function ProfileForm({ profile }: { profile: ProfileRegistration | null }) {
  const [state, action] = useActionState(saveProfileAction, initialState);
  const story = profile?.profile_json || {};

  if (!profile) {
    return (
      <div className="rounded-lg border border-lipstick/15 bg-lipstick/8 p-4 text-sm font-semibold leading-6 text-wine">
        No submitted story is linked to this account yet. Log in with the email used on the
        website story flow, or submit your story there first.
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="profile.first_name" defaultValue={storyValue(story, "profile.first_name")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="age">Age</Label>
          <Input id="age" name="profile.age" inputMode="numeric" defaultValue={storyValue(story, "profile.age")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="eventLocation">Can meet in</Label>
          <Input
            id="eventLocation"
            name="profile.event_location"
            defaultValue={storyValue(story, "profile.event_location")}
            placeholder="Valencia"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dateLanguages">Date languages</Label>
          <Input
            id="dateLanguages"
            name="profile.date_languages"
            defaultValue={storyValue(story, "profile.date_languages")}
            placeholder="English, Spanish"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="relationshipStatus">Relationship status</Label>
          <Input
            id="relationshipStatus"
            name="profile.relationship_status"
            defaultValue={storyValue(story, "profile.relationship_status")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="availableRelationships">Open to</Label>
          <Input
            id="availableRelationships"
            name="profile.available_relationships"
            defaultValue={storyValue(story, "profile.available_relationships")}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="anythingElse">Anything else</Label>
        <Textarea
          id="anythingElse"
          name="profile.anything_else"
          defaultValue={storyValue(story, "profile.anything_else")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Save story</SubmitButton>
        <ActionStatus error={state.error} ok={state.ok} />
      </div>
    </form>
  );
}
