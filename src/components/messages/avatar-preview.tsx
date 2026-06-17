"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { CorrespondentAvatar } from "@/components/messages/correspondent-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AvatarPreview({
  className,
  imageUrl,
  name,
}: {
  className?: string;
  imageUrl: string;
  name: string;
}) {
  const previewLabel = `Preview ${name}'s avatar`;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          aria-label={previewLabel}
          className={cn(
            "group block aspect-square shrink-0 cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lipstick/35 focus-visible:ring-offset-2",
            className,
          )}
          title={previewLabel}
          type="button"
        >
          <CorrespondentAvatar
            className="h-full w-full transition-transform duration-150 group-hover:scale-[1.02]"
            imageUrl={imageUrl}
            name={name}
          />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-wine/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 aspect-square w-[min(calc(100vw-2rem),32rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border-2 border-lipstick/70 bg-mist shadow-2xl">
          <Dialog.Title className="sr-only">
            {name} avatar preview
          </Dialog.Title>
          <CorrespondentAvatar
            className="h-full w-full rounded-none border-0 shadow-none"
            imageSize={512}
            imageSizes="min(calc(100vw - 2rem), 32rem)"
            imageUrl={imageUrl}
            initialsClassName="text-7xl sm:text-8xl"
            name={name}
          />
          <Dialog.Close asChild>
            <Button
              aria-label="Close preview"
              className="absolute right-3 top-3 h-9 w-9 rounded-full bg-white/95 p-0 text-wine shadow-sm hover:bg-white"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
