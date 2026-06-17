import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { Locale } from "@/lib/i18n/locales";
import {
  formatCurrency as formatLocalizedCurrency,
  formatDateTime as formatLocalizedDateTime,
} from "@/lib/i18n/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, "http://oneplusoneclub.local");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function formatDateTime(value: string | null | undefined, locale: Locale = "en") {
  return formatLocalizedDateTime(value, locale);
}

export function formatCurrency(amountCents: number, currency = "eur", locale: Locale = "en") {
  return formatLocalizedCurrency(amountCents, currency, locale);
}

export function initials(name: string | null | undefined) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return "1+";
  return cleanName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function storyValue(
  profileJson: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = profileJson?.[key];
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : "";
}
