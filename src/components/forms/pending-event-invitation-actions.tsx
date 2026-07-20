"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Copy = {
  accept: string;
  decline: string;
  declineDetails: string;
  declineReason: string;
  error: string;
  reasons: Record<string, string>;
  saving: string;
};

export function PendingEventInvitationActions({ copy }: { copy: Copy }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("weekend_unavailable");
  const [details, setDetails] = useState("");

  async function accept() {
    setBusy("accept");
    setError("");
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
        return;
      }
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : copy.error);
      setBusy(null);
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
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || copy.error);
      setDeclining(false);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : copy.error);
    } finally {
      setBusy(null);
    }
  }

  if (declining) {
    return (
      <div className="grid gap-3 rounded-xl border border-wine-burgundy/10 bg-white p-4">
        <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
          {copy.declineReason}
          <select
            className="h-11 rounded-md border border-wine-burgundy/15 bg-white px-3"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          >
            {Object.entries(copy.reasons).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-wine-burgundy">
          {copy.declineDetails}
          <Textarea
            maxLength={500}
            onChange={(event) => setDetails(event.target.value)}
            value={details}
          />
        </label>
        {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy !== null} onClick={decline} type="button" variant="destructive">
            {busy === "decline" ? copy.saving : copy.decline}
          </Button>
          <Button disabled={busy !== null} onClick={() => setDeclining(false)} type="button" variant="secondary">
            ×
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-sm gap-3">
      <Button disabled={busy !== null} onClick={accept} type="button">
        {busy === "accept" ? copy.saving : copy.accept}
      </Button>
      <Button disabled={busy !== null} onClick={() => setDeclining(true)} type="button" variant="secondary">
        {copy.decline}
      </Button>
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
