import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "TBC";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatCurrency(amountCents: number, currency = "eur") {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
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
