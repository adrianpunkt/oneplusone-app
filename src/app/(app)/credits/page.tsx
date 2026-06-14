import { CreditCard, Gift, History } from "lucide-react";

import { CreditCheckoutButton } from "@/components/forms/credit-checkout-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberContext } from "@/lib/data/member";
import {
  getCreditBalance,
  getCreditLedger,
  getCreditProducts,
  getReferralCode,
} from "@/lib/data/portal";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const { member } = await requireMemberContext();
  const [balance, ledger, products, referralCode] = await Promise.all([
    getCreditBalance(member.id),
    getCreditLedger(member.id),
    getCreditProducts(),
    getReferralCode(member.id),
  ]);

  return (
    <>
      <section className="grid gap-2">
        <Badge variant="wine">Credits</Badge>
        <h1 className="font-display text-3xl font-black tracking-tight text-wine">
          {balance} event credits
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          One credit reserves one event seat. Credits do not expire and can also be earned
          through referrals or hosting.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-lipstick" />
              Referral code
            </CardTitle>
            <CardDescription>
              A new member gets 1 credit when they join with your code. You get 1 too.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-lipstick/20 bg-lipstick/8 p-4 font-mono text-2xl font-black tracking-wide text-wine">
              {referralCode || "Available after membership is active"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-lipstick" />
              Buy credits
            </CardTitle>
            <CardDescription>Choose a pack. Checkout is handled securely by Stripe.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {products.map((product) => (
              <div key={product.id} className="grid gap-3 rounded-lg border border-wine/10 bg-blush p-4">
                <div>
                  <p className="text-sm font-black text-wine">{product.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{product.description}</p>
                </div>
                <p className="text-2xl font-black text-wine">
                  {formatCurrency(product.price_amount_cents, product.currency)}
                </p>
                <CreditCheckoutButton productId={product.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-lipstick" />
            Credit history
          </CardTitle>
          <CardDescription>Every credit change is recorded here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {ledger.length ? (
            ledger.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-2 rounded-lg border border-wine/10 bg-white p-3 sm:grid-cols-[80px_1fr_auto]"
              >
                <Badge variant={entry.delta > 0 ? "ocean" : "wine"}>
                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                </Badge>
                <div>
                  <p className="text-sm font-bold text-wine">{entry.reason.replaceAll("_", " ")}</p>
                  <p className="text-xs text-muted">{entry.notes || entry.source_type}</p>
                </div>
                <p className="text-xs font-semibold text-faint">{formatDateTime(entry.created_at)}</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-blush p-4 text-sm font-semibold text-muted">
              No credit entries yet.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
