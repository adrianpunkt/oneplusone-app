"use client";

import { useEffect, useRef, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";

export function AutoSubmitButton({
  autoSubmit,
  delayMs = 0,
  ...props
}: ComponentProps<typeof Button> & { autoSubmit: boolean; delayMs?: number }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!autoSubmit || submittedRef.current) return;

    const submit = () => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      buttonRef.current?.form?.requestSubmit(buttonRef.current);
    };
    if (delayMs <= 0) {
      submit();
      return;
    }

    const timeoutId = window.setTimeout(submit, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [autoSubmit, delayMs]);

  return <Button ref={buttonRef} {...props} />;
}
