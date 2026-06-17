import { HoverTooltip, type HoverTooltipPlacement } from "@/components/ui/hover-tooltip";
import { cn } from "@/lib/utils";

export function messageNotificationTooltip(count: number) {
  return `You have ${count} new ${count === 1 ? "message" : "messages"}`;
}

export function MessageHeartIcon({
  className,
  count,
  iconClassName,
  tooltip,
  tooltipPlacement = "top-right",
}: {
  className?: string;
  count: number;
  iconClassName?: string;
  tooltip?: string;
  tooltipPlacement?: HoverTooltipPlacement;
}) {
  const countLabel = count > 9 ? "9+" : String(count);
  const hasUnread = count > 0;

  return (
    <span
      aria-hidden="true"
      className={cn("group relative grid shrink-0 place-items-center", className)}
    >
      <svg
        aria-hidden="true"
        className={cn("drop-shadow-sm", iconClassName)}
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
          fill={hasUnread ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={hasUnread ? 0 : 1.9}
        />
        {hasUnread ? (
          <text
            fill="white"
            fontSize="8"
            fontWeight="900"
            textAnchor="middle"
            x="12"
            y="13.4"
          >
            {countLabel}
          </text>
        ) : null}
      </svg>
      {tooltip ? <HoverTooltip placement={tooltipPlacement}>{tooltip}</HoverTooltip> : null}
    </span>
  );
}
