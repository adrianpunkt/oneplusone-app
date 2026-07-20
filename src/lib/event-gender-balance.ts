import type { Locale } from "@/lib/i18n/locales";

const heterosexualEventCopy = {
  en: "Balanced genders. We aim for a 50/50 split of men and women, and we may have to cancel the event if last-minute dropouts create an imbalance.",
  es: "Equilibrio de género. Buscamos una proporción 50/50 de hombres y mujeres, y es posible que tengamos que cancelar el evento si las bajas de última hora crean un desequilibrio.",
} as const;

export function getEventGenderBalanceMessage(
  genderBalanceEnabled: boolean,
  locale: Locale,
) {
  return genderBalanceEnabled ? heterosexualEventCopy[locale] : null;
}
