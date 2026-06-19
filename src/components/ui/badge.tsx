import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "border-lipstick-red/20 bg-lipstick-red/10 text-lipstick-red",
        "wine-burgundy": "border-wine-burgundy/20 bg-wine-burgundy/8 text-wine-burgundy",
        "ocean-blue": "border-ocean-blue/20 bg-ocean-blue/10 text-ocean-blue",
        muted: "border-wine-burgundy/10 bg-cement-gray text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />;
}
