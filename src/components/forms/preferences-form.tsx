"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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
import type { EventPreferences } from "@/lib/types";

const initialState: FormActionState = {};

export function PreferencesForm({
  preferences,
  returnToDashboard = false,
  saved = false,
}: {
  preferences: EventPreferences | null;
  returnToDashboard?: boolean;
  saved?: boolean;
}) {
  const [state, action] = useActionState(savePreferencesAction, initialState);
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

  return (
    <form action={action} className="grid gap-6 pb-24">
      {returnToDashboard ? (
        <input name="return_to" type="hidden" value="dashboard" />
      ) : null}

      <section aria-labelledby="events-preferences" className="grid gap-4">
        <h2
          id="events-preferences"
          className="font-display text-lg font-extrabold text-wine"
        >
          Events
        </h2>
        <p className="text-sm font-bold text-ink">
          Which events would you like to be invited to?
        </p>
        <div className="grid gap-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4">
            <Checkbox
              name="prefers_saturday_dinner"
              defaultChecked={preferences?.prefers_saturday_dinner ?? true}
            />
            <span>
              <span className="block text-sm font-bold text-wine">
                Saturday dinners
              </span>
              <span className="block text-sm leading-6 text-muted">
                Organized usually at 8pm in a restaurant.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine/10 bg-blush p-4">
            <Checkbox
              name="prefers_sunday_brunch"
              defaultChecked={preferences?.prefers_sunday_brunch ?? true}
            />
            <span>
              <span className="block text-sm font-bold text-wine">
                Sunday brunches
              </span>
              <span className="block text-sm leading-6 text-muted">
                Organized in a cafe or brunch restaurant at 12pm.
              </span>
            </span>
          </label>
          <div className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                name="interested_in_other_events"
                checked={showOtherEventIdeas}
                onCheckedChange={(checked) =>
                  setShowOtherEventIdeas(checked === true)
                }
              />
              <span>
                <span className="block text-sm font-bold text-wine">
                  Other ideas?
                </span>
                <span className="block text-sm leading-6 text-muted">
                  Tell us what else you&apos;d be interested in.
                </span>
              </span>
            </label>
            {showOtherEventIdeas ? (
              <div className="grid gap-2 pl-8">
                <Label htmlFor="otherEventIdeas" className="sr-only">
                  Other event ideas
                </Label>
                <Textarea
                  id="otherEventIdeas"
                  name="other_event_ideas"
                  value={otherEventIdeasValue}
                  onChange={(event) =>
                    setOtherEventIdeasValue(event.target.value)
                  }
                  placeholder="Tell us what else you'd be interested in."
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
          Going out vibe
        </h2>
        <p className="text-sm font-bold text-ink">
          What kind of locations would you prefer for the events?
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
            <span className="block text-sm font-bold text-wine">
              Somewhere affordable and relaxed
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
            <span className="block text-sm font-bold text-wine">
              Michelin-guide territory
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
          Dietary preferences
        </h2>
        <div className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={showDietaryPreferences}
              onCheckedChange={(checked) =>
                setShowDietaryPreferences(checked === true)
              }
            />
            <span className="block text-sm font-bold text-wine">
              Anything we need to be aware of?
            </span>
          </label>
          {showDietaryPreferences ? (
            <div className="grid gap-2 pl-8">
              <Label htmlFor="dietary" className="sr-only">
                Anything we need to be aware of?
              </Label>
              <Textarea
                id="dietary"
                name="dietary_restrictions"
                value={dietaryRestrictionsValue}
                onChange={(event) =>
                  setDietaryRestrictionsValue(event.target.value)
                }
                placeholder="Allergies, vegetarian/vegan, or anything we should consider."
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
          Host preference
        </h2>
        <div className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              name="wants_to_host"
              checked={wantsToHost}
              onCheckedChange={(checked) => setWantsToHost(checked === true)}
            />
            <span>
              <span className="block text-sm font-bold text-wine">
                I am open to be the host
              </span>
              <span className="mt-2 block text-sm leading-6 text-muted">
                You can attend an event for free by opting to be the host.
                You&apos;ll also benefit from all the attention ;)
              </span>
            </span>
          </label>
          <div className="pl-8">
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <Button type="button" variant="secondary" size="sm">
                  <Info className="h-4 w-4" />
                  Learn more
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-wine/35 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-wine/10 bg-white p-5 shadow-2xl">
                  <div className="grid gap-2">
                    <Dialog.Title className="font-display text-xl font-black text-wine">
                      Being the host
                    </Dialog.Title>
                    <Dialog.Description className="grid gap-3 text-sm leading-6 text-muted">
                      <span>
                        Hosting the event is very easy, and it&apos;s fun, plus
                        you get the spotlight and more attention, double plus
                        you get your credit back after the event. Need we say
                        more?!
                      </span>
                      <span>
                        We want the events to be relaxed and fun, and the host
                        will be the one initiating the conversational games we
                        have prepared. We&apos;ll send you all the instructions
                        in advance.
                      </span>
                      <span>
                        Please note anyone can opt to be the host at the event
                        and we aim to give everyone a chance. As soon as the
                        event is confirmed, you&apos;ll be notified if you were
                        elected to be the host.
                      </span>
                    </Dialog.Description>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Dialog.Close asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setWantsToHost(false)}
                      >
                        I&apos;ll think about it
                      </Button>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <Button
                        type="button"
                        onClick={() => setWantsToHost(true)}
                      >
                        I&apos;m in!
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
          Other preferences?
        </h2>
        <p className="text-sm font-bold text-ink">
          What would make these events even better for you?
        </p>
        <Label htmlFor="otherPreferences" className="sr-only">
          Other preferences
        </Label>
        <Textarea
          id="otherPreferences"
          name="other_preferences"
          defaultValue={otherPreferences}
          placeholder="The best ideas come from members, and we genuinely try to accommodate them."
        />
      </section>

      <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 min-[901px]:left-[260px]">
        <div className="mx-auto flex w-full max-w-6xl justify-center px-4 sm:px-6 lg:px-8">
          <div className="pointer-events-auto flex min-w-0 flex-wrap items-center justify-center gap-3">
            <SubmitButton pendingLabel="Saving preferences...">
              <Save className="h-4 w-4" />
              Save preferences
            </SubmitButton>
            <Button asChild variant="secondary">
              <Link href={returnToDashboard ? "/dashboard" : "/going-out"}>
                Cancel
              </Link>
            </Button>
            <ActionStatus
              error={state.error}
              ok={state.ok || saved}
              successMessage="Preferences saved."
              toastKey={state}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
