import Image from "next/image";
import { CreditCard, Gift, XCircle } from "lucide-react";

import { CreditHistorySection } from "@/components/app/credit-history-section";
import { RouteToast } from "@/components/app/route-toast";
import { CreditCheckoutButton } from "@/components/forms/credit-checkout-button";
import { ReferralCodeActions } from "@/components/forms/referral-code-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  syncCreditCheckoutSessionForMember,
  type CreditCheckoutSyncResult,
} from "@/lib/credit-purchases";
import { requireMemberContext } from "@/lib/data/member";
import {
  getCreditLedger,
  getCreditProducts,
  getReferralCode,
} from "@/lib/data/portal";
import type { CreditProduct } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CreditsPageProps = {
  searchParams: Promise<{
    purchase?: string;
    session_id?: string;
  }>;
};

export default async function CreditsPage({ searchParams }: CreditsPageProps) {
  const { member } = await requireMemberContext();
  const { purchase, session_id: sessionId } = await searchParams;
  const checkoutResult =
    purchase === "success"
      ? await syncCreditCheckoutSessionForMember(sessionId, member.id)
      : null;

  const [ledger, products, referralCode] = await Promise.all([
    getCreditLedger(member.id),
    getCreditProducts(),
    getReferralCode(member.id),
  ]);
  const productPricing = getCreditProductPricing(products);

  return (
    <>
      <section className="grid gap-2">
        <h1 className="font-display text-3xl font-black tracking-tight text-wine">
          Credits
        </h1>
      </section>

      <PurchaseStatus purchase={purchase} result={checkoutResult} />
      <PurchaseToast
        purchase={purchase}
        result={checkoutResult}
        sessionId={sessionId}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-lipstick" />
            Invite others to join the club
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="grid gap-1 text-lg leading-8 text-muted">
            <span>Know someone who would like to join the club?</span>
            <span>
              Send them your code so{" "}
              <span className="text-lipstick">they get 1 extra credit</span>{" "}
              when they join, and{" "}
              <span className="text-lipstick">you get 1 extra credit</span>.
            </span>
          </p>
          <div className="flex flex-col gap-3 rounded-lg border border-lipstick/20 bg-lipstick/8 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 px-2 py-2 font-mono text-2xl font-black tracking-[0.1em] break-all text-wine sm:px-3 sm:text-3xl sm:tracking-[0.14em]">
              {referralCode || "Available after membership is active"}
            </div>
            <ReferralCodeActions code={referralCode} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-lipstick" />
            Buy more credits
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {productPricing.map(
            ({ product, discountPercent, label, perCreditAmountCents }) => (
              <div
                key={product.id}
                className="flex min-h-full flex-col gap-4 rounded-lg border border-wine/10 bg-blush p-4 text-wine"
              >
                <div className="flex h-7 items-start">
                  {label ? (
                    <span
                      className={`inline-flex h-7 items-center rounded-full px-3 text-[0.68rem] font-medium uppercase tracking-wide text-white ${
                        label === "MOST POPULAR" ? "bg-lipstick" : "bg-ocean"
                      }`}
                    >
                      {label}
                    </span>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm font-black text-wine">{product.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {formatCreditProductDescription(product.credits)}
                  </p>
                </div>
                <div className="mt-auto grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-2xl font-black text-wine">
                      {formatCurrency(
                        product.price_amount_cents,
                        product.currency,
                      )}
                    </p>
                    <span className="inline-flex h-6 items-center rounded-full bg-white px-2.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted ring-1 ring-wine/10">
                      {discountPercent > 0
                        ? `Save ${discountPercent}%`
                        : "Base"}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-muted">
                    {formatCurrency(perCreditAmountCents, product.currency)} per
                    credit
                  </p>
                </div>
                <CreditCheckoutButton productId={product.id} />
              </div>
            ),
          )}
        </CardContent>
      </Card>

      <CreditHistorySection entries={ledger} />
    </>
  );
}

function PurchaseToast({
  purchase,
  result,
  sessionId,
}: {
  purchase?: string;
  result: CreditCheckoutSyncResult | null;
  sessionId?: string;
}) {
  if (purchase === "cancelled") {
    return (
      <RouteToast
        clearSearchParams={["purchase", "session_id"]}
        title="Checkout cancelled."
        toastKey="purchase-cancelled"
        variant="info"
      />
    );
  }

  if (purchase !== "success") return null;

  if (result?.status === "completed") {
    return (
      <RouteToast
        clearSearchParams={["purchase", "session_id"]}
        description={
          result.credits
            ? `${result.credits} credit${result.credits === 1 ? "" : "s"} added to your balance.`
            : "Credits added to your balance."
        }
        title="Payment confirmed."
        toastKey={`purchase-completed-${sessionId || "checkout"}`}
      />
    );
  }

  if (result?.status === "pending") {
    return (
      <RouteToast
        description="Your credits will appear when Stripe confirms the payment."
        title="Payment is still processing."
        toastKey={`purchase-pending-${sessionId || "checkout"}`}
        variant="info"
      />
    );
  }

  return (
    <RouteToast
      description={result?.error || "We could not verify this checkout session yet."}
      title="Payment needs review."
      toastKey={`purchase-review-${sessionId || "checkout"}`}
      variant="error"
    />
  );
}

function formatCreditProductDescription(credits: number) {
  return `Attend ${credits} event${credits === 1 ? "" : "s"}`;
}

function getCreditProductPricing(products: CreditProduct[]) {
  const basePricePerCreditCents =
    products.find((product) => product.credits === 1)?.price_amount_cents ||
    Math.max(
      ...products.map(
        (product) => product.price_amount_cents / product.credits,
      ),
      0,
    );

  const pricedProducts = products.map((product) => {
    const perCreditAmountCents = product.price_amount_cents / product.credits;
    const discountPercent =
      basePricePerCreditCents > perCreditAmountCents
        ? Math.round(
            ((basePricePerCreditCents - perCreditAmountCents) /
              basePricePerCreditCents) *
              100,
          )
        : 0;

    return {
      product,
      perCreditAmountCents,
      discountPercent,
      isPreferred: false,
      label: product.credits === 3 ? "MOST POPULAR" : null,
    };
  });

  const maxSavingProduct = pricedProducts.reduce<
    (typeof pricedProducts)[number] | null
  >((best, product) => {
    if (product.discountPercent <= 0) return best;
    if (!best) return product;
    if (product.discountPercent > best.discountPercent) return product;
    if (
      product.discountPercent === best.discountPercent &&
      product.product.credits > best.product.credits
    ) {
      return product;
    }

    return best;
  }, null);

  return pricedProducts.map((product) => {
    const isPreferred = product.product.id === maxSavingProduct?.product.id;

    return {
      ...product,
      isPreferred,
      label: isPreferred ? "MAX SAVINGS" : product.label,
    };
  });
}

function PurchaseStatus({
  purchase,
  result,
}: {
  purchase?: string;
  result: CreditCheckoutSyncResult | null;
}) {
  if (purchase === "cancelled") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-wine/10 bg-white p-4 text-sm leading-6 text-muted">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
        <div>
          <p className="font-black text-wine">Checkout cancelled</p>
          <p>No credits were purchased.</p>
        </div>
      </div>
    );
  }

  if (purchase !== "success") return null;

  if (result?.status === "completed") {
    return (
      <div
        className="flex items-start gap-4 rounded-lg bg-ocean p-4 text-sm leading-6 text-white shadow-[0_18px_45px_rgba(38,66,107,0.18)]"
        role="status"
      >
        <Image
          src="/success-checkmark-transparent.webp"
          alt=""
          width={44}
          height={44}
          aria-hidden="true"
          className="h-11 w-11 shrink-0 object-contain"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <div>
          <p className="font-black text-blush">PAYMENT CONFIRMED</p>
          <p className="text-white/88">
            {result.credits
              ? `${result.credits} credit${result.credits === 1 ? "" : "s"} `
              : "Credits "}
            added to your balance.
          </p>
        </div>
      </div>
    );
  }

  if (result?.status === "pending") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-lipstick/20 bg-lipstick/8 p-4 text-sm leading-6 text-lipstick">
        <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-black">Payment is still processing</p>
          <p>Your credits will appear here when Stripe confirms the payment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-lipstick/20 bg-lipstick/8 p-4 text-sm leading-6 text-lipstick">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-black">Payment needs review</p>
        <p>
          {result?.error || "We could not verify this checkout session yet."}
        </p>
      </div>
    </div>
  );
}
