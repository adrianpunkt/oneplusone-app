"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Info, Save } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  savePreferencesAction,
  type FormActionState,
} from "@/lib/actions/profile";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { EventPreferences } from "@/lib/types";
import { cn } from "@/lib/utils";

const initialState: FormActionState = {};

function serializeForm(form: HTMLFormElement) {
  return JSON.stringify(
    Array.from(new FormData(form).entries()).filter(
      ([name, value]) =>
        !name.startsWith("$ACTION_") && typeof value === "string",
    ),
  );
}

export function PreferencesForm({
  copy,
  preferences,
  returnToDashboard = false,
  saved = false,
}: {
  copy: Dictionary["preferences"];
  preferences: EventPreferences | null;
  returnToDashboard?: boolean;
  saved?: boolean;
}) {
  const [state, action] = useActionState(savePreferencesAction, initialState);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const initialSnapshotRef = useRef<string | null>(null);
  const otherEventIdeas =
    typeof preferences?.extra_preferences?.other_event_ideas === "string"
      ? preferences.extra_preferences.other_event_ideas
      : "";
  const otherPreferences =
    typeof preferences?.extra_preferences?.other_preferences === "string"
      ? preferences.extra_preferences.other_preferences
      : "";
  const dietaryRestrictions = preferences?.dietary_restrictions || "";
  const [otherEventIdeasValue, setOtherEventIdeasValue] =
    useState(otherEventIdeas);
  const [showOtherEventIdeas, setShowOtherEventIdeas] = useState(
    preferences?.extra_preferences?.interested_in_other_events === true ||
      Boolean(otherEventIdeas),
  );
  const [showDietaryPreferences, setShowDietaryPreferences] = useState(
    Boolean(dietaryRestrictions),
  );
  const [dietaryRestrictionsValue, setDietaryRestrictionsValue] =
    useState(dietaryRestrictions);
  const [wantsToHost, setWantsToHost] = useState(
    preferences?.wants_to_host ?? false,
  );
  const updateDirtyState = useCallback(() => {
    const form = formRef.current;
    if (!form) return;

    const snapshot = serializeForm(form);
    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = snapshot;
    }
    setIsDirty(snapshot !== initialSnapshotRef.current);
  }, []);
  const scheduleDirtyCheck = useCallback(() => {
    window.requestAnimationFrame(updateDirtyState);
  }, [updateDirtyState]);

  useEffect(() => {
    updateDirtyState();
  }, [updateDirtyState]);

  return (
    <form
      action={action}
      className={cn("grid gap-6", isDirty && "pb-24")}
      onChange={scheduleDirtyCheck}
      onInput={scheduleDirtyCheck}
      ref={formRef}
    >
      {returnToDashboard ? (
        <input name="return_to" type="hidden" value="dashboard" />
      ) : null}

      <section aria-labelledby="events-preferences" className="grid gap-4">
        <h2
          id="events-preferences"
          className="font-display text-lg font-extrabold text-wine"
        >
          {copy.events}
        </h2>
        <p className="text-sm font-semibold text-ink">
          {copy.eventsQuestion}
        </p>
        <div className="grid gap-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4">
            <Checkbox
              name="prefers_saturday_dinner"
              defaultChecked={preferences?.prefers_saturday_dinner ?? true}
            />
            <span>
              <span className="block text-sm font-semibold text-wine">
                {copy.saturdayDinners}
              </span>
              <span className="block text-sm leading-6 text-muted">
                {copy.saturdayDescription}
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4">
            <Checkbox
              name="prefers_sunday_brunch"
              defaultChecked={preferences?.prefers_sunday_brunch ?? true}
            />
            <span>
              <span className="block text-sm font-semibold text-wine">
                {copy.sundayBrunches}
              </span>
              <span className="block text-sm leading-6 text-muted">
                {copy.sundayDescription}
              </span>
            </span>
          </label>
          <div className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                name="interested_in_other_events"
                checked={showOtherEventIdeas}
                onCheckedChange={(checked) => {
                  setShowOtherEventIdeas(checked === true);
                  scheduleDirtyCheck();
                }}
              />
              <span>
                <span className="block text-sm font-semibold text-wine">
                  {copy.otherIdeas}
                </span>
                <span className="block text-sm leading-6 text-muted">
                  {copy.otherIdeasDescription}
                </span>
              </span>
            </label>
            {showOtherEventIdeas ? (
              <div className="grid gap-2 pl-8">
                <Label htmlFor="otherEventIdeas" className="sr-only">
                  {copy.otherIdeas}
                </Label>
                <Textarea
                  id="otherEventIdeas"
                  name="other_event_ideas"
                  value={otherEventIdeasValue}
                  onChange={(event) =>
                    setOtherEventIdeasValue(event.target.value)
                  }
                  placeholder={copy.otherIdeasPlaceholder}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <Separator />

      <section aria-labelledby="going-out-vibe" className="grid gap-4">
        <h2
          id="going-out-vibe"
          className="font-display text-lg font-extrabold text-wine"
        >
          {copy.vibe}
        </h2>
        <p className="text-sm font-semibold text-ink">
          {copy.vibeQuestion}
        </p>
        <div className="grid gap-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4">
            <Checkbox
              name="prefers_affordable_relaxed_locations"
              defaultChecked={
                preferences?.extra_preferences
                  ?.prefers_affordable_relaxed_locations === true
              }
            />
            <span className="block text-sm font-semibold text-wine">
              {copy.affordable}
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4">
            <Checkbox
              name="prefers_michelin_guide_locations"
              defaultChecked={
                preferences?.extra_preferences
                  ?.prefers_michelin_guide_locations === true
              }
            />
            <span className="block text-sm font-semibold text-wine">
              {copy.michelin}
            </span>
          </label>
        </div>
      </section>

      <Separator />

      <section aria-labelledby="dietary-preferences" className="grid gap-4">
        <h2
          id="dietary-preferences"
          className="font-display text-lg font-extrabold text-wine"
        >
          {copy.dietary}
        </h2>
        <div className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={showDietaryPreferences}
              onCheckedChange={(checked) => {
                setShowDietaryPreferences(checked === true);
                scheduleDirtyCheck();
              }}
            />
            <span className="block text-sm font-semibold text-wine">
              {copy.dietaryQuestion}
            </span>
          </label>
          {showDietaryPreferences ? (
            <div className="grid gap-2 pl-8">
              <Label htmlFor="dietary" className="sr-only">
                {copy.dietaryQuestion}
              </Label>
              <Textarea
                id="dietary"
                name="dietary_restrictions"
                value={dietaryRestrictionsValue}
                onChange={(event) =>
                  setDietaryRestrictionsValue(event.target.value)
                }
                placeholder={copy.dietaryPlaceholder}
              />
            </div>
          ) : null}
        </div>
      </section>

      <Separator />

      <section aria-labelledby="hosting-preferences" className="grid gap-4">
        <h2
          id="hosting-preferences"
          className="font-display text-lg font-extrabold text-wine"
        >
          {copy.host}
        </h2>
        <div className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              name="wants_to_host"
              checked={wantsToHost}
              onCheckedChange={(checked) => {
                setWantsToHost(checked === true);
                scheduleDirtyCheck();
              }}
            />
            <span>
              <span className="block text-sm font-semibold text-wine">
                {copy.hostLabel}
              </span>
              <span className="mt-2 block text-sm leading-6 text-muted">
                {copy.hostDescription}
              </span>
            </span>
          </label>
          <div className="pl-8">
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <Button type="button" variant="secondary" size="sm">
                  <Info className="h-4 w-4" />
                  {copy.learnMore}
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-wine/35 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-wine/10 bg-white p-5 shadow-2xl">
                  <div className="grid gap-2">
                    <Dialog.Title className="font-display text-xl font-extrabold text-wine">
                      {copy.hostModalTitle}
                    </Dialog.Title>
                    <Dialog.Description className="grid gap-3 text-sm leading-6 text-muted">
                      {copy.hostModalBody.map((paragraph) => (
                        <span key={paragraph}>{paragraph}</span>
                      ))}
                    </Dialog.Description>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Dialog.Close asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setWantsToHost(false);
                          scheduleDirtyCheck();
                        }}
                      >
                        {copy.thinkAboutIt}
                      </Button>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <Button
                        type="button"
                        onClick={() => {
                          setWantsToHost(true);
                          scheduleDirtyCheck();
                        }}
                      >
                        {copy.imIn}
                      </Button>
                    </Dialog.Close>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      </section>

      <Separator />

      <section aria-labelledby="other-preferences" className="grid gap-4">
        <h2
          id="other-preferences"
          className="font-display text-lg font-extrabold text-wine"
        >
          {copy.otherPreferences}
        </h2>
        <p className="text-sm font-semibold text-ink">
          {copy.otherQuestion}
        </p>
        <Label htmlFor="otherPreferences" className="sr-only">
          {copy.otherPreferences}
        </Label>
        <Textarea
          id="otherPreferences"
          name="other_preferences"
          defaultValue={otherPreferences}
          placeholder={copy.otherPlaceholder}
        />
      </section>

      {isDirty ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 min-[901px]:left-[260px]">
          <div className="mx-auto flex w-full max-w-6xl justify-center px-4 sm:px-6 lg:px-8">
            <div className="pointer-events-auto flex min-w-0 flex-wrap items-center justify-center gap-3">
              <SubmitButton pendingLabel={copy.saving}>
                <Save className="h-4 w-4" />
                {copy.save}
              </SubmitButton>
              <Button asChild variant="secondary">
                <Link href={returnToDashboard ? "/dashboard" : "/going-out"}>
                  {copy.cancel}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <ActionStatus
        error={state.error}
        ok={state.ok || saved}
        successMessage={copy.saved}
        toastKey={state}
      />
    </form>
  );
}
