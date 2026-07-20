"use client";

import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HoverTooltip } from "@/components/ui/hover-tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/lib/i18n/locales";

export type SupportQuestionCopy = {
  close: string;
  emailAriaLabel: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailStepTitle: string;
  errorFallback: string;
  fallbackPrefix: string;
  fallbackSuffix: string;
  intro: string;
  invalidEmail: string;
  listeningLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  requiredEmail: string;
  requiredMessage: string;
  send: string;
  sending: string;
  sentBody: string;
  subject: string;
  title: string;
  trigger: string;
};

const supportAvatars = [
  { name: "Adrian", src: "/support/support-avatar-3.webp" },
  { name: "Alexandra", src: "/support/support-avatar-2.webp" },
  { name: "Babette", src: "/support/support-avatar-1.webp" },
] as const;

const supportEmail = "hello@oneplusoneclub.com";

export function SupportQuestionDialog({
  copy,
  locale,
  useInvitationEmail = false,
}: {
  copy: SupportQuestionCopy;
  locale: Locale;
  useInvitationEmail?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"message" | "email">("message");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;

    setStep("message");
    setMessage("");
    setEmail("");
    setStatus("");
    setFailed(false);
    setPending(false);
    setSent(false);
  }

  function continueToEmail() {
    if (!message.trim()) {
      setStatus(copy.requiredMessage);
      messageRef.current?.focus();
      return;
    }

    setStatus("");
    setStep("email");
    window.setTimeout(() => emailRef.current?.focus(), 30);
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "message") {
      if (!message.trim()) {
        setStatus(copy.requiredMessage);
        messageRef.current?.focus();
        return;
      }
      if (!useInvitationEmail) {
        continueToEmail();
        return;
      }
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!useInvitationEmail && !normalizedEmail) {
      setStatus(copy.requiredEmail);
      emailRef.current?.focus();
      return;
    }
    if (!useInvitationEmail && !isValidEmail(normalizedEmail)) {
      setStatus(copy.invalidEmail);
      emailRef.current?.focus();
      return;
    }

    setPending(true);
    setStatus("");
    setFailed(false);

    try {
      const response = await fetch("/api/support-message", {
        body: JSON.stringify({
          email: normalizedEmail,
          locale,
          message: message.trim(),
          pageUrl: window.location.href,
          referrer: document.referrer,
          subject: copy.subject,
          useInvitationEmail,
          website: "",
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean };

      if (!response.ok || !result.ok) throw new Error(copy.errorFallback);
      setSent(true);
    } catch {
      setFailed(true);
      setStatus(copy.errorFallback);
    } finally {
      setPending(false);
    }
  }

  const fallbackHref = `mailto:${supportEmail}?subject=${encodeURIComponent(copy.subject)}`;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          className="mx-auto justify-self-center text-sm font-semibold text-lipstick-red underline decoration-lipstick-red/30 underline-offset-4 transition hover:text-wine-burgundy hover:decoration-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 focus-visible:ring-offset-2"
          type="button"
        >
          {copy.trigger}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-ink/35 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[71] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-wine-burgundy/15 bg-white shadow-2xl outline-none sm:overflow-visible"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            messageRef.current?.focus();
          }}
        >
          <div className="relative flex min-h-0 flex-col overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:overflow-visible sm:px-6 sm:pb-6 sm:pt-6">
            <Dialog.Close asChild>
              <button
                aria-label={copy.close}
                className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full text-lipstick-red transition hover:bg-blush-pink hover:text-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/30"
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </Dialog.Close>

            {step === "message" && !sent ? (
              <div className="mb-5 grid w-fit justify-items-center gap-1.5 pr-12">
                <div className="flex -space-x-3">
                  {supportAvatars.map((avatar) => {
                    const introduction = locale === "es"
                      ? `¡Hola! Soy ${avatar.name}.`
                      : `Hi! I'm ${avatar.name}.`;

                    return (
                      <span
                        aria-label={introduction}
                        className="group relative h-12 w-12 rounded-full focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 focus-visible:ring-offset-2 hover:z-10"
                        key={avatar.name}
                        role="img"
                        tabIndex={0}
                      >
                        <span className="absolute inset-0 overflow-hidden rounded-full border-2 border-white bg-cement-gray shadow-md transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110">
                          <Image alt="" fill sizes="48px" src={avatar.src} />
                        </span>
                        <HoverTooltip>{introduction}</HoverTooltip>
                      </span>
                    );
                  })}
                </div>
                <p className="text-xs font-extrabold text-lipstick-red">
                  {copy.listeningLabel}
                </p>
              </div>
            ) : null}

            <div className="grid min-h-0 content-start">
              {step === "email" || sent ? (
                <Dialog.Title className="pr-12 font-display text-4xl font-extrabold leading-none text-wine-burgundy">
                  {copy.emailStepTitle}
                </Dialog.Title>
              ) : (
                <>
                  <Dialog.Title className="pr-12 font-display text-2xl font-extrabold leading-tight text-wine-burgundy">
                    {copy.title}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1.5 text-sm font-semibold leading-6 text-muted">
                    {copy.intro}
                  </Dialog.Description>
                </>
              )}

              {sent ? (
                <p className="mt-5 text-base font-semibold leading-7 text-muted">
                  {copy.sentBody}
                </p>
              ) : (
                <form className="mt-5 grid gap-3" onSubmit={submitQuestion}>
                  {step === "message" ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5">
                      <Textarea
                        aria-label={copy.messageLabel}
                        autoFocus
                        className="min-h-40 resize-y text-base font-semibold"
                        maxLength={5000}
                        onChange={(event) => {
                          setMessage(event.target.value);
                          if (status) setStatus("");
                        }}
                        placeholder={copy.messagePlaceholder}
                        ref={messageRef}
                        required
                        value={message}
                      />
                      <Button
                        aria-label={useInvitationEmail && pending ? copy.sending : copy.send}
                        className="h-[52px] w-[52px] rounded-lg p-0"
                        disabled={useInvitationEmail && pending}
                        type="submit"
                      >
                        <Send aria-hidden="true" className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <label className="grid gap-2 text-sm font-extrabold text-wine-burgundy">
                        {copy.emailLabel}
                        <Input
                          aria-label={copy.emailLabel}
                          autoComplete="email"
                          className="h-12 text-base font-semibold"
                          inputMode="email"
                          maxLength={320}
                          onChange={(event) => {
                            setEmail(event.target.value);
                            if (status) setStatus("");
                          }}
                          placeholder={copy.emailPlaceholder}
                          ref={emailRef}
                          required
                          type="email"
                          value={email}
                        />
                      </label>
                      <Button className="h-12 w-full" disabled={pending} type="submit">
                        {pending ? copy.sending : copy.send}
                      </Button>
                    </div>
                  )}

                  {status ? (
                    <p aria-live="polite" className="text-sm font-semibold text-lipstick-red">
                      {status}
                    </p>
                  ) : null}
                  {failed ? (
                    <p className="text-sm font-semibold leading-6 text-muted">
                      {copy.fallbackPrefix}{" "}
                      <a
                        aria-label={copy.emailAriaLabel}
                        className="text-lipstick-red underline underline-offset-4"
                        href={fallbackHref}
                      >
                        {supportEmail}
                      </a>
                      {copy.fallbackSuffix}
                    </p>
                  ) : null}
                </form>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
