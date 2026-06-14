"use client";

import { useActionState, useState } from "react";
import { ExternalLink, KeyRound, Mail, RotateCcw, UserPlus } from "lucide-react";

import { requestOtpAction, type AuthActionState, verifyOtpAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = {};
const joinUrl = "https://oneplusoneclub.com/story";

function LoginIntro() {
  return (
    <div className="grid gap-2">
      <h1 className="font-display text-2xl font-extrabold leading-tight text-wine">
        Welcome back
      </h1>
      <p className="text-sm leading-6 text-muted">
        Use the email from your story to login to the <b>one plus one app</b>. We will send you a
        private code to login.
      </p>
    </div>
  );
}

export function LoginForm({ next = "/dashboard" }: { next?: string }) {
  const [hideVerifyError, setHideVerifyError] = useState(false);
  const [requestState, requestAction, requestPending] = useActionState(
    requestOtpAction,
    initialState,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyOtpAction,
    initialState,
  );
  const email = verifyState.email || requestState.email || "";
  const activeNext = verifyState.next || requestState.next || next;
  const codeStep = Boolean(requestState.sent || verifyState.sent);
  const notRegistered = requestState.notRegistered || verifyState.notRegistered;
  const codeStepError =
    requestPending || verifyPending
      ? undefined
      : hideVerifyError
        ? requestState.error
        : verifyState.error || requestState.error;

  if (notRegistered) {
    return (
      <div className="grid gap-4">
        <LoginIntro />
        <form action={requestAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              defaultValue={email}
              required
            />
          </div>
          <Button disabled={requestPending} size="lg">
            <Mail className="h-4 w-4" />
            {requestPending ? "Checking..." : "Send login code"}
          </Button>
        </form>
        <div className="grid gap-3 rounded-lg border border-lipstick/20 bg-lipstick/8 p-4 text-sm leading-6 text-wine">
          <div className="flex gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-lipstick">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold">We could not find an active membership for that email.</p>
              <p className="text-wine/70">
                If you want to join one plus one club, click the button below.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <a href={joinUrl}>
              Join the club
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
          <p className="rounded-lg border border-ocean/15 bg-ocean/8 p-3 text-sm font-semibold leading-6 text-ocean">
            We sent a login code to {email}.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="code">Email code</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Enter the code"
              required
            />
          </div>
          <Button disabled={verifyPending} size="lg">
            <KeyRound className="h-4 w-4" />
            {verifyPending ? "Checking..." : "Login"}
          </Button>
          {codeStepError ? (
            <p className="text-sm font-semibold text-lipstick" role="status">
              {codeStepError}
            </p>
          ) : null}
        </form>
        <form
          action={requestAction}
          className="flex flex-wrap gap-2"
          onSubmit={() => setHideVerifyError(true)}
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={activeNext} />
          <button
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ocean underline decoration-ocean/40 underline-offset-4 transition-colors hover:text-ocean/80 hover:decoration-ocean disabled:pointer-events-none disabled:opacity-55"
            disabled={requestPending}
            type="submit"
          >
            <RotateCcw className="h-4 w-4 transition-transform duration-150 group-hover:-rotate-45" />
            {requestPending ? "Sending..." : "Send a new code"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <LoginIntro />
      <form action={requestAction} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            defaultValue={email}
            required
          />
        </div>
        <Button disabled={requestPending} size="lg">
          <Mail className="h-4 w-4" />
          {requestPending ? "Sending..." : "Send login code"}
        </Button>
        {requestState.error ? (
          <p className="text-sm font-semibold text-lipstick" role="status">
            {requestState.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
