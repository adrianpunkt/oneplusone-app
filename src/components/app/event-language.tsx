import { HoverTooltip } from "@/components/ui/hover-tooltip";
import { languageFlag, languageName, type Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

export function EventLanguage({
  className,
  languageCode,
  locale,
  tooltip,
}: {
  className?: string;
  languageCode: Locale;
  locale: Locale;
  tooltip: string;
}) {
  return (
    <span
      aria-label={tooltip}
      className={cn(
        "group relative inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-muted outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/40 focus-visible:ring-offset-2",
        className,
      )}
      tabIndex={0}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {languageFlag(languageCode)}
      </span>
      <span>{languageName(languageCode, locale)}</span>
      <HoverTooltip placement="top-left">{tooltip}</HoverTooltip>
    </span>
  );
}
