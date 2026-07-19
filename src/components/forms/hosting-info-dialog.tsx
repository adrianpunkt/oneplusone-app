"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export type HostingInfoCopy = Pick<
  Dictionary["preferences"],
  | "hostModalBody"
  | "hostModalTitle"
  | "imIn"
  | "learnMore"
  | "thinkAboutIt"
>;

export function HostingInfoDialog({
  copy,
  onAccept,
  onDecline,
}: {
  copy: HostingInfoCopy;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          className="h-10 gap-1.5 px-3 text-xs sm:h-7 sm:px-2.5 sm:text-[11px]"
          type="button"
          variant="secondary"
          size="sm"
        >
          <Info className="h-3.5 w-3.5" />
          {copy.learnMore}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-wine-burgundy/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-wine-burgundy/10 bg-white shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]">
          <div className="relative shrink-0 border-b border-wine-burgundy/10 px-4 py-4 sm:border-b-0 sm:px-5 sm:pb-4 sm:pt-5">
            <Dialog.Title className="pr-10 font-display text-xl font-extrabold leading-tight text-wine-burgundy sm:pr-8">
              {copy.hostModalTitle}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label={copy.thinkAboutIt}
                className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full text-muted transition hover:bg-blush-pink hover:text-wine-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-blue/35 sm:right-4 sm:top-4 sm:h-10 sm:w-10"
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="grid min-h-0 flex-auto content-start gap-3 overflow-y-auto overscroll-contain px-4 py-4 text-sm leading-6 text-muted sm:px-5 sm:pt-0">
            {copy.hostModalBody.map((paragraph) => (
              <span key={paragraph}>{paragraph}</span>
            ))}
          </Dialog.Description>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-wine-burgundy/10 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-5 sm:pb-5">
            <Dialog.Close asChild>
              <Button
                className="h-11 w-full sm:h-10 sm:w-auto"
                onClick={onDecline}
                type="button"
                variant="secondary"
              >
                {copy.thinkAboutIt}
              </Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button
                className="h-11 w-full sm:h-10 sm:w-auto"
                onClick={onAccept}
                type="button"
              >
                {copy.imIn}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
