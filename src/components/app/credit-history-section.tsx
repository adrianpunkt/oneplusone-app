import { History } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { creditNoun } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import type { CreditLedgerEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type CreditHistorySectionProps = {
  balance: number;
  dictionary: Dictionary;
  entries: CreditLedgerEntry[];
  locale: Locale;
};

export function CreditHistorySection({
  balance,
  dictionary,
  entries,
  locale,
}: CreditHistorySectionProps) {
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold leading-tight text-wine-burgundy">
              <History className="h-5 w-5 text-lipstick-red" />
              {dictionary.creditHistory.availableCredits(balance)}
            </span>
          </span>
          <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-wine-burgundy/10 bg-white px-3 text-xs font-semibold text-wine-burgundy shadow-sm">
            <span className="group-open:hidden">{dictionary.creditHistory.viewHistory}</span>
            <span className="hidden group-open:inline">
              {dictionary.creditHistory.hideHistory}
            </span>
          </span>
        </summary>
        <CardContent className="grid gap-2">
          {entries.length ? (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-3 rounded-lg border border-wine-burgundy/10 bg-white p-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="inline-flex h-8 w-14 items-center justify-center rounded-full bg-ocean-blue px-3 text-sm font-medium text-white shadow-sm">
                  {formatCreditDelta(entry.delta)}
                </span>
                <p className="text-sm font-medium text-wine-burgundy">
                  {creditLedgerLabel(entry.reason, entry.delta, dictionary)}
                </p>
                <p className="text-xs font-medium text-faint sm:text-right">
                  {formatDateTime(entry.created_at, locale)}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-blush-pink p-4 text-sm font-medium text-muted">
              {dictionary.creditHistory.empty}
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

function creditLedgerLabel(reason: string, delta: number, dictionary: Dictionary) {
  const noun = creditNoun(delta, dictionary, true);
  const label = dictionary.creditHistory.labels[
    reason as keyof typeof dictionary.creditHistory.labels
  ];

  if (typeof label === "function") return label(noun);
  if (typeof label === "string") return label;

  return reason.replaceAll("_", " ").toUpperCase();
}
