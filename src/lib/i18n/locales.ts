export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "opo_locale";

const localeSet = new Set<string>(locales);

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && localeSet.has(value));
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return defaultLocale;

  const cleanValue = value.toLowerCase().trim();
  if (isLocale(cleanValue)) return cleanValue;

  const language = cleanValue.split(/[-_]/)[0];
  return isLocale(language) ? language : defaultLocale;
}

export function languageName(locale: Locale, displayLocale = locale) {
  const names: Record<Locale, Record<Locale, string>> = {
    en: {
      en: "English",
      es: "Spanish",
    },
    es: {
      en: "inglés",
      es: "español",
    },
  };

  return names[displayLocale][locale];
}

export function htmlLang(locale: Locale) {
  return locale === "es" ? "es" : "en";
}
