import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function intlLocale(locale: Locale) {
  return locale === "es" ? "es-ES" : "en";
}

export function formatDateTime(value: string | null | undefined, locale: Locale = "en") {
  if (!value) return locale === "es" ? "Por confirmar" : "TBC";

  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined, locale: Locale = "en") {
  if (!value) return locale === "es" ? "Por confirmar" : "TBC";

  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatCurrency(amountCents: number, currency = "eur", locale: Locale = "en") {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

export function creditNoun(count: number, dictionary: Dictionary, uppercase = false) {
  const value = Math.abs(count) === 1 ? dictionary.common.credit : dictionary.common.credits;
  return uppercase ? value.toUpperCase() : value;
}
