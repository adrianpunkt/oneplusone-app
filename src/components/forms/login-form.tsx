"use client";

import { useActionState, useEffect, useState } from "react";
import { ExternalLink, KeyRound, Mail, RotateCcw, UserPlus } from "lucide-react";

import { requestOtpAction, type AuthActionState, verifyOtpAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@/lib/i18n/locales";
import type { MemberLoginOtpType } from "@/lib/auth-link";

const initialState: AuthActionState = {};
const joinUrl = "https://oneplusoneclub.com/story";

export type LoginFormCopy = {
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

  useEffect(() => {
    if (!requestState.sent || !requestState.email) return;

    showToast({
      description: requestState.email,
      title: copy.codeSentToast,
    });
  }, [copy.codeSentToast, requestState, showToast]);

  if (notRegistered) {
    return (
      <div className="grid gap-4">
        <LoginIntro copy={copy} />
        <form action={requestAction} className="grid gap-4">
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
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={copy.codePlaceholder}
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
          onSubmit={() => setHideVerifyError(true)}
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
      <form action={requestAction} className="grid gap-4">
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
