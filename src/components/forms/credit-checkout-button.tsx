"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";

export type CreditCheckoutCopy = {
  buy: string;
  couldNotStart: string;
  opening: string;
};

export function CreditCheckoutButton({
  copy,
  productId,
}: {
  copy: CreditCheckoutCopy;
  productId: string;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stripe/create-credit-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error || copy.couldNotStart);
      }

      window.location.assign(data.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : copy.couldNotStart);
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" onClick={startCheckout} disabled={loading}>
        <CreditCard className="h-4 w-4" />
        {loading ? copy.opening : copy.buy}
      </Button>
      {error ? <p className="text-xs font-semibold text-lipstick-red">{error}</p> : null}
    </div>
  );
}
