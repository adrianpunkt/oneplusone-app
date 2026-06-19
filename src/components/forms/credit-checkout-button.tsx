"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";

const CHECKOUT_REQUEST_TIMEOUT_MS = 15_000;

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

    const controller = new AbortController();
    let timeoutId: number | undefined = window.setTimeout(() => {
      controller.abort();
    }, CHECKOUT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/stripe/create-credit-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
        signal: controller.signal,
      });
      const data = await readCheckoutResponse(response);

      if (!response.ok || !data.url) {
        throw new Error(data.error || copy.couldNotStart);
      }

      window.clearTimeout(timeoutId);
      timeoutId = undefined;
      window.location.assign(data.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : copy.couldNotStart);
      setLoading(false);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
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

async function readCheckoutResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {} as { url?: string; error?: string };
  }

  return response.json().catch(() => ({})) as Promise<{
    url?: string;
    error?: string;
  }>;
}
