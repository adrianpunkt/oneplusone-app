"use client";

import {
  type ChangeEventHandler,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  HeartHandshake,
  HouseHeart,
  MessageCircleHeart,
  PartyPopper,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const steps = [
  {
    eyebrow: "01",
    title: "Your availability",
    description: "Let’s make invitations easier to say yes to.",
    icon: CalendarDays,
  },
  {
    eyebrow: "02",
    title: "Events you want",
    description: "Tell us which formats deserve a place on the calendar.",
    icon: PartyPopper,
  },
  {
    eyebrow: "03",
    title: "Hosting",
    description: "Help us understand who might like to bring people together.",
    icon: HouseHeart,
  },
  {
    eyebrow: "04",
    title: "Dating formats",
    description: "Choose the ways you would be comfortable meeting a match.",
    icon: HeartHandshake,
  },
  {
    eyebrow: "05",
    title: "Personalized matchmaking",
    description: "Tell us how you would like introductions between matching members to work.",
    icon: MessageCircleHeart,
  },
  {
    eyebrow: "06",
    title: "Community and new friends",
    description: "There is more than one kind of meaningful connection.",
    icon: UsersRound,
  },
] as const;

const surveyDraftStorageKey = "oneplusone:survey:valencia-aug2026:draft:v1";
const weekdayDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const weekendDays = ["saturday", "sunday"];
const eventTypeValues = [
  "dinners",
  "brunches",
  "drinks",
  "activities",
  "speed_dating",
];

type GroupErrors = Record<string, boolean>;

type SurveyDraft = {
  answers: Record<string, string[]>;
  revealedStep: number;
  version: 1;
};

function Question({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <fieldset className="grid gap-3 border-0 p-0">
      <legend className="text-base font-extrabold leading-6 text-wine-burgundy">{title}</legend>
      {description ? <p className="-mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      {children}
    </fieldset>
  );
}

function Choice({
  checked,
  description,
  label,
  name,
  onChange,
  required = false,
  type,
  value,
}: {
  checked?: boolean;
  description?: string;
  label: string;
  name: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  type: "checkbox" | "radio";
  value: string;
}) {
  return (
    <label className="group flex items-start gap-3 rounded-xl border border-wine-burgundy/10 bg-white px-4 py-3.5 shadow-sm transition hover:border-lipstick-red/30 hover:bg-lipstick-red/[0.025] has-[:checked]:border-lipstick-red/45 has-[:checked]:bg-lipstick-red/[0.055] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lipstick-red/20">
      <span className="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center">
        <input
          checked={checked}
          className={cn(
            "peer h-5 w-5 appearance-none border border-wine-burgundy/25 bg-white outline-none transition checked:border-lipstick-red checked:bg-lipstick-red focus-visible:ring-2 focus-visible:ring-lipstick-red/30",
            type === "radio" ? "rounded-full" : "rounded-md",
          )}
          name={name}
          onChange={onChange}
          required={required}
          type={type}
          value={value}
        />
        {type === "radio" ? (
          <span className="pointer-events-none absolute h-2 w-2 rounded-full bg-white opacity-0 peer-checked:opacity-100" />
        ) : (
          <Check
            aria-hidden="true"
            className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100"
          />
        )}
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm font-bold leading-5 text-ink">{label}</span>
        {description ? <span className="text-xs leading-5 text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

function RequiredCheckboxGroup({
  children,
  error,
  group,
  onSelectionChange,
}: {
  children: React.ReactNode;
  error: boolean;
  group: string;
  onSelectionChange?: (group: string, hasSelection: boolean) => void;
}) {
  return (
    <div
      aria-describedby={error ? `${group}-error` : undefined}
      className="grid w-full max-w-xl gap-2"
      data-required-group={group}
      onChange={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
        const hasSelection = Boolean(
          event.currentTarget.querySelector<HTMLInputElement>("input[type='checkbox']:checked"),
        );
        onSelectionChange?.(group, hasSelection);
      }}
    >
      {children}
      {error ? (
        <p
          className="text-sm font-semibold text-lipstick-red"
          id={`${group}-error`}
          role="alert"
        >
          Choose at least one option to continue.
        </p>
      ) : null}
    </div>
  );
}

function RadioQuestion({
  description,
  error,
  name,
  onChange,
  onSelectionChange,
  options,
  title,
}: {
  description?: string;
  error: boolean;
  name: string;
  onChange?: (value: string) => void;
  onSelectionChange?: (group: string, hasSelection: boolean) => void;
  options: Array<{ description?: string; label: string; value: string }>;
  title: string;
}) {
  return (
    <Question description={description} title={title}>
      <div
        aria-describedby={error ? `${name}-error` : undefined}
        className="grid w-full max-w-xl gap-2"
        data-required-group={name}
      >
        {options.map((option) => (
          <Choice
            description={option.description}
            key={option.value}
            label={option.label}
            name={name}
            onChange={() => {
              onChange?.(option.value);
              onSelectionChange?.(name, true);
            }}
            required
            type="radio"
            value={option.value}
          />
        ))}
        {error ? (
          <p
            className="text-sm font-semibold text-lipstick-red"
            id={`${name}-error`}
            role="alert"
          >
            Choose one option to continue.
          </p>
        ) : null}
      </div>
    </Question>
  );
}

function SectionHeading({ index }: { index: number }) {
  const step = steps[index];
  const StepIcon = step.icon;
  const totalSteps = String(steps.length).padStart(2, "0");

  return (
    <div className="flex items-start gap-4 rounded-xl bg-blush-pink/70 p-4 sm:p-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-wine-burgundy text-white shadow-sm">
        <StepIcon aria-hidden className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-lipstick-red">
          {step.eyebrow} of {totalSteps} · Valencia survey
        </p>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.02em] text-wine-burgundy sm:text-3xl">
          {step.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">{step.description}</p>
      </div>
    </div>
  );
}

export function ValenciaAugustSurveyForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const draftReadyRef = useRef(false);
  const [activeStep, setActiveStep] = useState(0);
  const [availabilityPeriods, setAvailabilityPeriods] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [hostingInterest, setHostingInterest] = useState("");
  const [groupErrors, setGroupErrors] = useState<GroupErrors>({});
  const [previewComplete, setPreviewComplete] = useState(false);

  const persistDraft = useCallback(() => {
    if (!draftReadyRef.current || !formRef.current) return;

    const answers: Record<string, string[]> = {};
    const formData = new FormData(formRef.current);

    formData.forEach((value, name) => {
      if (typeof value !== "string") return;
      answers[name] = [...(answers[name] ?? []), value];
    });

    const draft: SurveyDraft = {
      answers,
      revealedStep: activeStep,
      version: 1,
    };

    try {
      window.localStorage.setItem(surveyDraftStorageKey, JSON.stringify(draft));
    } catch {
      // The form still works when browser storage is unavailable.
    }
  }, [activeStep]);

  useEffect(() => {
    let draft: SurveyDraft | null = null;

    try {
      const storedDraft = window.localStorage.getItem(surveyDraftStorageKey);
      if (storedDraft) {
        const parsedDraft = JSON.parse(storedDraft) as Partial<SurveyDraft>;
        if (
          parsedDraft.version === 1 &&
          parsedDraft.answers &&
          typeof parsedDraft.answers === "object"
        ) {
          draft = {
            answers: parsedDraft.answers,
            revealedStep:
              typeof parsedDraft.revealedStep === "number"
                ? Math.min(Math.max(Math.floor(parsedDraft.revealedStep), 0), steps.length - 1)
                : 0,
            version: 1,
          };
        }
      }
    } catch {
      draft = null;
    }

    if (!draft) {
      draftReadyRef.current = true;
      return;
    }

    requestAnimationFrame(() => {
      if (!draft) return;

      setActiveStep(draft.revealedStep);
      setAvailabilityPeriods(
        (draft.answers.availability_period ?? []).filter(
          (value) => value === "weekdays" || value === "weekends",
        ),
      );
      setSelectedDays(
        (draft.answers.availability_days ?? []).filter((value) =>
          [...weekdayDays, ...weekendDays].includes(value),
        ),
      );
      setSelectedEventTypes(
        (draft.answers.event_types ?? [])
          .map((value) => (value === "matched_mini_dates" ? "speed_dating" : value))
          .filter((value) => eventTypeValues.includes(value)),
      );
      setHostingInterest((draft.answers.hosting_interest ?? [])[0] ?? "");

      requestAnimationFrame(() => {
        const form = formRef.current;
        if (!form || !draft) return;

        Array.from(form.elements).forEach((control) => {
          if (
            !(control instanceof HTMLInputElement) &&
            !(control instanceof HTMLTextAreaElement)
          ) {
            return;
          }

          const savedValues = draft.answers[control.name];
          if (!savedValues) return;

          if (control instanceof HTMLInputElement) {
            if (control.type === "checkbox" || control.type === "radio") {
              control.checked = savedValues.includes(control.value);
            } else {
              control.value = savedValues[0] ?? "";
            }
          } else {
            control.value = savedValues[0] ?? "";
          }
        });

        draftReadyRef.current = true;
      });
    });
  }, []);

  useEffect(() => {
    persistDraft();
  }, [availabilityPeriods, hostingInterest, persistDraft, selectedDays, selectedEventTypes]);

  const toggleAvailabilityPeriod = (period: "weekdays" | "weekends", checked: boolean) => {
    setAvailabilityPeriods((current) =>
      checked ? [...current, period] : current.filter((value) => value !== period),
    );

    if (!checked) {
      const daysToRemove = period === "weekdays" ? weekdayDays : weekendDays;
      setSelectedDays((current) =>
        current.filter((day) => !daysToRemove.includes(day)),
      );
    }
  };

  const toggleDay = (day: string, checked: boolean) => {
    setSelectedDays((current) =>
      checked
        ? [...current, day]
        : current.filter((value) => value !== day),
    );
  };

  const toggleEventType = (eventType: string, checked: boolean) => {
    setSelectedEventTypes((current) =>
      checked
        ? [...current, eventType]
        : current.filter((value) => value !== eventType),
    );
  };

  const handleRequiredGroupSelection = (group: string, hasSelection: boolean) => {
    setGroupErrors((current) => {
      if (!(group in current)) return current;
      return { ...current, [group]: !hasSelection };
    });
  };

  const validateStep = (step: number) => {
    const panel = formRef.current?.querySelector<HTMLElement>(
      `[data-step-panel="${step}"]`,
    );
    if (!panel) return false;

    const nextGroupErrors: GroupErrors = {};
    panel.querySelectorAll<HTMLElement>("[data-required-group]").forEach((group) => {
      const groupName = group.dataset.requiredGroup;
      if (!groupName) return;
      const checked = group.querySelector<HTMLInputElement>("input:checked");
      nextGroupErrors[groupName] = !checked;
    });
    setGroupErrors((current) => ({ ...current, ...nextGroupErrors }));

    const firstInvalidGroupName = Object.entries(nextGroupErrors).find(
      ([, hasError]) => hasError,
    )?.[0];
    const firstInvalidGroup = firstInvalidGroupName
      ? Array.from(panel.querySelectorAll<HTMLElement>("[data-required-group]")).find(
          (group) => group.dataset.requiredGroup === firstInvalidGroupName,
        )
      : undefined;

    if (firstInvalidGroup) {
      firstInvalidGroup.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalidGroup.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
      return false;
    }

    const firstInvalid = Array.from(
      panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[required], textarea[required]"),
    ).find((control) => !control.checkValidity());

    if (firstInvalid) {
      firstInvalid.reportValidity();
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalid.focus({ preventScroll: true });
    }

    return !firstInvalid && !Object.values(nextGroupErrors).some(Boolean);
  };

  const scrollToStep = (step: number) => {
    document.getElementById(`survey-step-${step}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const goForward = () => {
    if (!validateStep(activeStep)) return;
    const nextStep = Math.min(activeStep + 1, steps.length - 1);
    setActiveStep(nextStep);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToStep(nextStep));
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    for (let step = 0; step < steps.length; step += 1) {
      if (!validateStep(step)) {
        scrollToStep(step);
        return;
      }
    }
    setPreviewComplete(true);
    requestAnimationFrame(() => {
      document.getElementById("survey-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const progress = ((activeStep + 1) / steps.length) * 100;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <aside className="rounded-2xl border border-wine-burgundy/10 bg-white p-5 shadow-[0_18px_45px_rgba(68,10,18,0.05)] lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-4 lg:block">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-lipstick-red">
              {activeStep === steps.length - 1 ? "Success" : "Progress"}
            </p>
            <p className="mt-1 font-display text-lg font-extrabold text-wine-burgundy">
              Section {activeStep + 1} of {steps.length}
            </p>
          </div>
          <span className="text-sm font-bold text-muted">{Math.round(progress)}%</span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-wine-burgundy/8">
          <div
            className="h-full rounded-full bg-lipstick-red transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="mt-5 hidden gap-1 lg:grid">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isCurrent = index === activeStep;
            const isComplete = index < activeStep;
            return (
              <li key={step.title}>
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition",
                    isCurrent && "bg-lipstick-red/[0.07] text-wine-burgundy",
                    !isCurrent && "text-muted hover:bg-blush-pink hover:text-wine-burgundy",
                  )}
                  onClick={() => {
                    if (index <= activeStep) scrollToStep(index);
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full border",
                      isCurrent && "border-lipstick-red bg-lipstick-red text-white",
                      isComplete && "border-ocean-blue bg-ocean-blue text-white",
                      !isCurrent && !isComplete && "border-wine-burgundy/10 bg-blush-pink text-muted",
                    )}
                  >
                    {isComplete ? (
                      <Check aria-hidden className="h-4 w-4" />
                    ) : (
                      <StepIcon aria-hidden className="h-4 w-4" />
                    )}
                  </span>
                  <span className={cn("font-semibold", isCurrent && "font-extrabold")}>
                    {step.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <div
        className="overflow-hidden rounded-2xl border border-wine-burgundy/10 bg-white shadow-[0_24px_60px_rgba(68,10,18,0.08)]"
        id="survey-form"
      >
        {previewComplete ? (
          <div className="grid min-h-[34rem] place-items-center px-6 py-14 text-center sm:px-10">
            <div className="max-w-md">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ocean-blue/10 text-ocean-blue">
                <CheckCircle2 aria-hidden className="h-8 w-8" />
              </span>
              <h2 className="mt-6 font-display text-3xl font-extrabold tracking-[-0.025em] text-wine-burgundy">
                Thank you for being an awesome member of the{" "}
                <span className="text-lipstick-red">one plus one club</span>
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted">
                We are looking forward to shaping our events based on your preferences and
                suggestions.
              </p>
            </div>
          </div>
        ) : null}
          <form
            className={previewComplete ? "hidden" : undefined}
            noValidate
            onChange={() => persistDraft()}
            ref={formRef}
            onSubmit={handleSubmit}
          >
            <div className="px-5 py-7 sm:px-8 sm:py-9">
              <section
                className="grid scroll-mt-6 gap-8 pb-10"
                data-step-panel="0"
                id="survey-step-0"
              >
                <SectionHeading index={0} />
                <Question
                  description="Select one or both. We’ll ask for the exact days next."
                  title="When are you usually available?"
                >
                  <RequiredCheckboxGroup
                    error={Boolean(groupErrors.availability_period)}
                    group="availability_period"
                    onSelectionChange={handleRequiredGroupSelection}
                  >
                    <Choice
                      checked={availabilityPeriods.includes("weekdays")}
                      label="Monday – Friday"
                      name="availability_period"
                      onChange={(event) =>
                        toggleAvailabilityPeriod("weekdays", event.currentTarget.checked)
                      }
                      type="checkbox"
                      value="weekdays"
                    />
                    <Choice
                      checked={availabilityPeriods.includes("weekends")}
                      label="Weekends"
                      name="availability_period"
                      onChange={(event) =>
                        toggleAvailabilityPeriod("weekends", event.currentTarget.checked)
                      }
                      type="checkbox"
                      value="weekends"
                    />
                  </RequiredCheckboxGroup>
                </Question>

                {availabilityPeriods.length > 0 ? (
                  <Question
                    description="Select every day that normally works."
                    title="Which days are you available?"
                  >
                  <RequiredCheckboxGroup
                    error={Boolean(groupErrors.availability_days)}
                    group="availability_days"
                    onSelectionChange={handleRequiredGroupSelection}
                  >
                      {availabilityPeriods.includes("weekdays")
                        ? weekdayDays.map((day) => (
                            <Choice
                              checked={selectedDays.includes(day)}
                              key={day}
                              label={day[0].toUpperCase() + day.slice(1)}
                              name="availability_days"
                              onChange={(event) => toggleDay(day, event.currentTarget.checked)}
                              type="checkbox"
                              value={day}
                            />
                          ))
                        : null}
                      {availabilityPeriods.includes("weekends")
                        ? weekendDays.map((day) => (
                            <Choice
                              checked={selectedDays.includes(day)}
                              key={day}
                              label={day[0].toUpperCase() + day.slice(1)}
                              name="availability_days"
                              onChange={(event) => toggleDay(day, event.currentTarget.checked)}
                              type="checkbox"
                              value={day}
                            />
                          ))
                        : null}
                    </RequiredCheckboxGroup>
                  </Question>
                ) : null}

                {selectedDays.length > 0 ? (
                  <RadioQuestion
                    error={Boolean(groupErrors.time_preference)}
                    name="time_preference"
                    onSelectionChange={handleRequiredGroupSelection}
                    options={[
                      { label: "Prefer mornings", value: "mornings" },
                      { label: "Prefer evenings", value: "evenings" },
                      { label: "Both work", value: "both" },
                    ]}
                    title="What time works best?"
                  />
                ) : null}

                <RadioQuestion
                  error={Boolean(groupErrors.schedule_regularness)}
                  name="schedule_regularness"
                  onSelectionChange={handleRequiredGroupSelection}
                  options={[
                    { label: "Same schedule every week", value: "same_every_week" },
                    { label: "Days might change sometimes", value: "changes_sometimes" },
                    { label: "My schedule varies every week", value: "varies_every_week" },
                  ]}
                  title="How often does your availability change?"
                />

                <RadioQuestion
                  error={Boolean(groupErrors.planning_window)}
                  name="planning_window"
                  onSelectionChange={handleRequiredGroupSelection}
                  options={[
                    { label: "Current week is fine", value: "current_week" },
                    { label: "Prefer a week in advance", value: "one_week" },
                    { label: "At least 2 weeks so I can plan", value: "two_weeks_or_more" },
                  ]}
                  title="How far in advance would you like to plan?"
                />

                <Question
                  description="Select one or both."
                  title="Which types of invitations would you prefer?"
                >
                  <RequiredCheckboxGroup
                    error={Boolean(groupErrors.invitation_types)}
                    group="invitation_types"
                    onSelectionChange={handleRequiredGroupSelection}
                  >
                    <Choice
                      label="For a fixed day and time"
                      name="invitation_types"
                      type="checkbox"
                      value="fixed_day_and_time"
                    />
                    <Choice
                      label="With multiple days to choose from"
                      name="invitation_types"
                      type="checkbox"
                      value="multiple_days"
                    />
                  </RequiredCheckboxGroup>
                </Question>

                <Question
                  description="OPTIONAL"
                  title="Anything else useful to know about your availability?"
                >
                  <Textarea
                    maxLength={1000}
                    name="availability_notes"
                    rows={4}
                  />
                </Question>
              </section>

              <section
                className="grid scroll-mt-6 gap-8 border-t border-wine-burgundy/10 py-10"
                data-step-panel="1"
                hidden={activeStep < 1}
                id="survey-step-1"
              >
                <SectionHeading index={1} />
                <Question
                  description="Choose everything you would genuinely consider attending."
                  title="Which event types appeal to you?"
                >
                  <RequiredCheckboxGroup
                    error={Boolean(groupErrors.event_types)}
                    group="event_types"
                    onSelectionChange={handleRequiredGroupSelection}
                  >
                    <Choice
                      checked={selectedEventTypes.includes("dinners")}
                      label="Dinners"
                      name="event_types"
                      onChange={(event) =>
                        toggleEventType("dinners", event.currentTarget.checked)
                      }
                      type="checkbox"
                      value="dinners"
                    />
                    <Choice
                      checked={selectedEventTypes.includes("brunches")}
                      label="Brunches"
                      name="event_types"
                      onChange={(event) =>
                        toggleEventType("brunches", event.currentTarget.checked)
                      }
                      type="checkbox"
                      value="brunches"
                    />
                    <Choice
                      checked={selectedEventTypes.includes("drinks")}
                      label="Drinks"
                      name="event_types"
                      onChange={(event) =>
                        toggleEventType("drinks", event.currentTarget.checked)
                      }
                      type="checkbox"
                      value="drinks"
                    />
                    <Choice
                      checked={selectedEventTypes.includes("speed_dating")}
                      label="Speed dating"
                      name="event_types"
                      onChange={(event) =>
                        toggleEventType("speed_dating", event.currentTarget.checked)
                      }
                      type="checkbox"
                      value="speed_dating"
                    />
                    <Choice
                      checked={selectedEventTypes.includes("activities")}
                      label="Other activities"
                      name="event_types"
                      onChange={(event) =>
                        toggleEventType("activities", event.currentTarget.checked)
                      }
                      type="checkbox"
                      value="activities"
                    />
                  </RequiredCheckboxGroup>
                </Question>

                {selectedEventTypes.includes("activities") ? (
                  <Question
                    description="Select everything you would enjoy."
                    title="Which activities appeal to you?"
                  >
                  <RequiredCheckboxGroup
                    error={Boolean(groupErrors.activity_types)}
                    group="activity_types"
                    onSelectionChange={handleRequiredGroupSelection}
                  >
                      <Choice label="Hikes" name="activity_types" type="checkbox" value="hikes" />
                      <Choice label="Walks" name="activity_types" type="checkbox" value="walks" />
                      <Choice label="Picnics" name="activity_types" type="checkbox" value="picnics" />
                      <Choice label="Running" name="activity_types" type="checkbox" value="running" />
                      <Choice label="Padel" name="activity_types" type="checkbox" value="padel" />
                      <Choice label="Fitness sessions" name="activity_types" type="checkbox" value="fitness_sessions" />
                      <Choice label="Cooking lessons" name="activity_types" type="checkbox" value="cooking_lessons" />
                      <Choice label="Dancing classes" name="activity_types" type="checkbox" value="dancing_classes" />
                      <Choice label="Wine tastings" name="activity_types" type="checkbox" value="wine_tastings" />
                      <Choice label="Day trips" name="activity_types" type="checkbox" value="day_trips" />
                      <Choice label="Live music concerts" name="activity_types" type="checkbox" value="live_music_concerts" />
                      <Choice label="Volleyball games" name="activity_types" type="checkbox" value="volleyball_games" />
                      <Choice label="Board game nights" name="activity_types" type="checkbox" value="board_game_nights" />
                      <Choice label="Escape rooms" name="activity_types" type="checkbox" value="escape_rooms" />
                      <Choice label="Vegan/vegetarian meals" name="activity_types" type="checkbox" value="vegan_vegetarian_meals" />
                      <Choice label="Volunteering" name="activity_types" type="checkbox" value="volunteering" />
                      <Choice label="Pottery" name="activity_types" type="checkbox" value="pottery" />
                    </RequiredCheckboxGroup>
                  </Question>
                ) : null}

                <Question description="OPTIONAL" title="What else would you like us to try?">
                  <Textarea
                    maxLength={1000}
                    name="other_event_type"
                    rows={4}
                  />
                </Question>
              </section>

              <section
                className="grid scroll-mt-6 gap-8 border-t border-wine-burgundy/10 py-10"
                data-step-panel="2"
                hidden={activeStep < 2}
                id="survey-step-2"
              >
                <SectionHeading index={2} />
                <RadioQuestion
                  description="If you’re passionate about a particular activity or just love bringing people together, you tell us what you want to organize and we find a small group of singles who match your dating intentions and invite them to the event, same small groups format and same balanced genders ratio, just driven by your interests."
                  error={Boolean(groupErrors.hosting_interest)}
                  name="hosting_interest"
                  onChange={setHostingInterest}
                  onSelectionChange={handleRequiredGroupSelection}
                  options={[
                    { label: "Yes, I’d love to", value: "yes" },
                    { label: "Maybe — tell me more", value: "maybe" },
                    { label: "Not right now", value: "no" },
                  ]}
                  title="Would you like to host or organise an event for the community?"
                />

                {hostingInterest === "yes" || hostingInterest === "maybe" ? (
                  <RadioQuestion
                    description="This puts you in the spotlight and attracts more people who might have the same interests. We will still filter people attending the event by age, gender, and other preferences."
                    error={Boolean(groupErrors.host_promotion_interest)}
                    name="host_promotion_interest"
                    onSelectionChange={handleRequiredGroupSelection}
                    options={[
                      { label: "Yes", value: "yes" },
                      { label: "Maybe", value: "maybe" },
                      { label: "No", value: "no" },
                    ]}
                    title="Would you be interested in us featuring you and your event on our social media?"
                  />
                ) : null}

                <Question title="Anything that would make hosting feel easier? (optional)">
                  <Textarea
                    maxLength={1000}
                    name="hosting_support"
                    rows={4}
                  />
                </Question>
              </section>

              <section
                className="grid scroll-mt-6 gap-8 border-t border-wine-burgundy/10 py-10"
                data-step-panel="3"
                hidden={activeStep < 3}
                id="survey-step-3"
              >
                <SectionHeading index={3} />
                <Question
                  description="Choose every format you would consider."
                  title="Which more personal dating formats interest you?"
                >
                  <RequiredCheckboxGroup
                    error={Boolean(groupErrors.dating_formats)}
                    group="dating_formats"
                    onSelectionChange={handleRequiredGroupSelection}
                  >
                    <Choice
                      description="Matched by intentions and preferences with a gender balance"
                      label="Small groups of 6–12 people max"
                      name="dating_formats"
                      type="checkbox"
                      value="six_or_more_balanced"
                    />
                    <Choice
                      description="Four matched members with gender parity"
                      label="2 + 2 events"
                      name="dating_formats"
                      type="checkbox"
                      value="two_plus_two"
                    />
                    <Choice
                      description="Invite your friend to join, we’ll find a match for both of you and organize a date for 4 people."
                      label="Bring a friend and double date"
                      name="dating_formats"
                      type="checkbox"
                      value="bring_a_single_friend"
                    />
                    <Choice
                      description="We find another person that matches your intentions, age range and other preferences and organize a date for both of you."
                      label="One + one blind date"
                      name="dating_formats"
                      type="checkbox"
                      value="blind_date"
                    />
                    <Choice
                      description="An exclusive dinner event for 2 + 2 or 1 + 1 singles with the same dating intentions and a similar lifestyle at a Michelin Guide venue (or similar)."
                      label="Premium dinner"
                      name="dating_formats"
                      type="checkbox"
                      value="premium_dinner"
                    />
                  </RequiredCheckboxGroup>
                </Question>

                <Question description="OPTIONAL" title="Any other dating format suggestions?">
                  <Textarea
                    maxLength={1000}
                    name="dating_format_suggestions"
                    rows={4}
                  />
                </Question>
              </section>

              <section
                className="grid scroll-mt-6 gap-8 border-t border-wine-burgundy/10 py-10"
                data-step-panel="4"
                hidden={activeStep < 4}
                id="survey-step-4"
              >
                <SectionHeading index={4} />

                <RadioQuestion
                  description="They can read about you and choose if they would like to connect."
                  error={Boolean(groupErrors.personal_introductions)}
                  name="personal_introductions"
                  onSelectionChange={handleRequiredGroupSelection}
                  options={[
                    { label: "Yes", value: "yes" },
                    { label: "Maybe — tell me more", value: "maybe" },
                    { label: "No", value: "no" },
                  ]}
                  title="Would you be interested in us introducing you to matching members?"
                />

                <RadioQuestion
                  description="You can review and decide to connect to find out more."
                  error={Boolean(groupErrors.proactive_introductions)}
                  name="proactive_introductions"
                  onSelectionChange={handleRequiredGroupSelection}
                  options={[
                    { label: "Yes", value: "yes" },
                    { label: "Maybe — tell me more", value: "maybe" },
                    { label: "No", value: "no" },
                  ]}
                  title="Would you like us to introduce other matching members to you?"
                />
              </section>

              <section
                className="grid scroll-mt-6 gap-8 border-t border-wine-burgundy/10 pt-10"
                data-step-panel="5"
                hidden={activeStep < 5}
                id="survey-step-5"
              >
                <SectionHeading index={5} />
                <RadioQuestion
                  description="Meet other people of the same gender and age range as you."
                  error={Boolean(groupErrors.similar_life_stage)}
                  name="similar_life_stage"
                  onSelectionChange={handleRequiredGroupSelection}
                  options={[
                    { label: "Yes", value: "yes" },
                    { label: "Maybe — tell me more", value: "maybe" },
                    { label: "No preference", value: "no_preference" },
                  ]}
                  title="Would you like to join events for people at a similar life stage?"
                />

                <RadioQuestion
                  description="Regardless of age and gender, the events will be focused on roots and origins."
                  error={Boolean(groupErrors.mother_language)}
                  name="mother_language"
                  onSelectionChange={handleRequiredGroupSelection}
                  options={[
                    { label: "Yes", value: "yes" },
                    { label: "Maybe — tell me more", value: "maybe" },
                    { label: "No preference", value: "no_preference" },
                  ]}
                  title="Would you like to meet people who speak your mother language?"
                />

                <Question
                  description="OPTIONAL"
                  title="Any other types of friendships that are interesting to you?"
                >
                  <Textarea
                    maxLength={1500}
                    name="friendship_suggestions"
                    rows={5}
                  />
                </Question>

              </section>
            </div>

            <div className="flex items-center justify-center border-t border-wine-burgundy/10 bg-blush-pink/55 px-5 py-5 sm:px-8">
              {activeStep < steps.length - 1 ? (
                <Button onClick={goForward} type="button">
                  Continue
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit">
                  Submit answers
                  <CheckCircle2 aria-hidden className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div aria-hidden="true" className="h-[65vh]" />
          </form>
      </div>
    </div>
  );
}
