import { cn } from "@/lib/utils";

const placementClasses = {
  "bottom-left": "left-0 top-full mt-2 before:-top-1 before:left-4",
  "bottom-right": "right-0 top-full mt-2 before:-top-1 before:right-4",
  "bottom-center":
    "left-1/2 top-full mt-2 -translate-x-1/2 before:-top-1 before:left-1/2 before:-translate-x-1/2",
  "top-left": "bottom-full left-0 mb-2 before:-bottom-1 before:left-4",
  "top-right": "bottom-full left-0 mb-2 before:-bottom-1 before:left-4",
  "top-center":
    "bottom-full left-1/2 mb-2 -translate-x-1/2 before:-bottom-1 before:left-1/2 before:-translate-x-1/2",
} as const;

export type HoverTooltipPlacement = keyof typeof placementClasses;

export function HoverTooltip({
  children,
  className,
  placement = "top-center",
}: {
  children: React.ReactNode;
  className?: string;
  placement?: HoverTooltipPlacement;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-lipstick/20 bg-lipstick px-2.5 py-1.5 text-xs font-semibold leading-none text-white opacity-0 shadow-lg shadow-lipstick/20 ring-1 ring-white/20 translate-y-1 transition-[opacity,transform] duration-150 before:absolute before:h-2 before:w-2 before:rotate-45 before:bg-lipstick before:content-[''] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100",
        placementClasses[placement],
        className,
      )}
    >
      {children}
    </span>
  );
}
