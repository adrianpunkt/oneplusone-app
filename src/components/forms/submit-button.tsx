"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingLabel = "Saving...",
  ...props
}: ButtonProps & { pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
