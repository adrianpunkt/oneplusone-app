"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { setLocaleAction } from "@/lib/actions/locale";
import { locales, type Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

const languageLabels: Record<Locale, string> = {
  en: "EN",
  es: "ES",
};

export function LanguageSwitcher({
  activeClassName,
  ariaLabel,
  buttonClassName,
  className,
  currentLocale,
  inactiveClassName,
}: {
  activeClassName?: string;
  ariaLabel: string;
  buttonClassName?: string;
  className?: string;
  currentLocale: Locale;
  inactiveClassName?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const returnTo = `${pathname}${queryString ? `?${queryString}` : ""}`;

  return (
    <form
      action={setLocaleAction}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-lg border border-wine/10 bg-white p-0.5 shadow-sm",
        className,
      )}
    >
      <input name="return_to" type="hidden" value={returnTo} />
      {locales.map((locale) => {
        const active = locale === currentLocale;

        return (
          <button
            aria-pressed={active}
            className={cn(
              "h-8 min-w-9 rounded-md px-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean/35",
              active
                ? "bg-lipstick text-white"
                : "text-wine hover:bg-blush hover:text-lipstick",
              active ? activeClassName : inactiveClassName,
              buttonClassName,
            )}
            disabled={active}
            key={locale}
            name="locale"
            type="submit"
            value={locale}
          >
            {languageLabels[locale]}
          </button>
        );
      })}
    </form>
  );
}
