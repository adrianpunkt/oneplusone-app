"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useToast, type ToastVariant } from "@/components/ui/toast";

type RouteToastProps = {
  clearSearchParams?: string[];
  description?: string;
  title: string;
  toastKey?: string | null;
  variant?: ToastVariant;
};

export function RouteToast({
  clearSearchParams = [],
  description,
  title,
  toastKey,
  variant = "success",
}: RouteToastProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();
  const shownToastKey = useRef<string | null>(null);
  const clearSearchParamsKey = clearSearchParams.join("\n");

  useEffect(() => {
    if (!toastKey || shownToastKey.current === toastKey) return;

    shownToastKey.current = toastKey;
    showToast({ description, title, variant });

    if (!clearSearchParamsKey) return;

    const params = new URLSearchParams(window.location.search);
    clearSearchParamsKey.split("\n").forEach((param) => params.delete(param));
    const nextSearch = params.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, {
      scroll: false,
    });
  }, [
    clearSearchParamsKey,
    description,
    pathname,
    router,
    showToast,
    title,
    toastKey,
    variant,
  ]);

  return null;
}
