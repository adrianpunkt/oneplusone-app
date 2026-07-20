"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Copy = {
  accept: string;
  decline: string;
  declineDescription: string;
  declineDetails: string;
  declineDetailsPlaceholder: string;
  declineReason: string;
  declineSubmit: string;
  declining: string;
  error: string;
  joining: string;
  keepInvitation: string;
  reasons: Record<string, string>;
};

export function PendingEventInvitationActions({ copy }: { copy: Copy }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("event_type_not_interested");
  const [details, setDetails] = useState("");

  async function accept() {
    setBusy("accept");
    setError("");
    let isNavigating = false;
    try {
      const response = await fetch("/api/stripe/create-event-membership-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = (await response.json()) as { error?: string; status?: string; url?: string };
      if (!response.ok) throw new Error(result.error || copy.error);
      if (result.url) {
        window.location.assign(result.url);
        isNavigating = true;
        return;
      }
      throw new Error(copy.error);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : copy.error);
    } finally {
      if (!isNavigating) setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError("");
    try {
      const response = await fetch("/api/event-invitation/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "decline", details, reason }),
      });
      if (!response.ok) throw new Error(copy.error);
      setDeclining(false);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : copy.error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-sm gap-3">
      <Button disabled={busy !== null} onClick={accept} type="button">
        {busy === "accept" ? copy.joining : copy.accept}
      </Button>
      <Dialog.Root
        onOpenChange={(open) => {
          if (busy !== null) return;
          setDeclining(open);
          setError("");
        }}
        open={declining}
      >
        <Dialog.Trigger asChild>
          <Button
            className="h-11 w-full border-lipstick-red/15 bg-white hover:bg-blush-pink"
            disabled={busy !== null}
            type="button"
            variant="secondary"
          >
            <XCircle className="h-4 w-4" />
            {copy.decline}
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-wine-burgundy/35 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-wine-burgundy/10 bg-white shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]">
            <div className="relative shrink-0 border-b border-wine-burgundy/10 px-4 py-4 sm:border-b-0 sm:px-5 sm:pb-3 sm:pt-5">
              <Dialog.Title className="pr-10 font-display text-xl font-extrabold leading-tight text-wine-burgundy">
                {copy.declineReason}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  aria-label={copy.keepInvitation}
                  className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full text-muted transition hover:bg-blush-pink hover:text-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 sm:right-4 sm:top-4 sm:h-10 sm:w-10"
                  disabled={busy !== null}
                  type="button"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="grid min-h-0 flex-auto content-start gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:pt-0">
              <Dialog.Description className="text-sm leading-6 text-muted">
                {copy.declineDescription}
              </Dialog.Description>
              <fieldset className="grid gap-2">
                <legend className="sr-only">{copy.declineReason}</legend>
                {Object.entries(copy.reasons).map(([value, label]) => (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-wine-burgundy/10 bg-white p-3 text-sm font-semibold text-wine-burgundy transition has-[:checked]:border-lipstick-red/40 has-[:checked]:bg-blush-pink hover:bg-blush-pink/60"
                    key={value}
                  >
                    <input
                      checked={reason === value}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-lipstick-red"
                      name="pending_decline_reason"
                      onChange={() => setReason(value)}
                      type="radio"
                      value={value}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
                {copy.declineDetails}
                <Textarea
                  className="min-h-20 resize-none font-normal"
                  maxLength={500}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder={copy.declineDetailsPlaceholder}
                  value={details}
                />
              </label>
            </div>

            <div className="grid shrink-0 gap-3 border-t border-wine-burgundy/10 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-5">
              {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Dialog.Close asChild>
                  <Button
                    className="h-11 w-full sm:h-10 sm:w-auto"
                    disabled={busy !== null}
                    type="button"
                    variant="secondary"
                  >
                    {copy.keepInvitation}
                  </Button>
                </Dialog.Close>
                <Button
                  className="h-11 w-full sm:h-10 sm:w-auto"
                  disabled={busy !== null}
                  onClick={decline}
                  type="button"
                  variant="destructive"
                >
                  {busy === "decline" ? copy.declining : copy.declineSubmit}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {!declining && error ? (
        <p className="text-sm font-semibold text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
