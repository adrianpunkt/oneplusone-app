"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MessageCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function FirstMessageInfoDialog({
  actionLabel,
  description,
  title,
}: {
  actionLabel: string;
  description: string[];
  title: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-wine-burgundy/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border border-wine-burgundy/10 bg-white p-5 shadow-2xl outline-none">
          <div className="grid gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-lipstick-red/10 text-lipstick-red">
              <MessageCircle aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="grid gap-2">
              <Dialog.Title className="font-display text-2xl font-extrabold leading-tight text-wine-burgundy">
                {title}
              </Dialog.Title>
              <Dialog.Description className="grid gap-3 text-sm leading-6 text-muted">
                {description.map((paragraph) => (
                  <span key={paragraph}>{paragraph}</span>
                ))}
              </Dialog.Description>
            </div>
          </div>
          <Dialog.Close asChild>
            <Button className="w-full" type="button">
              {actionLabel}
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
