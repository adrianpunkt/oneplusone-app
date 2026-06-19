"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, KeyRound, Mail, RotateCcw, UserPlus, X } from "lucide-react";

import { requestOtpAction, type AuthActionState, verifyOtpAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@/lib/i18n/locales";
import { encodeEmailHint, type MemberLoginOtpType } from "@/lib/auth-link";

const initialState: AuthActionState = {};
const joinUrl = "https://oneplusoneclub.com/your-story";

export type LoginFormCopy = {
  assistanceClose: string;
  assistanceEmail: string;
  assistanceEmailAriaLabel: string;
  assistanceLeadPrefix: string;
  assistanceLeadSuffix: string;
  assistanceSubject: string;
  assistanceTitle: string;
  checking: string;
  codePlaceholder: string;
  codeSentToast: string;
  email: string;
  emailCode: string;
  emailPlaceholder: string;
  introBodyAppName: string;
  introBodyPrefix: string;
  introBodySuffix: string;
  introTitle: string;
  joinClub: string;
  login: string;
  notRegisteredBody: string;
  notRegisteredTitle: string;
  needAssistance: string;
  sendLoginCode: string;
  sendNewCode: string;
  sending: string;
  sentCodePrefix: string;
  sentCodeSuffix: string;
};

function LoginIntro({ copy }: { copy: LoginFormCopy }) {
  return (
    <div className="grid gap-2">
      <h1 className="font-display text-2xl font-extrabold leading-tight text-wine-burgundy">
        {copy.introTitle}
      </h1>
      <p className="text-sm leading-6 text-muted">
        {copy.introBodyPrefix}
        <strong className="font-extrabold text-ocean-blue">{copy.introBodyAppName}</strong>
        {copy.introBodySuffix}
      </p>
    </div>
  );
}

function FormErrorMessage({ message }: { message: string }) {
  const highlight = message.includes("last one")
    ? "last one"
    : message.includes("último")
      ? "último"
      : "";

  if (!highlight) return message;

  const highlightStart = message.indexOf(highlight);
  const before = message.slice(0, highlightStart);
  const after = message.slice(highlightStart + highlight.length);

  return (
    <>
      {before}
      <span className="underline decoration-current decoration-2 underline-offset-2">
        {highlight}
      </span>
      {after}
    </>
  );
}

function AssistanceDialog({ copy }: { copy: LoginFormCopy }) {
  const emailHref = `mailto:${copy.assistanceEmail}?subject=${encodeURIComponent(
    copy.assistanceSubject,
  )}`;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className="justify-self-center text-sm font-black text-ocean-blue underline decoration-ocean-blue/40 underline-offset-4 transition-colors hover:text-ocean-blue/80 hover:decoration-ocean-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 focus-visible:ring-offset-2"
          style={{ fontWeight: 900 }}
          type="button"
        >
          {copy.needAssistance}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-wine-burgundy/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-wine-burgundy/10 bg-white p-5 shadow-2xl">
          <div className="grid gap-2 pr-10">
            <Dialog.Title className="font-display text-2xl font-extrabold text-wine-burgundy">
              {copy.assistanceTitle}
            </Dialog.Title>
            <Dialog.Description className="text-base font-medium leading-6 text-muted">
              {copy.assistanceLeadPrefix}{" "}
              <a
                aria-label={copy.assistanceEmailAriaLabel}
                className="font-extrabold text-ocean-blue underline decoration-ocean-blue/35 underline-offset-4 hover:text-ocean-blue/80 hover:decoration-ocean-blue"
                href={emailHref}
              >
                {copy.assistanceEmail}
              </a>
              {copy.assistanceLeadSuffix}
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <Button
              aria-label={copy.assistanceClose}
              className="absolute right-3 top-3 h-9 w-9 rounded-full p-0 text-muted hover:bg-blush-pink hover:text-wine-burgundy"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function LoginForm({
  codeStepMessage,
  copy,
  initialEmail = "",
  initialOtpType = "email",
  initialSent = false,
  locale,
  next = "/dashboard",
}: {
  codeStepMessage?: string;
  copy: LoginFormCopy;
  initialEmail?: string;
  initialOtpType?: MemberLoginOtpType;
  initialSent?: boolean;
  locale: Locale;
  next?: string;
}) {
  const [hideVerifyError, setHideVerifyError] = useState(false);
  const submittedRequestBaselineRef = useRef<AuthActionState | null>(null);
  const handledRequestStateRef = useRef<AuthActionState | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const { showToast } = useToast();
  const initialRequestState: AuthActionState = {
    email: initialEmail || undefined,
    next,
    otpType: initialOtpType,
    sent: initialSent || undefined,
  };
  const [requestState, requestAction, requestPending] = useActionState(
    requestOtpAction,
    initialRequestState,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyOtpAction,
    initialState,
  );
  const email = verifyState.email || requestState.email || initialEmail;
  const activeNext = verifyState.next || requestState.next || next;
  const otpType = verifyState.otpType || requestState.otpType || initialOtpType;
  const codeStep = Boolean(requestState.sent || verifyState.sent);
  const notRegistered = requestState.notRegistered || verifyState.notRegistered;
  const codeStepError =
    requestPending || verifyPending
      ? undefined
      : hideVerifyError
        ? requestState.error
        : verifyState.error || requestState.error;

  function handleRequestSubmit() {
    submittedRequestBaselineRef.current = requestState;
  }

  useEffect(() => {
    if (!codeStep) return;

    codeInputRef.current?.focus();
  }, [codeStep]);

  useEffect(() => {
    if (
      !submittedRequestBaselineRef.current ||
      submittedRequestBaselineRef.current === requestState ||
      handledRequestStateRef.current === requestState
    ) {
      return;
    }

    handledRequestStateRef.current = requestState;
    submittedRequestBaselineRef.current = null;

    if (!requestState.sent || !requestState.email) {
      return;
    }

    showToast({
      description: requestState.email,
      title: copy.codeSentToast,
    });

    const params = new URLSearchParams(searchParamString);
    params.set("email_hint", encodeEmailHint(requestState.email));
    params.set("otp_type", otpType);
    params.set("sent", "1");

    if (activeNext === "/dashboard") {
      params.delete("next");
    } else {
      params.set("next", activeNext);
    }

    const queryString = params.toString();
    const currentPath = `${pathname}${searchParamString ? `?${searchParamString}` : ""}`;
    const nextPath = `${pathname}${queryString ? `?${queryString}` : ""}`;

    if (nextPath !== currentPath) {
      router.replace(nextPath, { scroll: false });
    }
  }, [
    activeNext,
    copy.codeSentToast,
    otpType,
    pathname,
    requestState,
    router,
    searchParamString,
    showToast,
  ]);

  if (notRegistered) {
    return (
      <div className="grid gap-4">
        <LoginIntro copy={copy} />
        <form
          action={requestAction}
          className="grid gap-4"
          onSubmit={handleRequestSubmit}
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="email">{copy.email}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={copy.emailPlaceholder}
              defaultValue={email}
              required
            />
          </div>
          <Button disabled={requestPending} size="lg">
            <Mail className="h-4 w-4" />
            {requestPending ? copy.checking : copy.sendLoginCode}
          </Button>
        </form>
        <div className="grid gap-3 rounded-lg border border-lipstick-red/20 bg-lipstick-red/8 p-4 text-sm leading-6 text-wine-burgundy">
          <div className="flex gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-lipstick-red">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold">{copy.notRegisteredTitle}</p>
              <p className="text-wine-burgundy/70">
                {copy.notRegisteredBody}
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <a href={joinUrl}>
              {copy.joinClub}
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <AssistanceDialog copy={copy} />
        </div>
      </div>
    );
  }

  if (codeStep) {
    return (
      <div className="grid gap-4">
        <form
          action={verifyAction}
          className="grid gap-4"
          onSubmit={() => setHideVerifyError(false)}
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={activeNext} />
          <input type="hidden" name="otpType" value={otpType} />
          <p className="rounded-lg border border-ocean-blue/15 bg-ocean-blue/8 p-3 text-sm font-semibold leading-6 text-ocean-blue">
            {codeStepMessage || `${copy.sentCodePrefix}${email}${copy.sentCodeSuffix}`}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="code">{copy.emailCode}</Label>
            <Input
              id="code"
              name="code"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="go"
              maxLength={12}
              pattern="[0-9]*"
              placeholder={copy.codePlaceholder}
              spellCheck={false}
              required
            />
          </div>
          <Button disabled={verifyPending} size="lg">
            <KeyRound className="h-4 w-4" />
            {verifyPending ? copy.checking : copy.login}
          </Button>
          {codeStepError ? (
            <p className="text-sm font-semibold text-lipstick-red" role="status">
              <FormErrorMessage message={codeStepError} />
            </p>
          ) : null}
        </form>
        <form
          action={requestAction}
          className="flex flex-wrap gap-2"
          onSubmit={() => {
            setHideVerifyError(true);
            handleRequestSubmit();
          }}
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={activeNext} />
          <button
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ocean-blue underline decoration-ocean-blue/40 underline-offset-4 transition-colors hover:text-ocean-blue/80 hover:decoration-ocean-blue disabled:pointer-events-none disabled:opacity-55"
            disabled={requestPending}
            type="submit"
          >
            <RotateCcw className="h-4 w-4 transition-transform duration-150 group-hover:-rotate-45" />
            {requestPending ? copy.sending : copy.sendNewCode}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <LoginIntro copy={copy} />
      <form
        action={requestAction}
        className="grid gap-4"
        onSubmit={handleRequestSubmit}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-2">
          <Label htmlFor="email">{copy.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={copy.emailPlaceholder}
            defaultValue={email}
            required
          />
        </div>
        <Button disabled={requestPending} size="lg">
          <Mail className="h-4 w-4" />
          {requestPending ? copy.sending : copy.sendLoginCode}
        </Button>
        {requestState.error ? (
          <p className="text-sm font-semibold text-lipstick-red" role="status">
            {requestState.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
