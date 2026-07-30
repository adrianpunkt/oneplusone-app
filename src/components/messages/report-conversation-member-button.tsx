"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Flag, ShieldCheck } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addMessageReportDetailsAction,
  reportConversationMemberAction,
} from "@/lib/actions/messages";

export type ReportConversationMemberCopy = {
  action: string;
  completeAction: string;
  completeBody: string;
  completeTitle: string;
  detailsBody: string;
  detailsLabel: string;
  detailsPlaceholder: string;
  detailsSkip: string;
  detailsSubmit: string;
  detailsSubmitting: string;
  detailsTitle: string;
};

type DialogStep = "form" | "complete";

export function ReportConversationMemberButton({
  conversationId,
  copy,
}: {
  conversationId: string;
  copy: ReportConversationMemberCopy;
}) {
  const [details, setDetails] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [step, setStep] = useState<DialogStep>("form");
  const [pending, startTransition] = useTransition();
  const detailsRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || step !== "form") return;
    const focusTimer = window.setTimeout(
      () => detailsRef.current?.focus({ preventScroll: true }),
      30,
    );
    return () => window.clearTimeout(focusTimer);
  }, [open, step]);

  function startReport() {
    setDetails("");
    setStatus("");
    setStep("form");
    setOpen(true);
  }

  function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    startTransition(async () => {
      const reportResult =
        await reportConversationMemberAction(conversationId);
      if (!reportResult.ok || !reportResult.reportId) {
        setStatus(reportResult.error || "");
        return;
      }

      const cleanDetails = details.trim();
      if (cleanDetails) {
        const detailsResult = await addMessageReportDetailsAction(
          reportResult.reportId,
          cleanDetails,
        );
        if (!detailsResult.ok) {
          setStatus(detailsResult.error || "");
          return;
        }
      }

      setStep("complete");
    });
  }

  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pending) return;
        setOpen(nextOpen);
      }}
      open={open}
    >
      <Button
        className="shrink-0"
        disabled={pending}
        onClick={startReport}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Flag aria-hidden="true" className="h-4 w-4" />
        {copy.action}
      </Button>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-wine-burgundy/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[71] grid max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border border-wine-burgundy/10 bg-white p-5 shadow-2xl outline-none sm:p-6"
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          {step === "form" ? (
            <>
              <div className="grid gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-ocean-blue/10 text-ocean-blue">
                  <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="grid gap-2">
                  <Dialog.Title className="font-display text-2xl font-extrabold leading-tight text-wine-burgundy">
                    {copy.detailsTitle}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm leading-6 text-muted">
                    {copy.detailsBody}
                  </Dialog.Description>
                </div>
              </div>
              <form className="grid gap-3" onSubmit={submitReport}>
                <label className="grid gap-2 text-sm font-bold text-wine-burgundy">
                  {copy.detailsLabel}
                  <Textarea
                    maxLength={5000}
                    onChange={(event) => {
                      setDetails(event.target.value);
                      if (status) setStatus("");
                    }}
                    placeholder={copy.detailsPlaceholder}
                    ref={detailsRef}
                    rows={6}
                    value={details}
                  />
                </label>
                <Button disabled={pending} type="submit">
                  {pending ? copy.detailsSubmitting : copy.detailsSubmit}
                </Button>
                <Dialog.Close asChild>
                  <Button disabled={pending} type="button" variant="ghost">
                    {copy.detailsSkip}
                  </Button>
                </Dialog.Close>
              </form>
            </>
          ) : null}

          {step === "complete" ? (
            <>
              <div className="grid gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-ocean-blue/10 text-ocean-blue">
                  <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="grid gap-2">
                  <Dialog.Title className="font-display text-2xl font-extrabold leading-tight text-wine-burgundy">
                    {copy.completeTitle}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm leading-6 text-muted">
                    {copy.completeBody}
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <Button className="w-full" type="button">
                  {copy.completeAction}
                </Button>
              </Dialog.Close>
            </>
          ) : null}

          {status ? (
            <p
              aria-live="polite"
              className="text-sm font-semibold text-lipstick-red"
            >
              {status}
            </p>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
