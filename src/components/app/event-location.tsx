import { MapPin } from "lucide-react";

import { HoverTooltip } from "@/components/ui/hover-tooltip";
import type { EventRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const placeholderVenueNames = new Set([
  "por confirmar",
  "se anunciará pronto",
  "se comparte después de confirmar",
  "shared after confirmation",
  "tbd",
  "to be announced",
  "to be determined",
]);

type EventLocationRecord = Pick<
  EventRecord,
  "city" | "confirmation_released_at" | "timezone" | "venue_address" | "venue_name"
>;

export function EventLocation({
  className,
  event,
  pendingTooltip,
  showCountryFlag = false,
}: {
  className?: string;
  event: EventLocationRecord | null | undefined;
  pendingTooltip: string;
  showCountryFlag?: boolean;
}) {
  if (!event) return null;

  const detailsReleased = Boolean(event.confirmation_released_at);
  const venueName = detailsReleased ? cleanVenueName(event.venue_name) : "";
  const venueAddress = detailsReleased ? event.venue_address?.trim() || "" : "";
  const label = event.city?.trim() || venueName || venueAddress || pendingTooltip;
  const tooltip = [venueName, venueAddress].filter(Boolean).join(", ") || pendingTooltip;
  const countryFlag = showCountryFlag ? eventCountryFlag(event.timezone) : null;

  return (
    <span
      aria-label={tooltip}
      className={cn(
        "group relative inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-muted outline-none focus-visible:ring-2 focus-visible:ring-lipstick-red/40 focus-visible:ring-offset-2",
        className,
      )}
      tabIndex={0}
    >
      <MapPin className="h-4 w-4 text-lipstick-red" aria-hidden="true" />
      {countryFlag ? <span aria-hidden="true">{countryFlag}</span> : null}
      <span>{label}</span>
      <HoverTooltip placement="top-left">{tooltip}</HoverTooltip>
    </span>
  );
}

function eventCountryFlag(timezone: string) {
  if (["Europe/Madrid", "Atlantic/Canary"].includes(timezone)) return "🇪🇸";
  if (["Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira"].includes(timezone)) {
    return "🇵🇹";
  }
  return null;
}

function cleanVenueName(value: string | null) {
  const venueName = value?.trim() || "";
  return placeholderVenueNames.has(venueName.toLowerCase()) ? "" : venueName;
}
