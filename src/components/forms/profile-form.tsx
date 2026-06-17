"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, Plus, Save } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { ProfileImageUploader } from "@/components/forms/profile-image-uploader";
import { SubmitButton } from "@/components/forms/submit-button";
import { StoryAutocompleteField } from "@/components/forms/story-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { saveProfileAction, type FormActionState } from "@/lib/actions/profile";
import type { ProfileRegistration } from "@/lib/types";
import { cn, storyValue } from "@/lib/utils";

const initialState: FormActionState = {};
const ageOptions = Array.from({ length: 72 }, (_, index) => String(18 + index));
const heightOptions = Array.from({ length: 131 }, (_, index) =>
  String(100 + index),
);
const noneDealBreaker = "none — I'm pretty easygoing";
const storyTextClass =
  "min-w-0 max-w-full text-xl font-medium leading-8 text-ink [overflow-wrap:anywhere] sm:text-2xl sm:leading-9";
const SELECT_DIALOG_MIN_WIDTH = 300;
const SELECT_DIALOG_MAX_WIDTH = 520;

type Mode = "read" | "edit";
type Option = {
  value: string;
  label: string;
};
type ProfileImageConfig = {
  currentImageUrl: string;
  displayName: string;
  hasProfile: boolean;
};

const DirtyCheckContext = createContext<(() => void) | null>(null);

function useDirtyCheck() {
  return useContext(DirtyCheckContext);
}

function serializeForm(form: HTMLFormElement) {
  return JSON.stringify(
    Array.from(new FormData(form).entries()).filter(
      ([name, value]) =>
        !name.startsWith("$ACTION_") && typeof value === "string",
    ),
  );
}

const genderOptions: Option[] = [
  { value: "Female", label: "female" },
  { value: "Male", label: "male" },
  { value: "other", label: "other" },
];

const orientationOptions: Option[] = [
  { value: "Heterosexual", label: "heterosexual" },
  { value: "Homosexual", label: "homosexual" },
  { value: "Bisexual", label: "bisexual" },
  { value: "Other", label: "other" },
];

const homeBaseOptions: Option[] = [
  { value: "live in one place", label: "living in one place" },
  { value: "travel mostly", label: "traveling mostly" },
];

const geographyOptions: Option[] = [
  { value: "in the same city", label: "in the same city" },
  { value: "in the same region", label: "in the same region" },
  { value: "long-distance", label: "long-distance" },
];

const relocationOptions: Option[] = [
  { value: "off the table", label: "off the table" },
  {
    value: "possible for the right person",
    label: "possible for the right person",
  },
];

const mattersOptions: Option[] = [
  { value: "No, not really", label: "doesn't really matter" },
  { value: "Yes", label: "matters" },
];

const relationshipStatusOptions: Option[] = [
  { value: "Single", label: "single" },
  { value: "Married, but separated", label: "married, but separated" },
  { value: "Divorcing (in process)", label: "divorcing (in process)" },
  { value: "Divorced", label: "divorced" },
  { value: "Widowed", label: "widowed" },
  { value: "Open / polyamorous", label: "open / polyamorous" },
];

const relationshipOptions: Option[] = [
  { value: "Marriage / life partner", label: "marriage / life partner" },
  { value: "Exclusive relationship", label: "exclusive relationship" },
  {
    value: "Casual dating, seeing where it goes",
    label: "casual dating, seeing where it goes",
  },
  { value: "Ethical non-monogamy", label: "ethical non-monogamy" },
  { value: "Not sure - still exploring", label: "not sure - still exploring" },
];

const childrenOptions: Option[] = [
  { value: "I definitely want children", label: "I definitely want children" },
  {
    value: "Maybe, depends on the person/timing",
    label: "maybe - depends on the person and the timing",
  },
  {
    value: "I definitely don't want children",
    label: "I definitely don't want children",
  },
  {
    value: "I already have children and would like more",
    label: "I already have children and would like more",
  },
  {
    value: "I already have children and don't want more",
    label: "I already have children and don't want more",
  },
];

const religionOptions: Option[] = [
  { value: "central to my life", label: "central to my life" },
  { value: "important but private", label: "important but private" },
  { value: "not really important", label: "not really important" },
  { value: "something I'd rather avoid", label: "something I'd rather avoid" },
];

const alignmentOptions: Option[] = [
  { value: "not important", label: "not important" },
  { value: "somewhat important", label: "somewhat important" },
  { value: "very important", label: "very important" },
];

const faithOptions: Option[] = [
  { value: "Christian (Catholic)", label: "Christian (Catholic)" },
  { value: "Christian (Protestant)", label: "Christian (Protestant)" },
  { value: "Christian (Orthodox)", label: "Christian (Orthodox)" },
  { value: "Christian (other)", label: "Christian (other)" },
  { value: "Jewish", label: "Jewish" },
  { value: "Muslim", label: "Muslim" },
  { value: "Hindu", label: "Hindu" },
  { value: "Buddhist", label: "Buddhist" },
  { value: "Sikh", label: "Sikh" },
  {
    value: "Spiritual but not affiliated",
    label: "spiritual, but not affiliated",
  },
  { value: "Other", label: "other" },
];

const politicalImportanceOptions: Option[] = [
  { value: "not important to me", label: "not important to me" },
  { value: "somewhat important", label: "somewhat important" },
  { value: "very important", label: "very important" },
];

const politicsOptions: Option[] = [
  { value: "progressive", label: "progressive" },
  { value: "center-left", label: "center-left" },
  { value: "mixed or moderate", label: "mixed or moderate" },
  { value: "center-right", label: "center-right" },
  { value: "conservative", label: "conservative" },
  { value: "apolitical", label: "apolitical" },
];

const financialImportanceOptions: Option[] = [
  { value: "a little", label: "a little" },
  { value: "mostly", label: "mostly" },
  { value: "completely", label: "completely" },
];

const financialOptions: Option[] = [
  { value: "save more than I spend", label: "save more than I spend" },
  {
    value: "balance saving and enjoying",
    label: "balance saving and enjoying",
  },
  {
    value: "spend on experiences, save what's left",
    label: "spend on experiences, save what's left",
  },
  {
    value: "live in the present and let money sort itself out",
    label: "live in the present and let money sort itself out",
  },
];

const fitnessOptions: Option[] = [
  { value: "not important", label: "not important" },
  { value: "a casual part of my week", label: "a casual part of my week" },
  {
    value: "a consistent habit I keep up",
    label: "a consistent habit I keep up",
  },
  {
    value: "regular training with specific goals",
    label: "regular training with specific goals",
  },
  {
    value: "my profession (coach, instructor, athlete)",
    label: "my profession (coach, instructor, athlete)",
  },
];

const rhythmOptions: Option[] = [
  { value: "very quiet", label: "very quiet" },
  {
    value: "mostly calm, occasionally social",
    label: "mostly calm, occasionally social",
  },
  { value: "balanced mix", label: "balanced mix" },
  { value: "mostly active", label: "mostly active" },
  { value: "always something going on", label: "always something going on" },
];

const dealBreakerOptions: Option[] = [
  { value: noneDealBreaker, label: "none — I'm pretty easygoing" },
  { value: "Smoker", label: "smoking" },
  { value: "Heavy drinker", label: "heavy drinking" },
  { value: "Different religion", label: "different religion" },
  { value: "Different political views", label: "different political views" },
  { value: "Previously married", label: "previously married" },
  { value: "Has children", label: "has children" },
  { value: "Wants children", label: "wants children" },
  { value: "Family involvement", label: "family involvement" },
  { value: "Lives more than [X] km away", label: "lives too far away" },
  { value: "Large age gap (>10 yrs)", label: "large age gap (>10 yrs)" },
  { value: "Different education level", label: "different education level" },
  { value: "Money / financial habits", label: "money / financial habits" },
  {
    value: "Substance / party lifestyle",
    label: "substance / party lifestyle",
  },
  {
    value: "Pet allergies / pet incompatibility",
    label: "pet allergies / pet incompatibility",
  },
  {
    value: "Career ambition / work-life balance",
    label: "career ambition / work-life balance",
  },
  {
    value: "Cleanliness / domestic routines",
    label: "cleanliness / domestic routines",
  },
  { value: "Health / fitness lifestyle", label: "health / fitness lifestyle" },
  { value: "Other", label: "something else" },
];

function optionValues(values: readonly string[]) {
  return values.map((value) => ({ value, label: value }));
}

function storyArray(story: Record<string, unknown>, key: string) {
  const value = story[key];
  if (Array.isArray(value))
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  const text = typeof value === "string" ? value.trim() : "";
  return text ? [text] : [];
}

function fieldId(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function displayLabel(options: Option[], value: string, placeholder: string) {
  return (
    options.find((option) => option.value === value)?.label ||
    value ||
    placeholder
  );
}

function fieldSizerText(value: string, placeholder: string) {
  return value || placeholder || " ";
}

function StoryChapter({
  children,
  className,
  description,
  eyebrow,
  media,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  description?: string;
  eyebrow: string;
  media?: React.ReactNode;
  title: string;
}) {
  return (
    <section className={cn("min-w-0 scroll-mt-24", className)}>
      <div
        className={cn(
          "min-w-0",
          media &&
            "grid gap-7 md:grid-cols-[10.5rem_minmax(0,1fr)] md:items-center",
        )}
      >
        {media ? (
          <div className="flex min-w-0 justify-center md:block">{media}</div>
        ) : null}
        <div className="min-w-0">
          <span className="mb-3 block text-xs font-semibold uppercase tracking-wide text-lipstick">
            {eyebrow}
          </span>
          <h2 className="font-display text-2xl font-extrabold leading-tight text-wine sm:text-3xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              {description}
            </p>
          ) : null}
          {children ? (
            <div className={cn("mt-7 space-y-6", storyTextClass)}>
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-4 py-1" aria-hidden="true">
      <span className="h-px flex-1 bg-wine/12" />
      <span className="h-1 w-11 rounded-full bg-lipstick" />
      <span className="h-px flex-1 bg-wine/12" />
    </div>
  );
}

function ReadValue({
  children,
  className,
  empty = false,
}: {
  children: React.ReactNode;
  className?: string;
  empty?: boolean;
}) {
  return (
    <span
      className={cn(
        "mx-1 inline max-w-full break-words px-1 font-semibold text-lipstick",
        empty && "text-faint",
        className,
      )}
    >
      {children}
    </span>
  );
}

function InlineText({
  defaultValue,
  label,
  mode,
  name,
  placeholder,
  type = "text",
  wide = false,
}: {
  defaultValue?: string;
  label: string;
  mode: Mode;
  name: string;
  placeholder: string;
  type?: React.HTMLInputTypeAttribute;
  wide?: boolean;
}) {
  const id = fieldId(name);
  const value = String(defaultValue || "").trim();
  const [currentText, setCurrentText] = useState(value);
  const sizerText = fieldSizerText(currentText, placeholder);

  if (mode === "read") {
    return <ReadValue empty={!value}>{value || placeholder}</ReadValue>;
  }

  return (
    <span
      className={cn(
        "relative mx-1 inline-grid max-w-full align-baseline",
        wide ? "max-w-[min(21.25rem,100%)]" : "max-w-[min(14.375rem,100%)]",
      )}
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <span
        aria-hidden="true"
        className="invisible col-start-1 row-start-1 h-11 whitespace-pre border-b-2 border-dotted border-transparent px-1 py-0 text-[1em] font-semibold leading-[2.75rem]"
      >
        {sizerText}
      </span>
      <Input
        className="absolute inset-0 h-11 w-full min-w-0 max-w-full rounded-none border-0 border-b-2 border-dotted border-lipstick bg-transparent px-1 py-0 align-baseline text-[1em] font-semibold text-lipstick shadow-none placeholder:text-faint focus-visible:border-lipstick focus-visible:ring-0"
        defaultValue={defaultValue}
        id={id}
        name={name}
        onInput={(event) => setCurrentText(event.currentTarget.value.trim())}
        placeholder={placeholder}
        type={type}
      />
    </span>
  );
}

function InlineLongText({
  containerClassName,
  defaultValue,
  displayClassName,
  editClassName,
  editWidthClassName = "w-[min(42rem,calc(100%-3.25em))]",
  label,
  mode,
  name,
  onValueChange,
  placeholder,
  readClassName,
  singleLine = false,
  value,
}: {
  containerClassName?: string;
  defaultValue?: string;
  displayClassName?: string;
  editClassName?: string;
  editWidthClassName?: string;
  label: string;
  mode: Mode;
  name: string;
  onValueChange?: (value: string) => void;
  placeholder: string;
  readClassName?: string;
  singleLine?: boolean;
  value?: string;
}) {
  const id = fieldId(name);
  const initialValue = String(defaultValue || "").trim();
  const [localText, setLocalText] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(false);
  const checkDirty = useDirtyCheck();
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentText = value ?? localText;
  const displayValue = currentText.trim();
  const displayText = displayValue || placeholder;
  const editSizerText = fieldSizerText(currentText, placeholder);

  useEffect(() => {
    if (!isEditing) return;

    if (singleLine) {
      const input = inputRef.current;
      if (!input) return;

      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [isEditing, singleLine]);

  useEffect(() => {
    if (!isEditing || singleLine) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [currentText, isEditing, singleLine]);

  if (mode === "read") {
    return (
      <ReadValue className={readClassName} empty={!displayValue}>
        {displayValue || placeholder}
      </ReadValue>
    );
  }

  return (
    <span
      className={cn(
        "mx-1 inline max-w-full align-baseline",
        containerClassName,
      )}
    >
      <input name={name} type="hidden" value={currentText} />
      {!isEditing ? (
        <button
          className={cn(
            "inline max-w-full cursor-text whitespace-pre-wrap border-0 bg-transparent p-0 text-left font-semibold leading-snug text-lipstick underline decoration-dotted decoration-2 underline-offset-[0.28em] [overflow-wrap:anywhere] transition hover:text-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/25",
            !currentText && "text-faint",
            displayClassName,
          )}
          onClick={() => setIsEditing(true)}
          type="button"
        >
          {displayText}
        </button>
      ) : singleLine ? (
        <span
          className={cn(
            "relative inline-grid max-w-[min(24rem,100%)] align-baseline",
            editClassName,
          )}
        >
          <label className="sr-only" htmlFor={id}>
            {label}
          </label>
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 h-[1.35em] whitespace-pre p-0 text-[1em] font-semibold leading-snug"
          >
            {editSizerText}
          </span>
          <input
            className="absolute inset-0 h-[1.35em] w-full min-w-0 max-w-full rounded-none border-0 bg-transparent p-0 text-[1em] font-semibold leading-snug text-lipstick underline decoration-dotted decoration-2 underline-offset-[0.28em] shadow-none outline-none placeholder:text-faint focus-visible:ring-0"
            id={id}
            onBlur={() => setIsEditing(false)}
            onChange={(event) => {
              if (value === undefined) setLocalText(event.currentTarget.value);
              onValueChange?.(event.currentTarget.value);
              checkDirty?.();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
                return;
              }

              if (event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
            ref={inputRef}
            type="text"
            value={currentText}
          />
        </span>
      ) : (
        <span
          className={cn(
            "inline-block max-w-full align-baseline",
            editWidthClassName,
            editClassName,
          )}
        >
          <label className="sr-only" htmlFor={id}>
            {label}
          </label>
          <textarea
            className={cn(
              "block w-full resize-none overflow-hidden rounded-none border-0 border-b-2 border-dotted border-lipstick bg-transparent px-1 text-[1em] font-semibold text-lipstick shadow-none outline-none placeholder:text-faint focus-visible:border-solid focus-visible:ring-0",
              "min-h-[1.75em] py-0 leading-normal",
            )}
            id={id}
            onBlur={() => setIsEditing(false)}
            onChange={(event) => {
              const nextValue = singleLine
                ? event.currentTarget.value.replace(/\s*\n+\s*/g, " ")
                : event.currentTarget.value;
              if (value === undefined) setLocalText(nextValue);
              onValueChange?.(nextValue);
              checkDirty?.();
            }}
            onKeyDown={(event) => {
              if (singleLine && event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
                return;
              }

              if (event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
            ref={textareaRef}
            rows={1}
            value={currentText}
          />
        </span>
      )}
    </span>
  );
}

function InlineSelect({
  defaultValue = "",
  label,
  mode,
  name,
  onChange,
  options,
  placeholder,
  value,
}: {
  defaultValue?: string;
  label: string;
  mode: Mode;
  name: string;
  onChange?: (value: string) => void;
  options: Option[];
  placeholder: string;
  value?: string;
}) {
  const id = fieldId(name);
  const reactId = useId();
  const dialogId = `${reactId}-dialog`;
  const titleId = `${reactId}-title`;
  const listId = `${reactId}-list`;
  const [localValue, setLocalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const checkDirty = useDirtyCheck();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLSpanElement>(null);
  const currentValue = value ?? localValue;
  const hasCurrentValue = Boolean(currentValue);
  const hasMatchingOption = options.some(
    (option) => option.value === currentValue,
  );
  const currentLabel = displayLabel(options, currentValue, placeholder);
  const dialogOptions =
    !hasCurrentValue || hasMatchingOption
      ? options
      : [{ value: currentValue, label: currentValue }, ...options];
  const selectedIndex = Math.max(
    dialogOptions.findIndex((option) => option.value === currentValue),
    0,
  );
  const longestLabelLength = dialogOptions.reduce(
    (longest, option) => Math.max(longest, option.label.length),
    label.length,
  );
  const compactDialogWidth = Math.min(
    Math.max(longestLabelLength * 8.5 + 116, SELECT_DIALOG_MIN_WIDTH),
    440,
  );
  const dialogWidth =
    dialogOptions.length <= 6 ? compactDialogWidth : SELECT_DIALOG_MAX_WIDTH;

  useEffect(() => {
    if (!isOpen) return;

    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-story-select-option="${activeIndex}"]`,
    );
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: "center" });
  }, [activeIndex, isOpen]);

  if (mode === "read") {
    return <ReadValue empty={!currentValue}>{currentLabel}</ReadValue>;
  }

  function openList() {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  }

  function closeList({ restoreFocus = true } = {}) {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() =>
        triggerRef.current?.focus({ preventScroll: true }),
      );
    }
  }

  function selectOption(nextValue: string) {
    if (nextValue !== currentValue) checkDirty?.();
    setLocalValue(nextValue);
    onChange?.(nextValue);
    closeList({ restoreFocus: false });
  }

  function moveActiveIndex(nextIndex: number) {
    if (!dialogOptions.length) return;
    setActiveIndex(Math.min(Math.max(nextIndex, 0), dialogOptions.length - 1));
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    event.preventDefault();
    openList();
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveIndex(activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveIndex(activeIndex - 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      moveActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      moveActiveIndex(dialogOptions.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const nextOption = dialogOptions[activeIndex];
      if (nextOption) selectOption(nextOption.value);
    }
  }

  return (
    <span className="relative inline max-w-full align-baseline">
      <input id={id} name={name} type="hidden" value={currentValue} />
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? dialogId : undefined}
        className={cn(
          "group mx-1 inline-block max-w-[calc(100%-0.9em)] cursor-pointer whitespace-normal border-0 bg-transparent p-0 text-left text-[1em] font-semibold leading-snug text-lipstick align-baseline transition hover:text-wine focus-visible:bg-lipstick/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/25",
          !hasCurrentValue && "text-faint",
        )}
        onClick={openList}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="box-decoration-clone underline decoration-dotted decoration-[1.5px] underline-offset-[0.28em] [overflow-wrap:normal] group-hover:decoration-solid">
          {currentLabel}
        </span>
      </button>

      {isOpen ? (
        <>
          <span
            className="fixed inset-0 z-50 block cursor-pointer bg-wine/10 backdrop-blur-[1px]"
            aria-hidden="true"
            onPointerDown={() => closeList()}
          />
          <span
            aria-labelledby={titleId}
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[60] grid max-h-[min(35rem,calc(100svh-3rem))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-lipstick/30 bg-white text-base text-ink shadow-[0_24px_70px_rgba(52,38,31,0.22)]"
            id={dialogId}
            onKeyDown={handleDialogKeyDown}
            ref={dialogRef}
            role="dialog"
            style={{
              width: `min(${Math.round(dialogWidth)}px, calc(100vw - 2rem))`,
            }}
          >
            <span className="flex items-center justify-between gap-4 border-b border-wine/10 px-4 py-4">
              <span
                className="min-w-0 font-display text-lg font-extrabold leading-tight text-wine"
                id={titleId}
              >
                {label}
              </span>
              <button
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold leading-tight text-lipstick underline underline-offset-4 transition hover:text-wine"
                onClick={() => closeList()}
                type="button"
              >
                Close
              </button>
            </span>
            <span
              className="grid max-h-[min(29rem,calc(100svh-8.5rem))] gap-1 overflow-y-auto p-2"
              id={listId}
              ref={listRef}
              role="listbox"
            >
              {dialogOptions.length ? (
                dialogOptions.map((option, index) => {
                  const isSelected = option.value === currentValue;

                  return (
                    <button
                      aria-selected={isSelected}
                      className="grid min-h-[46px] cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[7px] border-0 bg-transparent px-3 py-2.5 text-left text-ink transition hover:bg-lipstick/8 focus-visible:bg-lipstick/8 focus-visible:outline-none data-[active=true]:bg-lipstick/8 data-[selected=true]:bg-lipstick/10 data-[selected=true]:text-lipstick"
                      data-active={index === activeIndex}
                      data-selected={isSelected}
                      data-story-select-option={index}
                      id={`${listId}-option-${index}`}
                      key={option.value}
                      onClick={() => selectOption(option.value)}
                      role="option"
                      tabIndex={index === activeIndex ? 0 : -1}
                      type="button"
                    >
                      <span className="min-w-0 break-words text-base font-semibold leading-tight">
                        {option.label}
                      </span>
                      {isSelected ? (
                        <Check
                          className="h-4 w-4 text-lipstick"
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      ) : (
                        <span aria-hidden="true" />
                      )}
                    </button>
                  );
                })
              ) : (
                <span className="px-3 py-4 text-sm font-semibold text-muted">
                  No options available.
                </span>
              )}
            </span>
          </span>
        </>
      ) : null}
    </span>
  );
}

function DealBreakerPicker({
  mode,
  onToggle,
  onOtherDetailsChange,
  otherDetails,
  options,
  selectedValues,
}: {
  mode: Mode;
  onToggle: (value: string) => void;
  onOtherDetailsChange: (value: string) => void;
  otherDetails: string;
  options: Option[];
  selectedValues: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const reactId = useId();
  const popupId = `${reactId}-deal-breaker-popup`;
  const popupTitleId = `${reactId}-deal-breaker-title`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const scrollAreaRef = useRef<HTMLSpanElement | null>(null);
  const otherDetailsRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldFocusOtherDetailsRef = useRef(false);
  const checkDirty = useDirtyCheck();
  const selectedOptions = selectedValues
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is Option => Boolean(option));
  const selectedSpecificCount = selectedValues.filter(
    (value) => value !== noneDealBreaker,
  ).length;
  const isNoneSelected = selectedValues.includes(noneDealBreaker);
  const isOtherSelected = selectedValues.includes("Other");

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isOtherSelected || !shouldFocusOtherDetailsRef.current)
      return;

    shouldFocusOtherDetailsRef.current = false;
    window.requestAnimationFrame(() => {
      const scrollArea = scrollAreaRef.current;
      if (scrollArea) {
        scrollArea.scrollTo({
          top: scrollArea.scrollHeight,
          behavior: "smooth",
        });
      }

      otherDetailsRef.current?.focus({ preventScroll: true });
    });
  }, [isOpen, isOtherSelected]);

  if (mode === "read") {
    if (!selectedOptions.length)
      return <ReadValue empty>deal-breakers</ReadValue>;

    return (
      <span className="inline">
        {" "}
        {selectedOptions.map((option, index) => (
          <span key={option.value}>
            {index > 0
              ? index === selectedOptions.length - 1
                ? " and "
                : ", "
              : null}
            <span className="font-semibold text-lipstick">{option.label}</span>
          </span>
        ))}
      </span>
    );
  }

  function closePicker() {
    setIsOpen(false);
    window.requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true }),
    );
  }

  function isOptionDisabled(option: Option) {
    const selected = selectedValues.includes(option.value);
    return (
      !selected &&
      option.value !== noneDealBreaker &&
      selectedSpecificCount >= 5 &&
      !isNoneSelected
    );
  }

  function handleOptionClick(option: Option) {
    if (isOptionDisabled(option)) return;

    const selected = selectedValues.includes(option.value);
    checkDirty?.();
    if (option.value === "Other" && !selected) {
      shouldFocusOtherDetailsRef.current = true;
    }
    onToggle(option.value);

    if (option.value === noneDealBreaker && !selected) {
      closePicker();
    }
  }

  function handleOtherDetailsChange(
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) {
    onOtherDetailsChange(event.currentTarget.value);
    checkDirty?.();
  }

  return (
    <span className="relative inline">
      {selectedOptions.length ? " " : null}
      {selectedOptions.map((option, index) => (
        <span key={option.value}>
          {index > 0
            ? index === selectedOptions.length - 1
              ? " and "
              : ", "
            : null}
          <button
            aria-label={`Edit deal-breakers, currently includes ${option.label}`}
            className="inline max-w-full cursor-pointer border-0 bg-transparent px-0 font-semibold leading-tight text-lipstick underline decoration-dotted decoration-[1.5px] underline-offset-[0.28em] transition hover:text-wine hover:decoration-solid focus-visible:bg-lipstick/8 focus-visible:outline-none"
            onClick={() => setIsOpen(true)}
            type="button"
          >
            {option.label}
          </button>
        </span>
      ))}
      <button
        ref={triggerRef}
        aria-controls={isOpen ? popupId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="ml-[0.16em] mr-[0.12em] inline-flex h-[1em] w-[1em] cursor-pointer items-center justify-center rounded-full border-0 bg-lipstick p-0 align-[-0.08em] text-white transition hover:bg-wine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/25"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="sr-only">Add deal-breaker</span>
        <Plus
          className="h-[0.52em] w-[0.52em]"
          aria-hidden="true"
          strokeWidth={3.25}
        />
      </button>

      {isOpen ? (
        <>
          <span
            aria-hidden="true"
            className="fixed inset-0 z-50 block cursor-pointer bg-wine/10 backdrop-blur-[1px]"
            onPointerDown={closePicker}
          />
          <span
            aria-labelledby={popupTitleId}
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[60] grid max-h-[min(35rem,calc(100svh-3rem))] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-lipstick/30 bg-white text-base text-ink shadow-[0_24px_70px_rgba(52,38,31,0.22)]"
            id={popupId}
            role="dialog"
          >
            <span className="flex items-center justify-between gap-4 border-b border-wine/10 px-4 py-4">
              <span
                id={popupTitleId}
                className="min-w-0 text-sm font-semibold leading-tight text-muted"
              >
                Choose up to 5 deal-breakers
              </span>
              <button
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold leading-tight text-lipstick underline underline-offset-4 transition hover:text-wine"
                onClick={closePicker}
                type="button"
              >
                Done
              </button>
            </span>
            <span
              className="grid max-h-[min(29rem,calc(100svh-8.5rem))] gap-2 overflow-y-auto p-3"
              ref={scrollAreaRef}
            >
              {options.map((option) => {
                const selected = selectedValues.includes(option.value);
                const disabled = isOptionDisabled(option);

                return (
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "inline-flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-extrabold leading-tight transition",
                      selected
                        ? "border-lipstick bg-lipstick text-white shadow-sm"
                        : "border-lipstick/20 bg-white text-lipstick hover:border-lipstick/45 hover:bg-lipstick/8",
                      disabled &&
                        "cursor-not-allowed opacity-50 hover:border-lipstick/20 hover:bg-white",
                    )}
                    disabled={disabled}
                    key={option.value}
                    onClick={() => handleOptionClick(option)}
                    type="button"
                  >
                    {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                    <span className="min-w-0 break-words">{option.label}</span>
                  </button>
                );
              })}
              {isOtherSelected ? (
                <span className="mt-1 grid gap-2 rounded-md border border-lipstick/20 bg-lipstick/8 p-3">
                  <label
                    className="text-sm font-semibold leading-tight text-wine"
                    htmlFor={`${popupId}-other-details`}
                  >
                    What else?
                  </label>
                  <textarea
                    aria-label="Other deal-breaker"
                    className="min-h-24 w-full resize-y rounded-md border border-lipstick/25 bg-white px-3 py-2 text-sm font-semibold leading-6 text-ink shadow-none outline-none placeholder:text-faint focus:border-lipstick focus:bg-white"
                    id={`${popupId}-other-details`}
                    onChange={handleOtherDetailsChange}
                    placeholder="Tell us more"
                    ref={otherDetailsRef}
                    rows={3}
                    value={otherDetails}
                  />
                </span>
              ) : null}
            </span>
            <span className="border-t border-wine/10 px-4 py-3 text-sm font-semibold leading-6 text-muted">
              {selectedValues.length} of 5 selected.
            </span>
          </span>
        </>
      ) : null}
    </span>
  );
}

function MissingStory() {
  return (
    <div className="rounded-lg border border-lipstick/15 bg-lipstick/8 p-4 text-sm font-semibold leading-6 text-wine">
      No submitted story is linked to this account yet. Log in with the email
      used on the website story flow, or submit your story there first.
    </div>
  );
}

function StoryNarrative({
  isDirty = false,
  mode,
  onCancel,
  onDirty,
  profile,
  profileImage,
  state,
}: {
  isDirty?: boolean;
  mode: Mode;
  onCancel?: () => void;
  onDirty?: () => void;
  profile: ProfileRegistration | null;
  profileImage?: ProfileImageConfig;
  state?: FormActionState;
}) {
  const story = profile?.profile_json || {};
  const [gender, setGender] = useState(storyValue(story, "profile.gender"));
  const [orientation, setOrientation] = useState(
    storyValue(story, "profile.sexual_orientation"),
  );
  const [ageMatters, setAgeMatters] = useState(
    storyValue(story, "profile.age_matters"),
  );
  const [heightMatters, setHeightMatters] = useState(
    storyValue(story, "profile.height_important"),
  );
  const [religion, setReligion] = useState(
    storyValue(story, "profile.religion_identity"),
  );
  const [religionAlignment, setReligionAlignment] = useState(
    storyValue(story, "profile.religion_alignment_importance"),
  );
  const [faith, setFaith] = useState(
    storyValue(story, "profile.religion_identity.central_religion"),
  );
  const [politicalImportance, setPoliticalImportance] = useState(
    storyValue(story, "profile.political_alignment_importance"),
  );
  const [financialImportance, setFinancialImportance] = useState(
    storyValue(story, "profile.financial_alignment_importance"),
  );
  const [dealBreakers, setDealBreakers] = useState(() =>
    storyArray(story, "profile.deal_breakers"),
  );
  const [dealBreakerDetails, setDealBreakerDetails] = useState(
    storyValue(story, "profile.deal_breakers.details"),
  );
  const [showAnythingElse, setShowAnythingElse] = useState(
    mode === "read" || Boolean(storyValue(story, "profile.anything_else")),
  );

  if (!profile) return <MissingStory />;

  const showGenderDetails = gender === "other";
  const showOrientationDetails = orientation === "Other";
  const showAgeRange = ageMatters === "Yes";
  const showHeightRange = heightMatters === "Yes";
  const showReligionAlignment = [
    "central to my life",
    "important but private",
  ].includes(religion);
  const showFaith =
    showReligionAlignment && religionAlignment === "very important";
  const showFaithDetails = showFaith && faith === "Other";
  const showPolitics = ["somewhat important", "very important"].includes(
    politicalImportance,
  );
  const showFinancialPhilosophy = ["mostly", "completely"].includes(
    financialImportance,
  );
  const showDealBreakerDetails = dealBreakers.includes("Other");
  const anythingElse = storyValue(story, "profile.anything_else");
  const heightConnector =
    ageMatters === "No, not really" && heightMatters === "No, not really"
      ? " either"
      : ageMatters === "Yes" && heightMatters === "Yes"
        ? ", too"
        : "";
  const showSaveActions = mode === "edit" && (isDirty || Boolean(state?.error));

  function toggleDealBreaker(value: string) {
    if (mode === "read") return;
    setDealBreakers((current) => {
      if (value === noneDealBreaker) {
        return current.includes(noneDealBreaker) ? [] : [noneDealBreaker];
      }

      const withoutNone = current.filter((item) => item !== noneDealBreaker);
      if (withoutNone.includes(value))
        return withoutNone.filter((item) => item !== value);
      if (withoutNone.length >= 5) return withoutNone;
      return [...withoutNone, value];
    });
  }

  return (
    <div className={cn("min-w-0 space-y-10", showSaveActions && "pb-28")}>
      <StoryChapter
        eyebrow="Introduction"
        media={
          profileImage ? (
            <div
              className="w-full max-w-[11rem] shrink-0"
              data-profile-image-uploader
            >
              <ProfileImageUploader
                className="w-full max-w-[11rem] justify-self-center md:justify-self-start"
                currentImageUrl={profileImage.currentImageUrl}
                displayName={profileImage.displayName}
                hasProfile={profileImage.hasProfile}
              />
            </div>
          ) : undefined
        }
        title="Hello"
        description="Great to meet you! Let's skip the small talk."
      />

      <Divider />

      <StoryChapter
        eyebrow="Chapter One"
        title="Who You Are"
        description="The basics that come up in the first 5 minutes of any interaction with someone new"
      >
        <p>
          I am
          <InlineSelect
            label="Age"
            mode={mode}
            name="profile.age"
            options={optionValues(ageOptions)}
            defaultValue={storyValue(story, "profile.age")}
            placeholder="age"
          />
          years old and my height is
          <InlineSelect
            label="Height"
            mode={mode}
            name="profile.height"
            options={optionValues(heightOptions)}
            defaultValue={storyValue(story, "profile.height")}
            placeholder="height"
          />
          cm. I move through the world as
          <InlineSelect
            label="Gender"
            mode={mode}
            name="profile.gender"
            options={genderOptions}
            value={mode === "edit" ? gender : undefined}
            defaultValue={gender}
            onChange={setGender}
            placeholder="gender"
          />
          {showGenderDetails ? (
            <>
              , which I would describe as
              <InlineText
                label="Gender details"
                mode={mode}
                name="profile.gender.details"
                defaultValue={storyValue(story, "profile.gender.details")}
                placeholder="tell us more"
              />
              ; my pronouns are
              <InlineText
                label="Pronouns"
                mode={mode}
                name="profile.gender.pronouns"
                defaultValue={storyValue(story, "profile.gender.pronouns")}
                placeholder="pronouns"
              />
            </>
          ) : null}
          . The way I love is
          <InlineSelect
            label="Sexual orientation"
            mode={mode}
            name="profile.sexual_orientation"
            options={orientationOptions}
            value={mode === "edit" ? orientation : undefined}
            defaultValue={orientation}
            onChange={setOrientation}
            placeholder="sexuality"
          />
          {showOrientationDetails ? (
            <>
              , or more specifically
              <InlineText
                label="Orientation details"
                mode={mode}
                name="profile.sexual_orientation.details"
                defaultValue={storyValue(
                  story,
                  "profile.sexual_orientation.details",
                )}
                placeholder="tell us more"
              />
            </>
          ) : null}
          .
        </p>

        <p>
          I am currently
          <InlineSelect
            label="Living situation"
            mode={mode}
            name="profile.home_base"
            options={homeBaseOptions}
            defaultValue={storyValue(story, "profile.home_base")}
            placeholder="living situation"
          />
          and I could meet a group for dinner or brunch in
          <StoryAutocompleteField
            kind="city"
            label="Cities where I could meet a group for dinner or brunch"
            mode={mode}
            name="profile.event_location"
            onDirty={onDirty}
            defaultValue={storyValue(story, "profile.event_location")}
            placeholder="cities"
          />
          . I&apos;m open to dating
          <InlineSelect
            label="Dating geography"
            mode={mode}
            name="profile.geographic_setup"
            options={geographyOptions}
            defaultValue={storyValue(story, "profile.geographic_setup")}
            placeholder="geography"
          />
          , and relocating is
          <InlineSelect
            label="Relocation"
            mode={mode}
            name="profile.relocation"
            options={relocationOptions}
            defaultValue={storyValue(story, "profile.relocation")}
            placeholder="relocation"
          />
          .
        </p>

        <p>
          The languages I am comfortable speaking on a date are
          <StoryAutocompleteField
            kind="language"
            label="Languages I am comfortable speaking on a date"
            mode={mode}
            name="profile.date_languages"
            onDirty={onDirty}
            defaultValue={storyValue(story, "profile.date_languages")}
            placeholder="languages"
          />
          .
        </p>
      </StoryChapter>

      <Divider />

      <StoryChapter
        eyebrow="Chapter Two"
        title="What You're Looking For"
        description="The obvious things people tend to clash over, so no one wastes time on a bad fit."
      >
        <p>
          The age of my partner
          <InlineSelect
            label="Age importance"
            mode={mode}
            name="profile.age_matters"
            options={mattersOptions}
            value={mode === "edit" ? ageMatters : undefined}
            defaultValue={ageMatters}
            onChange={setAgeMatters}
            placeholder="__"
          />
          to me
          {showAgeRange ? (
            <>
              {" "}
              and the range that feels right is from
              <InlineSelect
                label="Minimum preferred age"
                mode={mode}
                name="profile.age_matters.preferred_range.min"
                options={optionValues(ageOptions)}
                defaultValue={storyValue(
                  story,
                  "profile.age_matters.preferred_range.min",
                )}
                placeholder="min"
              />
              to
              <InlineSelect
                label="Maximum preferred age"
                mode={mode}
                name="profile.age_matters.preferred_range.max"
                options={optionValues(ageOptions)}
                defaultValue={storyValue(
                  story,
                  "profile.age_matters.preferred_range.max",
                )}
                placeholder="max"
              />
              years old
            </>
          ) : null}
          . Their height
          <InlineSelect
            label="Height importance"
            mode={mode}
            name="profile.height_important"
            options={mattersOptions}
            value={mode === "edit" ? heightMatters : undefined}
            defaultValue={heightMatters}
            onChange={setHeightMatters}
            placeholder="__"
          />
          to me{heightConnector}
          {showHeightRange ? (
            <>
              , somewhere between
              <InlineSelect
                label="Minimum preferred height"
                mode={mode}
                name="profile.height_important.preferred_range.min"
                options={optionValues(heightOptions)}
                defaultValue={storyValue(
                  story,
                  "profile.height_important.preferred_range.min",
                )}
                placeholder="min"
              />
              cm and
              <InlineSelect
                label="Maximum preferred height"
                mode={mode}
                name="profile.height_important.preferred_range.max"
                options={optionValues(heightOptions)}
                defaultValue={storyValue(
                  story,
                  "profile.height_important.preferred_range.max",
                )}
                placeholder="max"
              />
              cm works for me
            </>
          ) : null}
          .
        </p>

        <p>
          To set the stage honestly, my current relationship status is
          <InlineSelect
            label="Relationship status"
            mode={mode}
            name="profile.relationship_status"
            options={relationshipStatusOptions}
            defaultValue={storyValue(story, "profile.relationship_status")}
            placeholder="__"
          />
          . What I am genuinely open to right now is
          <InlineSelect
            label="Relationship type"
            mode={mode}
            name="profile.available_relationships"
            options={relationshipOptions}
            defaultValue={storyValue(story, "profile.available_relationships")}
            placeholder="__"
          />
          .
        </p>

        <p>
          When it comes to children, the truth is
          <InlineSelect
            label="Children"
            mode={mode}
            name="profile.children_position"
            options={childrenOptions}
            defaultValue={storyValue(story, "profile.children_position")}
            placeholder="__"
          />
          .
        </p>
      </StoryChapter>

      <Divider />

      <StoryChapter
        eyebrow="Chapter Three"
        title="Your Values and Lifestyle"
        description="The topics that usually come up later in a relationship, when a mismatch can cost real time and energy."
      >
        <p>
          My relationship with religion or spirituality is
          <InlineSelect
            label="Religion or spirituality"
            mode={mode}
            name="profile.religion_identity"
            options={religionOptions}
            value={mode === "edit" ? religion : undefined}
            defaultValue={religion}
            onChange={setReligion}
            placeholder="religion"
          />
          .
          {showReligionAlignment ? (
            <>
              {" "}
              And in a partner, sharing those views is
              <InlineSelect
                label="Religious alignment"
                mode={mode}
                name="profile.religion_alignment_importance"
                options={alignmentOptions}
                value={mode === "edit" ? religionAlignment : undefined}
                defaultValue={religionAlignment}
                onChange={setReligionAlignment}
                placeholder="religion"
              />
              .
              {showFaith ? (
                <>
                  {" "}
                  Specifically, my faith is
                  <InlineSelect
                    label="Specific faith"
                    mode={mode}
                    name="profile.religion_identity.central_religion"
                    options={faithOptions}
                    value={mode === "edit" ? faith : undefined}
                    defaultValue={faith}
                    onChange={setFaith}
                    placeholder="religion"
                  />
                  {showFaithDetails ? (
                    <>
                      , described as
                      <InlineText
                        label="Faith details"
                        mode={mode}
                        name="profile.religion_identity.central_religion.details"
                        defaultValue={storyValue(
                          story,
                          "profile.religion_identity.central_religion.details",
                        )}
                        placeholder="describe it"
                        wide
                      />
                    </>
                  ) : null}
                  .
                </>
              ) : null}
            </>
          ) : null}
        </p>

        <p>
          Being on the same political side as my partner is
          <InlineSelect
            label="Political alignment"
            mode={mode}
            name="profile.political_alignment_importance"
            options={politicalImportanceOptions}
            value={mode === "edit" ? politicalImportance : undefined}
            defaultValue={politicalImportance}
            onChange={setPoliticalImportance}
            placeholder="politics"
          />
          .
          {showPolitics ? (
            <>
              {" "}
              On the political spectrum, I lean
              <InlineSelect
                label="Political worldview"
                mode={mode}
                name="profile.politics_worldview"
                options={politicsOptions}
                defaultValue={storyValue(story, "profile.politics_worldview")}
                placeholder="politics"
              />
              .
            </>
          ) : null}{" "}
          Our money habits on earning, spending and saving need to align
          <InlineSelect
            label="Financial alignment"
            mode={mode}
            name="profile.financial_alignment_importance"
            options={financialImportanceOptions}
            value={mode === "edit" ? financialImportance : undefined}
            defaultValue={financialImportance}
            onChange={setFinancialImportance}
            placeholder="money"
          />
          .
          {showFinancialPhilosophy ? (
            <>
              {" "}
              When it comes to my own money, I tend to
              <InlineSelect
                label="Financial philosophy"
                mode={mode}
                name="profile.financial_philosophy"
                options={financialOptions}
                defaultValue={storyValue(story, "profile.financial_philosophy")}
                placeholder="money"
              />
              .
            </>
          ) : null}
        </p>

        <p>
          Fitness and physical health show up in my life as
          <InlineSelect
            label="Fitness and health"
            mode={mode}
            name="profile.fitness_priority"
            options={fitnessOptions}
            defaultValue={storyValue(story, "profile.fitness_priority")}
            placeholder="fitness"
          />
          . And the daily rhythm that suits me is
          <InlineSelect
            label="Daily rhythm"
            mode={mode}
            name="profile.lifestyle_pace"
            options={rhythmOptions}
            defaultValue={storyValue(story, "profile.lifestyle_pace")}
            placeholder="rhythm"
          />
          .
        </p>
      </StoryChapter>

      <Divider />

      <StoryChapter
        eyebrow="Chapter Four"
        title="Your Deal-Breakers"
        description="They call them deal-breakers, we call them life-savers. They (almost) always cause painful endings."
      >
        <div className="min-w-0 max-w-full space-y-4">
          <p>
            I learned a few things over the years, and these are my
            deal-breakers:
            <DealBreakerPicker
              mode={mode}
              onOtherDetailsChange={setDealBreakerDetails}
              onToggle={toggleDealBreaker}
              otherDetails={dealBreakerDetails}
              options={dealBreakerOptions}
              selectedValues={dealBreakers}
            />
            .
          </p>
          {dealBreakers.map((value) => (
            <input
              key={value}
              type="hidden"
              name="profile.deal_breakers"
              value={value}
            />
          ))}
          {showDealBreakerDetails ? (
            <p>
              The other thing I won&apos;t tolerate is
              <InlineLongText
                editWidthClassName="w-[min(36rem,calc(100%-15rem))]"
                label="Other deal-breaker"
                mode={mode}
                name="profile.deal_breakers.details"
                onValueChange={setDealBreakerDetails}
                placeholder="what else?"
                value={dealBreakerDetails}
              />
            </p>
          ) : null}
        </div>
      </StoryChapter>

      <section className="space-y-5">
        {!showAnythingElse && mode === "edit" ? (
          <>
            <input
              type="hidden"
              name="profile.anything_else"
              value={anythingElse}
            />
            <button
              className="max-w-full text-left text-xl font-extrabold leading-tight text-lipstick underline decoration-lipstick/30 underline-offset-4 transition hover:text-wine sm:text-2xl"
              onClick={() => setShowAnythingElse(true)}
              type="button"
            >
              Anything else we forgot to mention?
            </button>
          </>
        ) : (
          <div className={cn("space-y-3", storyTextClass)}>
            <p className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2">
              <span className="pt-[0.1em] leading-normal">P.S.</span>
              <InlineLongText
                containerClassName="mx-0 block min-w-0 align-top"
                displayClassName="block w-full leading-normal"
                editClassName="block w-full align-top"
                editWidthClassName="w-full"
                label="Anything else"
                mode={mode}
                name="profile.anything_else"
                defaultValue={anythingElse}
                placeholder="tell us more"
                readClassName="mx-0 block min-w-0 px-0 leading-normal"
              />
            </p>
          </div>
        )}
      </section>

      <Divider />

      <StoryChapter eyebrow="About the Author" title="Written By">
        <p>
          My first name is
          <InlineLongText
            editWidthClassName="w-[min(24rem,calc(100%-9rem))]"
            label="First name"
            mode={mode}
            name="profile.first_name"
            defaultValue={storyValue(story, "profile.first_name")}
            placeholder="your name"
            singleLine
          />
          and I can receive notifications at
          <InlineLongText
            label="Email"
            mode={mode}
            name="profile.email"
            defaultValue={
              storyValue(story, "profile.email") || profile.contact_email || ""
            }
            placeholder="your email"
            singleLine
          />
          .
        </p>
      </StoryChapter>

      {showSaveActions ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 min-[901px]:left-[260px]">
          <div className="mx-auto flex w-full max-w-6xl justify-center px-4 sm:px-6 lg:px-8">
            <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-3">
              <SubmitButton pendingLabel="Saving your story...">
                <Save className="h-4 w-4" />
                Save story
              </SubmitButton>
              <Button onClick={onCancel} type="button" variant="secondary">
                Cancel
              </Button>
              <ActionStatus
                error={state?.error}
                ok={state?.ok}
                successMessage="Story saved."
                toastKey={state}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProfileStory({
  profile,
  profileImage,
}: {
  profile: ProfileRegistration | null;
  profileImage?: ProfileImageConfig;
}) {
  return (
    <StoryNarrative mode="read" profile={profile} profileImage={profileImage} />
  );
}

export function ProfileForm({
  profile,
  profileImage,
}: {
  profile: ProfileRegistration | null;
  profileImage?: ProfileImageConfig;
}) {
  const [state, action] = useActionState(saveProfileAction, initialState);
  const { showToast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const [dismissedActionState, setDismissedActionState] =
    useState<FormActionState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const initialSnapshotRef = useRef<string | null>(null);
  const suppressDirtyChecksRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);
  const updateDirtyState = useCallback(() => {
    if (suppressDirtyChecksRef.current) return;

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

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCancel = useCallback(() => {
    suppressDirtyChecksRef.current = true;
    formRef.current?.reset();
    setDismissedActionState(state);
    setFormResetKey((current) => current + 1);
    setIsDirty(false);
    showToast({
      duration: 2600,
      title: "Changes discarded.",
      variant: "info",
    });

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      suppressDirtyChecksRef.current = false;
      updateDirtyState();
    }, 0);
  }, [showToast, state, updateDirtyState]);

  if (!profile) return <MissingStory />;

  const visibleState = state === dismissedActionState ? initialState : state;

  return (
    <DirtyCheckContext.Provider value={scheduleDirtyCheck}>
      <form
        action={action}
        className="min-w-0"
        onChange={scheduleDirtyCheck}
        onInput={scheduleDirtyCheck}
        ref={formRef}
      >
        <StoryNarrative
          key={formResetKey}
          isDirty={isDirty}
          mode="edit"
          onCancel={handleCancel}
          onDirty={scheduleDirtyCheck}
          profile={profile}
          profileImage={profileImage}
          state={visibleState}
        />
      </form>
    </DirtyCheckContext.Provider>
  );
}
