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
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { ProfileRegistration } from "@/lib/types";
import { cn, storyValue } from "@/lib/utils";

const initialState: FormActionState = {};
const ageOptions = Array.from({ length: 72 }, (_, index) => String(18 + index));
const heightOptions = Array.from({ length: 131 }, (_, index) =>
  String(100 + index),
);
const noneDealBreaker = "none — I'm pretty easygoing";
const storyTextClass =
  "min-w-0 max-w-full text-[1.18rem] font-normal leading-[1.9] text-wine-burgundy [overflow-wrap:anywhere] sm:text-[clamp(1.12rem,2.15vw,1.28rem)] sm:leading-[1.85]";
const SELECT_DIALOG_MIN_WIDTH = 300;
const SELECT_DIALOG_MAX_WIDTH = 520;

type Mode = "read" | "edit";
type Option = {
  aliases?: string[];
  value: string;
  label: string;
};
type ProfileImageConfig = {
  currentImageUrl: string;
  displayName: string;
  hasProfile: boolean;
};
type ProfileCopy = Dictionary["profile"];
type ProfileImageUploaderCopy = Dictionary["imageUploader"];
type StoryAutocompleteCopy = Dictionary["autocomplete"];
type GenderVariant = "masculine" | "feminine" | "neutral";
type GenderedText = Record<GenderVariant, string>;

const DirtyCheckContext = createContext<(() => void) | null>(null);
const ProfileCopyContext = createContext<ProfileCopy | null>(null);

function useDirtyCheck() {
  return useContext(DirtyCheckContext);
}

function useProfileCopy() {
  const copy = useContext(ProfileCopyContext);
  if (!copy) throw new Error("Profile copy is missing.");
  return copy;
}

function profileGenderVariant(gender: string): GenderVariant {
  if (gender === "Female") return "feminine";
  if (gender === "Male") return "masculine";
  return "neutral";
}

function genderedText(
  values: GenderedText | undefined,
  gender: string,
  fallback: string,
) {
  return values?.[profileGenderVariant(gender)] || fallback;
}

function genderedSentence(
  copy: ProfileCopy,
  key: keyof ProfileCopy["genderedSentences"] & keyof ProfileCopy["sentences"],
  gender: string,
) {
  return genderedText(copy.genderedSentences[key], gender, copy.sentences[key]);
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
  { value: "Other", label: "Other" },
];

const homeBaseOptions: Option[] = [
  {
    value: "live in one place",
    label: "living in one place",
    aliases: ["I live in one place", "Living in one place"],
  },
  {
    value: "travel mostly",
    label: "traveling mostly",
    aliases: ["I travel mostly", "Traveling mostly"],
  },
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
  {
    value: "Married, but separated",
    label: "married, but separated",
    aliases: ["Married but separated", "Separated"],
  },
  {
    value: "Divorcing (in process)",
    label: "divorcing (in process)",
    aliases: ["Divorcing", "In the process of divorcing"],
  },
  { value: "Divorced", label: "divorced" },
  { value: "Widowed", label: "widowed" },
  {
    value: "Open / polyamorous",
    label: "open / polyamorous",
    aliases: ["Open/polyamorous", "Open or polyamorous", "Open / poly"],
  },
];

const relationshipOptions: Option[] = [
  {
    value: "Marriage / life partner",
    label: "marriage / life partner",
    aliases: [
      "A serious relationship, slow dating, and meeting someone offline first",
      "A serious relationship",
      "Serious relationship",
    ],
  },
  {
    value: "Exclusive relationship",
    label: "exclusive relationship",
    aliases: ["A committed exclusive relationship", "Committed relationship"],
  },
  {
    value: "Casual dating, seeing where it goes",
    label: "casual dating, seeing where it goes",
    aliases: [
      "Casual dating",
      "Meeting people and seeing where it goes",
      "See where it goes",
    ],
  },
  {
    value: "Ethical non-monogamy",
    label: "ethical non-monogamy",
    aliases: ["Open relationship / ethical non-monogamy"],
  },
  {
    value: "Not sure - still exploring",
    label: "not sure - still exploring",
    aliases: ["Not sure yet", "Still exploring"],
  },
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
  { value: "Other", label: "Other" },
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

function localizedOptions(options: Option[], copy: ProfileCopy, gender = "") {
  return options.map((option) => ({
    ...option,
    label:
      option.value === noneDealBreaker
        ? copy.options.noneDealBreaker
        : genderedText(
            copy.options.genderedLabels[
              option.value as keyof typeof copy.options.genderedLabels
            ],
            gender,
            "",
          ) ||
          copy.options.labels[
            option.label as keyof typeof copy.options.labels
          ] ||
          copy.options.labels[
            option.value as keyof typeof copy.options.labels
          ] ||
          option.label,
  }));
}

function storyArray(story: Record<string, unknown>, key: string) {
  const value = story[key];
  if (Array.isArray(value))
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  const text = typeof value === "string" ? value.trim() : "";
  return text ? [text] : [];
}

function optionLookupKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function optionMatches(option: Option, value: string) {
  const lookupValue = optionLookupKey(value);
  return [option.value, option.label, ...(option.aliases || [])].some(
    (candidate) => optionLookupKey(candidate) === lookupValue,
  );
}

function findOption(options: Option[], value: string) {
  return options.find((option) => optionMatches(option, value));
}

function fieldId(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function displayLabel(options: Option[], value: string, placeholder: string) {
  return findOption(options, value)?.label || value || placeholder;
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
          <span className="mb-3 block font-display text-[0.78rem] font-bold uppercase tracking-[0.22em] text-lipstick-red">
            {eyebrow}
          </span>
          <h2 className="font-display text-3xl font-black text-wine-burgundy">
            {title}
          </h2>
          {description ? (
            <p className="mt-3 max-w-2xl text-base font-medium leading-6 text-muted">
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
      <span className="h-px flex-1 bg-wine-burgundy/12" />
      <span className="h-1 w-11 rounded-full bg-lipstick-red" />
      <span className="h-px flex-1 bg-wine-burgundy/12" />
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
        "mx-1 inline max-w-full break-words px-1 font-semibold text-lipstick-red",
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
        className="absolute inset-0 h-11 w-full min-w-0 max-w-full rounded-none border-0 border-b-2 border-dotted border-lipstick-red bg-transparent px-1 py-0 align-baseline text-[1em] font-semibold text-lipstick-red shadow-none placeholder:text-faint focus-visible:border-lipstick-red focus-visible:ring-0"
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
            "inline max-w-full cursor-text whitespace-pre-wrap border-0 bg-transparent p-0 text-left font-semibold leading-snug text-lipstick-red underline decoration-dotted decoration-2 underline-offset-[0.28em] [overflow-wrap:anywhere] transition hover:text-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/25",
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
            className="absolute inset-0 h-[1.35em] w-full min-w-0 max-w-full rounded-none border-0 bg-transparent p-0 text-[1em] font-semibold leading-snug text-lipstick-red underline decoration-dotted decoration-2 underline-offset-[0.28em] shadow-none outline-none placeholder:text-faint focus-visible:ring-0"
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
              "block w-full resize-none overflow-hidden rounded-none border-0 border-b-2 border-dotted border-lipstick-red bg-transparent px-1 text-[1em] font-semibold text-lipstick-red shadow-none outline-none placeholder:text-faint focus-visible:border-solid focus-visible:ring-0",
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
  const copy = useProfileCopy();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLSpanElement>(null);
  const currentValue = value ?? localValue;
  const currentOption = findOption(options, currentValue);
  const resolvedValue = currentOption?.value || currentValue;
  const hasCurrentValue = Boolean(currentValue);
  const currentLabel = displayLabel(options, currentValue, placeholder);
  const dialogOptions =
    !hasCurrentValue || currentOption
      ? options
      : [{ value: currentValue, label: currentValue }, ...options];
  const selectedIndex = Math.max(
    dialogOptions.findIndex((option) => option.value === resolvedValue),
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
    if (nextValue !== resolvedValue) checkDirty?.();
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
      <input id={id} name={name} type="hidden" value={resolvedValue} />
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? dialogId : undefined}
        className={cn(
          "group mx-1 inline-block max-w-[calc(100%-0.9em)] cursor-pointer whitespace-normal border-0 bg-transparent p-0 text-left text-[1em] font-semibold leading-snug text-lipstick-red align-baseline transition hover:text-wine-burgundy focus-visible:bg-lipstick-red/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/25",
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
            className="fixed inset-0 z-50 block cursor-pointer bg-wine-burgundy/10 backdrop-blur-[1px]"
            aria-hidden="true"
            onPointerDown={() => closeList()}
          />
          <span
            aria-labelledby={titleId}
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[60] grid max-h-[min(35rem,calc(100svh-3rem))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-lipstick-red/30 bg-white text-base text-ink shadow-[0_24px_70px_rgba(52,38,31,0.22)]"
            id={dialogId}
            onKeyDown={handleDialogKeyDown}
            ref={dialogRef}
            role="dialog"
            style={{
              width: `min(${Math.round(dialogWidth)}px, calc(100vw - 2rem))`,
            }}
          >
            <span className="flex items-center justify-between gap-4 border-b border-wine-burgundy/10 px-4 py-4">
              <span
                className="min-w-0 font-display text-lg font-extrabold leading-tight text-wine-burgundy"
                id={titleId}
              >
                {label}
              </span>
              <button
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold leading-tight text-lipstick-red underline underline-offset-4 transition hover:text-wine-burgundy"
                onClick={() => closeList()}
                type="button"
              >
                {copy.select.close}
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
                  const isSelected = option.value === resolvedValue;

                  return (
                    <button
                      aria-selected={isSelected}
                      className="grid min-h-[46px] cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[7px] border-0 bg-transparent px-3 py-2.5 text-left text-ink transition hover:bg-lipstick-red/8 focus-visible:bg-lipstick-red/8 focus-visible:outline-none data-[active=true]:bg-lipstick-red/8 data-[selected=true]:bg-lipstick-red/10 data-[selected=true]:text-lipstick-red"
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
                          className="h-4 w-4 text-lipstick-red"
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
                  {copy.select.noOptions}
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
  const copy = useProfileCopy();
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
      return <ReadValue empty>{copy.placeholders.dealBreakers}</ReadValue>;

    return (
      <span className="inline">
        {" "}
        {selectedOptions.map((option, index) => (
          <span key={option.value}>
            {index > 0
              ? index === selectedOptions.length - 1
                ? ` ${copy.and} `
                : ", "
              : null}
            <span className="font-semibold text-lipstick-red">{option.label}</span>
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
              ? ` ${copy.and} `
              : ", "
            : null}
          <button
            aria-label={`${copy.dealBreakers.editCurrentPrefix} ${option.label}`}
            className="inline max-w-full cursor-pointer border-0 bg-transparent px-0 font-semibold leading-tight text-lipstick-red underline decoration-dotted decoration-[1.5px] underline-offset-[0.28em] transition hover:text-wine-burgundy hover:decoration-solid focus-visible:bg-lipstick-red/8 focus-visible:outline-none"
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
        className="ml-[0.16em] mr-[0.12em] inline-flex h-[1em] w-[1em] cursor-pointer items-center justify-center rounded-full border-0 bg-lipstick-red p-0 align-[-0.08em] text-white transition hover:bg-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/25"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="sr-only">{copy.dealBreakers.add}</span>
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
            className="fixed inset-0 z-50 block cursor-pointer bg-wine-burgundy/10 backdrop-blur-[1px]"
            onPointerDown={closePicker}
          />
          <span
            aria-labelledby={popupTitleId}
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[60] grid max-h-[min(35rem,calc(100svh-3rem))] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-lipstick-red/30 bg-white text-base text-ink shadow-[0_24px_70px_rgba(52,38,31,0.22)]"
            id={popupId}
            role="dialog"
          >
            <span className="flex items-center justify-between gap-4 border-b border-wine-burgundy/10 px-4 py-4">
              <span
                id={popupTitleId}
                className="min-w-0 text-sm font-semibold leading-tight text-muted"
              >
                {copy.dealBreakers.choose}
              </span>
              <button
                className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold leading-tight text-lipstick-red underline underline-offset-4 transition hover:text-wine-burgundy"
                onClick={closePicker}
                type="button"
              >
                {copy.select.close}
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
                        ? "border-lipstick-red bg-lipstick-red text-white shadow-sm"
                        : "border-lipstick-red/20 bg-white text-lipstick-red hover:border-lipstick-red/45 hover:bg-lipstick-red/8",
                      disabled &&
                        "cursor-not-allowed opacity-50 hover:border-lipstick-red/20 hover:bg-white",
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
                <span className="mt-1 grid gap-2 rounded-md border border-lipstick-red/20 bg-lipstick-red/8 p-3">
                  <label
                    className="text-sm font-semibold leading-tight text-wine-burgundy"
                    htmlFor={`${popupId}-other-details`}
                  >
                    {copy.dealBreakers.whatElse}
                  </label>
                  <textarea
                    aria-label={copy.fields.otherDealBreaker}
                    className="min-h-24 w-full resize-y rounded-md border border-lipstick-red/25 bg-white px-3 py-2 text-sm font-semibold leading-6 text-ink shadow-none outline-none placeholder:text-faint focus:border-lipstick-red focus:bg-white"
                    id={`${popupId}-other-details`}
                    onChange={handleOtherDetailsChange}
                    placeholder={copy.dealBreakers.tellUsMore}
                    ref={otherDetailsRef}
                    rows={3}
                    value={otherDetails}
                  />
                </span>
              ) : null}
            </span>
            <span className="border-t border-wine-burgundy/10 px-4 py-3 text-sm font-semibold leading-6 text-muted">
              {selectedValues.length} {copy.dealBreakers.selectedSuffix}
            </span>
          </span>
        </>
      ) : null}
    </span>
  );
}

function MissingStory({ copy }: { copy: ProfileCopy }) {
  return (
    <div className="rounded-lg border border-lipstick-red/15 bg-lipstick-red/8 p-4 text-sm font-semibold leading-6 text-wine-burgundy">
      {copy.missing}
    </div>
  );
}

function StoryNarrative({
  autocompleteCopy,
  copy,
  imageUploaderCopy,
  isDirty = false,
  mode,
  onCancel,
  onDirty,
  profile,
  profileImage,
  state,
}: {
  autocompleteCopy: StoryAutocompleteCopy;
  copy: ProfileCopy;
  imageUploaderCopy: ProfileImageUploaderCopy;
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

  if (!profile) return <MissingStory copy={copy} />;

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
      ? copy.sentences.heightEither
      : ageMatters === "Yes" && heightMatters === "Yes"
        ? copy.sentences.heightToo
        : "";
  const showSaveActions = mode === "edit" && (isDirty || Boolean(state?.error));
  const localizedGenderOptions = localizedOptions(genderOptions, copy, gender);
  const localizedOrientationOptions = localizedOptions(
    orientationOptions,
    copy,
    gender,
  );
  const localizedHomeBaseOptions = localizedOptions(homeBaseOptions, copy, gender);
  const localizedGeographyOptions = localizedOptions(
    geographyOptions,
    copy,
    gender,
  );
  const localizedRelocationOptions = localizedOptions(
    relocationOptions,
    copy,
    gender,
  );
  const localizedMattersOptions = localizedOptions(mattersOptions, copy, gender);
  const localizedRelationshipStatusOptions = localizedOptions(
    relationshipStatusOptions,
    copy,
    gender,
  );
  const localizedRelationshipOptions = localizedOptions(
    relationshipOptions,
    copy,
    gender,
  );
  const localizedChildrenOptions = localizedOptions(childrenOptions, copy, gender);
  const localizedReligionOptions = localizedOptions(religionOptions, copy, gender);
  const localizedAlignmentOptions = localizedOptions(alignmentOptions, copy, gender);
  const localizedFaithOptions = localizedOptions(faithOptions, copy, gender);
  const localizedPoliticalImportanceOptions = localizedOptions(
    politicalImportanceOptions,
    copy,
    gender,
  );
  const localizedPoliticsOptions = localizedOptions(politicsOptions, copy, gender);
  const localizedFinancialImportanceOptions = localizedOptions(
    financialImportanceOptions,
    copy,
    gender,
  );
  const localizedFinancialOptions = localizedOptions(financialOptions, copy, gender);
  const localizedFitnessOptions = localizedOptions(fitnessOptions, copy, gender);
  const localizedRhythmOptions = localizedOptions(rhythmOptions, copy, gender);
  const localizedDealBreakerOptions = localizedOptions(
    dealBreakerOptions,
    copy,
    gender,
  );

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
    <ProfileCopyContext.Provider value={copy}>
      <div className={cn("min-w-0 space-y-10", showSaveActions && "pb-28")}>
        <section className="min-w-0 scroll-mt-24">
          <div
            className={cn(
              "grid min-w-0 gap-7",
              profileImage &&
                "md:grid-cols-[minmax(0,1fr)_10.5rem] md:items-start",
            )}
          >
            <div className="min-w-0">
              <span className="mb-3 block font-display text-[0.78rem] font-bold uppercase tracking-[0.22em] text-lipstick-red">
                {copy.author.eyebrow}
              </span>
              <h2 className="font-display text-3xl font-black text-wine-burgundy">
                {copy.author.title}
              </h2>
            </div>
            {profileImage ? (
              <div
                className="flex min-w-0 justify-center text-base md:col-start-2 md:row-span-2 md:row-start-1 md:block"
                data-profile-image-uploader
              >
                <ProfileImageUploader
                  className="w-full max-w-[11rem] justify-self-center md:justify-self-end"
                  copy={imageUploaderCopy}
                  currentImageUrl={profileImage.currentImageUrl}
                  displayName={profileImage.displayName}
                  hasProfile={profileImage.hasProfile}
                />
              </div>
            ) : null}
            <div className={cn("space-y-6", storyTextClass)}>
              <p>
                {copy.sentences.firstName}
                <InlineLongText
                  editWidthClassName="w-[min(24rem,calc(100%-9rem))]"
                  label={copy.fields.firstName}
                  mode={mode}
                  name="profile.first_name"
                  defaultValue={storyValue(story, "profile.first_name")}
                  placeholder={copy.placeholders.firstName}
                  singleLine
                />
                {copy.sentences.notifications}
                <InlineLongText
                  label={copy.fields.email}
                  mode={mode}
                  name="profile.email"
                  defaultValue={
                    storyValue(story, "profile.email") ||
                    profile.contact_email ||
                    ""
                  }
                  placeholder={copy.placeholders.email}
                  singleLine
                />
                .
              </p>
            </div>
          </div>
        </section>

      <Divider />

      <StoryChapter
        eyebrow={copy.chapterOne.eyebrow}
        title={copy.chapterOne.title}
        description={copy.chapterOne.description}
      >
        <p>
          {copy.sentences.iAm}
          <InlineSelect
            label={copy.fields.age}
            mode={mode}
            name="profile.age"
            options={optionValues(ageOptions)}
            defaultValue={storyValue(story, "profile.age")}
            placeholder={copy.placeholders.age}
          />
          {copy.sentences.yearsOldHeight}
          <InlineSelect
            label={copy.fields.height}
            mode={mode}
            name="profile.height"
            options={optionValues(heightOptions)}
            defaultValue={storyValue(story, "profile.height")}
            placeholder={copy.placeholders.height}
          />
          {copy.sentences.cmMoveAs}
          <InlineSelect
            label={copy.fields.gender}
            mode={mode}
            name="profile.gender"
            options={localizedGenderOptions}
            value={mode === "edit" ? gender : undefined}
            defaultValue={gender}
            onChange={setGender}
            placeholder={copy.placeholders.gender}
          />
          {showGenderDetails ? (
            <>
              {copy.sentences.genderDescribe}
              <InlineText
                label={copy.fields.genderDetails}
                mode={mode}
                name="profile.gender.details"
                defaultValue={storyValue(story, "profile.gender.details")}
                placeholder={copy.placeholders.tellUsMore}
              />
              {copy.sentences.pronounsAre}
              <InlineText
                label={copy.fields.pronouns}
                mode={mode}
                name="profile.gender.pronouns"
                defaultValue={storyValue(story, "profile.gender.pronouns")}
                placeholder={copy.placeholders.pronouns}
              />
            </>
          ) : null}
          {copy.sentences.wayILoveIs}
          <InlineSelect
            label={copy.fields.orientation}
            mode={mode}
            name="profile.sexual_orientation"
            options={localizedOrientationOptions}
            value={mode === "edit" ? orientation : undefined}
            defaultValue={orientation}
            onChange={setOrientation}
            placeholder={copy.placeholders.sexuality}
          />
          {showOrientationDetails ? (
            <>
              {copy.sentences.orientationSpecific}
              <InlineText
                label={copy.fields.orientationDetails}
                mode={mode}
                name="profile.sexual_orientation.details"
                defaultValue={storyValue(
                  story,
                  "profile.sexual_orientation.details",
                )}
                placeholder={copy.placeholders.tellUsMore}
              />
            </>
          ) : null}
          .
        </p>

        <p>
          {copy.sentences.currentHome}
          <InlineSelect
            label={copy.fields.living}
            mode={mode}
            name="profile.home_base"
            options={localizedHomeBaseOptions}
            defaultValue={storyValue(story, "profile.home_base")}
            placeholder={copy.placeholders.living}
          />
          {copy.sentences.meetGroupIn}
          <StoryAutocompleteField
            copy={autocompleteCopy}
            kind="city"
            label={copy.fields.cities}
            mode={mode}
            name="profile.event_location"
            onDirty={onDirty}
            defaultValue={storyValue(story, "profile.event_location")}
            placeholder={copy.placeholders.cities}
          />
          {genderedSentence(copy, "openDating", gender)}
          <InlineSelect
            label={copy.fields.geography}
            mode={mode}
            name="profile.geographic_setup"
            options={localizedGeographyOptions}
            defaultValue={storyValue(story, "profile.geographic_setup")}
            placeholder={copy.placeholders.geography}
          />
          {copy.sentences.relocatingIs}
          <InlineSelect
            label={copy.fields.relocation}
            mode={mode}
            name="profile.relocation"
            options={localizedRelocationOptions}
            defaultValue={storyValue(story, "profile.relocation")}
            placeholder={copy.placeholders.relocation}
          />
          .
        </p>

        <p>
          {genderedSentence(copy, "languagesAre", gender)}
          <StoryAutocompleteField
            copy={autocompleteCopy}
            kind="language"
            label={copy.fields.languages}
            mode={mode}
            name="profile.date_languages"
            onDirty={onDirty}
            defaultValue={storyValue(story, "profile.date_languages")}
            placeholder={copy.placeholders.languages}
          />
          .
        </p>
      </StoryChapter>

      <Divider />

      <StoryChapter
        eyebrow={copy.chapterTwo.eyebrow}
        title={copy.chapterTwo.title}
        description={copy.chapterTwo.description}
      >
        <p>
          {copy.sentences.partnerAge}
          <InlineSelect
            label={copy.fields.ageImportance}
            mode={mode}
            name="profile.age_matters"
            options={localizedMattersOptions}
            value={mode === "edit" ? ageMatters : undefined}
            defaultValue={ageMatters}
            onChange={setAgeMatters}
            placeholder={copy.placeholders.blank}
          />
          {copy.sentences.toMe}
          {showAgeRange ? (
            <>
              {" "}
              {copy.sentences.ageRangeFrom}
              <InlineSelect
                label={copy.fields.minAge}
                mode={mode}
                name="profile.age_matters.preferred_range.min"
                options={optionValues(ageOptions)}
                defaultValue={storyValue(
                  story,
                  "profile.age_matters.preferred_range.min",
                )}
                placeholder={copy.placeholders.min}
              />
              {copy.sentences.to}
              <InlineSelect
                label={copy.fields.maxAge}
                mode={mode}
                name="profile.age_matters.preferred_range.max"
                options={optionValues(ageOptions)}
                defaultValue={storyValue(
                  story,
                  "profile.age_matters.preferred_range.max",
                )}
                placeholder={copy.placeholders.max}
              />
              {copy.sentences.yearsOld}
            </>
          ) : null}
          {copy.sentences.theirHeight}
          <InlineSelect
            label={copy.fields.heightImportance}
            mode={mode}
            name="profile.height_important"
            options={localizedMattersOptions}
            value={mode === "edit" ? heightMatters : undefined}
            defaultValue={heightMatters}
            onChange={setHeightMatters}
            placeholder={copy.placeholders.blank}
          />
          {copy.sentences.toMe}{heightConnector}
          {showHeightRange ? (
            <>
              {copy.sentences.heightRangeFrom}
              <InlineSelect
                label={copy.fields.minHeight}
                mode={mode}
                name="profile.height_important.preferred_range.min"
                options={optionValues(heightOptions)}
                defaultValue={storyValue(
                  story,
                  "profile.height_important.preferred_range.min",
                )}
                placeholder={copy.placeholders.min}
              />
              {copy.sentences.cmAnd}
              <InlineSelect
                label={copy.fields.maxHeight}
                mode={mode}
                name="profile.height_important.preferred_range.max"
                options={optionValues(heightOptions)}
                defaultValue={storyValue(
                  story,
                  "profile.height_important.preferred_range.max",
                )}
                placeholder={copy.placeholders.max}
              />
              {copy.sentences.cmWorks}
            </>
          ) : null}
          .
        </p>

        <p>
          {genderedSentence(copy, "relationshipStatus", gender)}
          <InlineSelect
            label={copy.fields.relationshipStatus}
            mode={mode}
            name="profile.relationship_status"
            options={localizedRelationshipStatusOptions}
            defaultValue={storyValue(story, "profile.relationship_status")}
            placeholder={copy.placeholders.blank}
          />
          {genderedSentence(copy, "openToNow", gender)}
          <InlineSelect
            label={copy.fields.relationshipType}
            mode={mode}
            name="profile.available_relationships"
            options={localizedRelationshipOptions}
            defaultValue={storyValue(story, "profile.available_relationships")}
            placeholder={copy.placeholders.blank}
          />
          .
        </p>

        <p>
          {copy.sentences.childrenTruth}
          <InlineSelect
            label={copy.fields.children}
            mode={mode}
            name="profile.children_position"
            options={localizedChildrenOptions}
            defaultValue={storyValue(story, "profile.children_position")}
            placeholder={copy.placeholders.blank}
          />
          .
        </p>
      </StoryChapter>

      <Divider />

      <StoryChapter
        eyebrow={copy.chapterThree.eyebrow}
        title={copy.chapterThree.title}
        description={copy.chapterThree.description}
      >
        <p>
          {copy.sentences.religionIs}
          <InlineSelect
            label={copy.fields.religion}
            mode={mode}
            name="profile.religion_identity"
            options={localizedReligionOptions}
            value={mode === "edit" ? religion : undefined}
            defaultValue={religion}
            onChange={setReligion}
            placeholder={copy.placeholders.religion}
          />
          .
          {showReligionAlignment ? (
            <>
              {" "}
              {copy.sentences.sharingViews}
              <InlineSelect
                label={copy.fields.religiousAlignment}
                mode={mode}
                name="profile.religion_alignment_importance"
                options={localizedAlignmentOptions}
                value={mode === "edit" ? religionAlignment : undefined}
                defaultValue={religionAlignment}
                onChange={setReligionAlignment}
                placeholder={copy.placeholders.religion}
              />
              .
              {showFaith ? (
                <>
                  {" "}
                  {copy.sentences.faithIs}
                  <InlineSelect
                    label={copy.fields.faith}
                    mode={mode}
                    name="profile.religion_identity.central_religion"
                    options={localizedFaithOptions}
                    value={mode === "edit" ? faith : undefined}
                    defaultValue={faith}
                    onChange={setFaith}
                    placeholder={copy.placeholders.religion}
                  />
                  {showFaithDetails ? (
                    <>
                      {copy.sentences.describedAs}
                      <InlineText
                        label={copy.fields.faithDetails}
                        mode={mode}
                        name="profile.religion_identity.central_religion.details"
                        defaultValue={storyValue(
                          story,
                          "profile.religion_identity.central_religion.details",
                        )}
                        placeholder={copy.placeholders.describeIt}
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
          {copy.sentences.politicsAlignment}
          <InlineSelect
            label={copy.fields.politicsImportance}
            mode={mode}
            name="profile.political_alignment_importance"
            options={localizedPoliticalImportanceOptions}
            value={mode === "edit" ? politicalImportance : undefined}
            defaultValue={politicalImportance}
            onChange={setPoliticalImportance}
            placeholder={copy.placeholders.politics}
          />
          .
          {showPolitics ? (
            <>
              {" "}
              {copy.sentences.politicsLean}
              <InlineSelect
                label={copy.fields.politics}
                mode={mode}
                name="profile.politics_worldview"
                options={localizedPoliticsOptions}
                defaultValue={storyValue(story, "profile.politics_worldview")}
                placeholder={copy.placeholders.politics}
              />
              .
            </>
          ) : null}{" "}
          {copy.sentences.moneyAlignment}
          <InlineSelect
            label={copy.fields.financeImportance}
            mode={mode}
            name="profile.financial_alignment_importance"
            options={localizedFinancialImportanceOptions}
            value={mode === "edit" ? financialImportance : undefined}
            defaultValue={financialImportance}
            onChange={setFinancialImportance}
            placeholder={copy.placeholders.money}
          />
          .
          {showFinancialPhilosophy ? (
            <>
              {" "}
              {copy.sentences.moneyTendTo}
              <InlineSelect
                label={copy.fields.finance}
                mode={mode}
                name="profile.financial_philosophy"
                options={localizedFinancialOptions}
                defaultValue={storyValue(story, "profile.financial_philosophy")}
                placeholder={copy.placeholders.money}
              />
              .
            </>
          ) : null}
        </p>

        <p>
          {copy.sentences.fitnessIs}
          <InlineSelect
            label={copy.fields.fitness}
            mode={mode}
            name="profile.fitness_priority"
            options={localizedFitnessOptions}
            defaultValue={storyValue(story, "profile.fitness_priority")}
            placeholder={copy.placeholders.fitness}
          />
          {copy.sentences.rhythmIs}
          <InlineSelect
            label={copy.fields.rhythm}
            mode={mode}
            name="profile.lifestyle_pace"
            options={localizedRhythmOptions}
            defaultValue={storyValue(story, "profile.lifestyle_pace")}
            placeholder={copy.placeholders.rhythm}
          />
          .
        </p>
      </StoryChapter>

      <Divider />

      <StoryChapter
        eyebrow={copy.chapterFour.eyebrow}
        title={copy.chapterFour.title}
        description={copy.chapterFour.description}
      >
        <div className="min-w-0 max-w-full space-y-4">
          <p>
            {copy.sentences.dealBreakersIntro}
            <DealBreakerPicker
              mode={mode}
              onOtherDetailsChange={setDealBreakerDetails}
              onToggle={toggleDealBreaker}
              otherDetails={dealBreakerDetails}
              options={localizedDealBreakerOptions}
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
              {copy.sentences.otherDealBreaker}
              <InlineLongText
                editWidthClassName="w-[min(36rem,calc(100%-15rem))]"
                label={copy.fields.otherDealBreaker}
                mode={mode}
                name="profile.deal_breakers.details"
                onValueChange={setDealBreakerDetails}
                placeholder={copy.placeholders.whatElse}
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
              className="max-w-full text-left text-xl font-extrabold leading-tight text-lipstick-red underline decoration-lipstick-red/30 underline-offset-4 transition hover:text-wine-burgundy sm:text-2xl"
              onClick={() => setShowAnythingElse(true)}
              type="button"
            >
              {copy.sentences.anythingElsePrompt}
            </button>
          </>
        ) : (
          <div className={cn("space-y-3", storyTextClass)}>
            <p className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2">
              <span className="pt-[0.1em] leading-normal">{copy.ps}</span>
              <InlineLongText
                containerClassName="mx-0 block min-w-0 align-top"
                displayClassName="block w-full leading-normal"
                editClassName="block w-full align-top"
                editWidthClassName="w-full"
                label={copy.fields.anythingElse}
                mode={mode}
                name="profile.anything_else"
                defaultValue={anythingElse}
                placeholder={copy.placeholders.anythingElse}
                readClassName="mx-0 block min-w-0 px-0 leading-normal"
              />
            </p>
          </div>
        )}
      </section>

      {showSaveActions ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 min-[901px]:left-[260px]">
          <div className="mx-auto flex w-full max-w-6xl justify-center px-4 sm:px-6 lg:px-8">
            <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-3">
              <SubmitButton pendingLabel={copy.actions.saving}>
                <Save className="h-4 w-4" />
                {copy.actions.save}
              </SubmitButton>
              <Button onClick={onCancel} type="button" variant="secondary">
                {copy.actions.cancel}
              </Button>
              <ActionStatus
                error={state?.error}
                ok={state?.ok}
                successMessage={copy.storySaved}
                toastKey={state}
              />
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </ProfileCopyContext.Provider>
  );
}

export function ProfileStory({
  autocompleteCopy,
  copy,
  imageUploaderCopy,
  profile,
  profileImage,
}: {
  autocompleteCopy: StoryAutocompleteCopy;
  copy: ProfileCopy;
  imageUploaderCopy: ProfileImageUploaderCopy;
  profile: ProfileRegistration | null;
  profileImage?: ProfileImageConfig;
}) {
  return (
    <StoryNarrative
      autocompleteCopy={autocompleteCopy}
      copy={copy}
      imageUploaderCopy={imageUploaderCopy}
      mode="read"
      profile={profile}
      profileImage={profileImage}
    />
  );
}

export function ProfileForm({
  autocompleteCopy,
  copy,
  imageUploaderCopy,
  profile,
  profileImage,
}: {
  autocompleteCopy: StoryAutocompleteCopy;
  copy: ProfileCopy;
  imageUploaderCopy: ProfileImageUploaderCopy;
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
      title: copy.actions.discarded,
      variant: "info",
    });

    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      suppressDirtyChecksRef.current = false;
      updateDirtyState();
    }, 0);
  }, [copy.actions.discarded, showToast, state, updateDirtyState]);

  if (!profile) return <MissingStory copy={copy} />;

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
          autocompleteCopy={autocompleteCopy}
          copy={copy}
          key={formResetKey}
          imageUploaderCopy={imageUploaderCopy}
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
