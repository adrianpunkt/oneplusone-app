"use client";

import { useEffect, useRef } from "react";

import { useToast } from "@/components/ui/toast";

export function ActionStatus({
  error,
  ok,
  successMessage = "Saved.",
  toastKey,
}: {
  error?: string;
  ok?: boolean;
  successMessage?: string;
  toastKey?: unknown;
}) {
  const { showToast } = useToast();
  const lastToastKey = useRef<unknown>(null);
  const message = error || (ok ? successMessage : "");
  const activeToastKey = toastKey ?? message;

  useEffect(() => {
    if (!message || lastToastKey.current === activeToastKey) return;

    lastToastKey.current = activeToastKey;
    showToast({
      title: message,
      variant: error ? "error" : "success",
    });
  }, [activeToastKey, error, message, showToast]);

  if (!error && !ok) return null;

  if (ok && !error) {
    return (
      <p className="sr-only" role="status">
        {successMessage}
      </p>
    );
  }

  return (
    <p
      className="text-sm font-semibold text-lipstick-red"
      role="alert"
    >
      {error}
    </p>
  );
}
