import { cookies, headers } from "next/headers";

import {
  defaultLocale,
  localeCookieName,
  normalizeLocale,
  type Locale,
} from "@/lib/i18n/locales";

export async function getRequestLocaleFallback(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  if (cookieLocale) return normalizeLocale(cookieLocale);

  const requestHeaders = await headers();
  return localeFromAcceptLanguage(requestHeaders.get("accept-language"));
}

export function localeFromAcceptLanguage(value: string | null | undefined): Locale {
  if (!value) return defaultLocale;

  const preferredLanguages = value
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean);

  for (const language of preferredLanguages) {
    const locale = normalizeLocale(language);
    if (locale !== defaultLocale || /^en([-_]|$)/i.test(language)) return locale;
  }

  return defaultLocale;
}
