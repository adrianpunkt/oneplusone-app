import { History } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { CreditLedgerEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type CreditHistorySectionProps = {
  entries: CreditLedgerEntry[];
};

export function CreditHistorySection({ entries }: CreditHistorySectionProps) {
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold leading-tight text-wine">
              <History className="h-5 w-5 text-lipstick" />
              Credits history
            </span>
          </span>
          <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-wine/10 bg-white px-3 text-xs font-semibold text-wine shadow-sm">
            <span className="group-open:hidden">Expand</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <CardContent className="grid gap-2">
          {entries.length ? (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-3 rounded-lg border border-wine/10 bg-white p-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="inline-flex h-8 w-14 items-center justify-center rounded-full bg-ocean px-3 text-sm font-medium text-white shadow-sm">
                  {formatCreditDelta(entry.delta)}
                </span>
                <p className="text-sm font-medium text-wine">
                  {creditLedgerLabel(entry.reason, entry.delta)}
                </p>
                <p className="text-xs font-medium text-faint sm:text-right">
                  {formatDateTime(entry.created_at)}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-blush p-4 text-sm font-medium text-muted">
              No credit entries yet.
            </p>
          )}
        </CardContent>
      </details>
    </Card>
  );
}

function formatCreditDelta(delta: number) {
  return delta > 0 ? `+${delta}` : String(delta);
}

function creditLedgerLabel(reason: string, delta: number) {
  const creditNoun = Math.abs(delta) === 1 ? "CREDIT" : "CREDITS";
  const labels: Record<string, string> = {
    credit_pack_purchase: `${creditNoun} PURCHASED`,
    event_confirmation: "EVENT CONFIRMED",
    event_waitlist_replacement_refund: `${creditNoun} REFUNDED`,
    event_cancellation_refund: `${creditNoun} REFUNDED`,
    credit_refund: `${creditNoun} REFUNDED`,
    membership_join_credit: `MEMBERSHIP ${creditNoun}`,
    referral_new_member_bonus: `REFERRAL ${creditNoun} EARNED`,
    referral_referrer_bonus: `REFERRAL ${creditNoun} EARNED`,
  };

  return labels[reason] || reason.replaceAll("_", " ").toUpperCase();
}
