"use client";

import { useEffect, useRef, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";

export function AutoSubmitButton({
  autoSubmit,
  ...props
}: ComponentProps<typeof Button> & { autoSubmit: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!autoSubmit || submittedRef.current) return;

    submittedRef.current = true;
    buttonRef.current?.form?.requestSubmit(buttonRef.current);
  }, [autoSubmit]);

  return <Button ref={buttonRef} {...props} />;
}
