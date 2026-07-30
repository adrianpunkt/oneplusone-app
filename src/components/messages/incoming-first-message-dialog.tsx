"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MessageCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type IncomingFirstMessageCopy = {
  action: string;
  body: string[];
  title: string;
};

export function IncomingFirstMessageDialog({
  copy,
}: {
  copy: IncomingFirstMessageCopy;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Dialog.Root
      onOpenChange={setOpen}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-wine-burgundy/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[71] grid max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border border-wine-burgundy/10 bg-white p-5 shadow-2xl outline-none sm:p-6"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="grid gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-lipstick-red/10 text-lipstick-red">
              <MessageCircle aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="grid gap-2">
              <Dialog.Title className="font-display text-2xl font-extrabold leading-tight text-wine-burgundy">
                {copy.title}
              </Dialog.Title>
              <Dialog.Description className="grid gap-3 text-sm leading-6 text-muted">
                {copy.body.map((paragraph) => (
                  <span key={paragraph}>{paragraph}</span>
                ))}
              </Dialog.Description>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => setOpen(false)}
            type="button"
          >
            {copy.action}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
