import type { Locale } from "@/lib/i18n/locales";
import type { JsonObject } from "@/lib/types";

type LocalizedContent = JsonObject | null | undefined;

function localizedValue(
  localizedContent: LocalizedContent,
  locale: Locale,
  key: string,
): string {
  const root = localizedContent?.[locale];
  if (!root || typeof root !== "object" || Array.isArray(root)) return "";
  const value = (root as JsonObject)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function localizeText(
  fallback: string | null | undefined,
  localizedContent: LocalizedContent,
  locale: Locale,
  key: string,
) {
  return localizedValue(localizedContent, locale, key) || fallback || "";
}

export function localizeNotification<T extends {
  body: string | null;
  localized_content?: JsonObject | null;
  title: string;
}>(notification: T, locale: Locale): T {
  return {
    ...notification,
    body: localizeText(notification.body, notification.localized_content, locale, "body") || null,
    title: localizeText(notification.title, notification.localized_content, locale, "title") || notification.title,
  };
}

export function localizedJson(locale: Locale, values: Record<string, string>) {
  return {
    [locale]: values,
  };
}
