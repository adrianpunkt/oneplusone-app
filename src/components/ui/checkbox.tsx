"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type"
> & {
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onCheckedChange?: (checked: boolean) => void;
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onChange, onCheckedChange, ...props }, ref) => (
    <span className="relative grid h-5 w-5 shrink-0 place-items-center">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded border border-wine-burgundy/20 bg-white shadow-sm outline-none checked:border-lipstick-red checked:bg-lipstick-red focus-visible:ring-2 focus-visible:ring-lipstick-red/25 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onChange={(event) => {
          onChange?.(event);
          onCheckedChange?.(event.currentTarget.checked);
        }}
        {...props}
      />
      <Check
        aria-hidden="true"
        className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100"
      />
    </span>
  ),
);

Checkbox.displayName = "Checkbox";
