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
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
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
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
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
        <h1 className="font-display text-3xl font-black text-wine">
          {dictionary.credits.title}
        </h1>
      </section>

      <PurchaseStatus dictionary={dictionary} purchase={purchase} result={checkoutResult} />
      <PurchaseToast
        dictionary={dictionary}
        purchase={purchase}
        result={checkoutResult}
        sessionId={sessionId}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-lipstick" />
            {dictionary.credits.inviteTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="grid gap-1 text-lg leading-8 text-muted">
            <span>{dictionary.credits.inviteLine1}</span>
            <span>
              {dictionary.credits.inviteLine2Prefix}{" "}
              <span className="text-lipstick">{dictionary.credits.inviteTheyGet}</span>{" "}
              {dictionary.credits.inviteLine2Middle}{" "}
              <span className="text-lipstick">{dictionary.credits.inviteYouGet}</span>.
            </span>
          </p>
          <div className="flex flex-col gap-3 rounded-lg border border-lipstick/20 bg-lipstick/8 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 px-2 py-2 font-mono text-2xl font-black tracking-widest break-all text-wine sm:px-3 sm:text-3xl">
              {referralCode || dictionary.credits.referralUnavailable}
            </div>
            <ReferralCodeActions
              code={referralCode}
              copy={{
                close: dictionary.referral.close,
                codeCopied: dictionary.referral.codeCopied,
                copied: dictionary.common.copied,
                copy: dictionary.common.copy,
                couldNotCopy: dictionary.referral.couldNotCopy,
                inviteLink: dictionary.referral.inviteLink,
                linkCopied: dictionary.referral.linkCopied,
                opening: dictionary.referral.opening,
                referralCode: dictionary.referral.referralCode,
                share: dictionary.referral.share,
                shareChannels: dictionary.referral.shareChannels,
                shareDescription: dictionary.referral.shareDescription,
                shareReferral: dictionary.referral.shareReferral,
                shareTextPrefix:
                  locale === "es"
                    ? "Únete a one plus one club con mi código "
                    : "Join one plus one club with my invite code ",
                shareTextSuffix:
                  locale === "es"
                    ? " y recibirás 1 crédito adicional gratis."
                    : " and you'll get 1 additional credit for free.",
                shareTitle: dictionary.referral.shareTitle,
                shareVia: dictionary.referral.shareVia,
                shareViaButton: dictionary.referral.shareViaButton,
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-lipstick" />
            {dictionary.credits.buyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {productPricing.map(
            ({ product, discountPercent, labelKey, perCreditAmountCents }) => (
              <div
                key={product.id}
                className="flex min-h-full flex-col gap-4 rounded-lg border border-wine/10 bg-blush p-4 text-wine"
              >
                <div className="flex h-7 items-start">
                  {labelKey ? (
                    <span
                      className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold uppercase tracking-wide text-white ${
                        labelKey === "mostPopular" ? "bg-lipstick" : "bg-ocean"
                      }`}
                    >
                      {labelKey === "mostPopular"
                        ? dictionary.credits.mostPopular
                        : dictionary.credits.maxSavings}
                    </span>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm font-extrabold text-wine">
                    {localizeText(product.name, product.localized_content, locale, "name")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {localizeText(
                      product.description,
                      product.localized_content,
                      locale,
                      "description",
                    ) || formatCreditProductDescription(product.credits, dictionary)}
                  </p>
                </div>
                <div className="mt-auto grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-2xl font-black text-wine">
                      {formatCurrency(
                        product.price_amount_cents,
                        product.currency,
                        locale,
                      )}
                    </p>
                    <span className="inline-flex h-6 items-center rounded-full bg-white px-2.5 text-xs font-semibold uppercase tracking-wide text-muted ring-1 ring-wine/10">
                      {discountPercent > 0
                        ? dictionary.credits.save(discountPercent)
                        : dictionary.credits.base}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-muted">
                    {dictionary.credits.perCredit(formatCurrency(perCreditAmountCents, product.currency, locale))}
                  </p>
                </div>
                <CreditCheckoutButton
                  copy={{
                    buy: dictionary.checkout.buy,
                    couldNotStart: dictionary.checkout.couldNotStart,
                    opening: dictionary.checkout.opening,
                  }}
                  productId={product.id}
                />
              </div>
            ),
          )}
        </CardContent>
      </Card>

      <CreditHistorySection dictionary={dictionary} entries={ledger} locale={locale} />
    </>
  );
}

function PurchaseToast({
  dictionary,
  purchase,
  result,
  sessionId,
}: {
  dictionary: Dictionary;
  purchase?: string;
  result: CreditCheckoutSyncResult | null;
  sessionId?: string;
}) {
  if (purchase === "cancelled") {
    return (
      <RouteToast
        clearSearchParams={["purchase", "session_id"]}
        title={dictionary.credits.checkoutCancelledToast}
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
            ? dictionary.credits.creditsAdded(result.credits)
            : dictionary.credits.creditsAdded()
        }
        title={dictionary.credits.paymentConfirmed}
        toastKey={`purchase-completed-${sessionId || "checkout"}`}
      />
    );
  }

  if (result?.status === "pending") {
    return (
      <RouteToast
        description={dictionary.credits.paymentPendingToastBody}
        title={dictionary.credits.paymentPendingTitle}
        toastKey={`purchase-pending-${sessionId || "checkout"}`}
        variant="info"
      />
    );
  }

  return (
    <RouteToast
      description={result?.error || dictionary.credits.paymentReviewBody}
      title={dictionary.credits.paymentReviewTitle}
      toastKey={`purchase-review-${sessionId || "checkout"}`}
      variant="error"
    />
  );
}

function formatCreditProductDescription(credits: number, dictionary: Dictionary) {
  return dictionary.credits.attendEvents(credits);
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
      labelKey: product.credits === 3 ? "mostPopular" : null,
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
      labelKey: isPreferred ? "maxSavings" : product.labelKey,
    };
  });
}

function PurchaseStatus({
  dictionary,
  purchase,
  result,
}: {
  dictionary: Dictionary;
  purchase?: string;
  result: CreditCheckoutSyncResult | null;
}) {
  if (purchase === "cancelled") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-wine/10 bg-white p-4 text-sm leading-6 text-muted">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
        <div>
          <p className="font-semibold text-wine">{dictionary.credits.checkoutCancelledTitle}</p>
          <p>{dictionary.credits.checkoutCancelledDescription}</p>
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
          <p className="font-semibold text-blush">{dictionary.credits.paymentConfirmedCaps}</p>
          <p className="text-white/88">
            {dictionary.credits.creditsAdded(result.credits)}
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
          <p className="font-semibold">{dictionary.credits.paymentPendingTitle}</p>
          <p>{dictionary.credits.paymentPendingBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-lipstick/20 bg-lipstick/8 p-4 text-sm leading-6 text-lipstick">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">{dictionary.credits.paymentReviewTitle}</p>
        <p>
          {result?.error || dictionary.credits.paymentReviewBody}
        </p>
      </div>
    </div>
  );
}
