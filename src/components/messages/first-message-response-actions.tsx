"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Archive, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  SendMessageForm,
  type SendMessageCopy,
} from "@/components/forms/send-message-form";
import { Button } from "@/components/ui/button";
import { archiveUnansweredConversationAction } from "@/lib/actions/messages";

export type FirstMessageResponseCopy = {
  archiveAction: string;
  archiveBody: string;
  archiveCancel: string;
  archiveConfirm: string;
  archiveTitle: string;
  archiving: string;
  respond: string;
  sendMessage: SendMessageCopy;
};

export function FirstMessageResponseActions({
  conversationId,
  copy,
}: {
  conversationId: string;
  copy: FirstMessageResponseCopy;
}) {
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [responding, setResponding] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  function archiveConversation() {
    setStatus("");
    startTransition(async () => {
      const result =
        await archiveUnansweredConversationAction(conversationId);
      if (!result.ok) {
        setStatus(result.error || "");
        return;
      }

      setArchiveOpen(false);
      router.push("/messages");
      router.refresh();
    });
  }

  if (responding) {
    return (
      <SendMessageForm
        conversationId={conversationId}
        copy={copy.sendMessage}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 p-3 sm:flex sm:items-center sm:justify-start sm:py-2">
        <Button
          className="w-full sm:w-auto"
          onClick={() => setResponding(true)}
          type="button"
        >
          <MessageCircle aria-hidden="true" className="h-4 w-4" />
          {copy.respond}
        </Button>
        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            setStatus("");
            setArchiveOpen(true);
          }}
          type="button"
          variant="secondary"
        >
          <Archive aria-hidden="true" className="h-4 w-4" />
          {copy.archiveAction}
        </Button>
      </div>

      <Dialog.Root
        onOpenChange={(nextOpen) => {
          if (!nextOpen && pending) return;
          setArchiveOpen(nextOpen);
        }}
        open={archiveOpen}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-wine-burgundy/40 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[71] grid w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border border-wine-burgundy/10 bg-white p-5 shadow-2xl outline-none sm:p-6"
            onEscapeKeyDown={(event) => {
              if (pending) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (pending) event.preventDefault();
            }}
          >
            <div className="grid gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-ocean-blue/10 text-ocean-blue">
                <Archive aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="grid gap-2">
                <Dialog.Title className="font-display text-2xl font-extrabold leading-tight text-wine-burgundy">
                  {copy.archiveTitle}
                </Dialog.Title>
                <Dialog.Description className="text-sm leading-6 text-muted">
                  {copy.archiveBody}
                </Dialog.Description>
              </div>
            </div>

            <div className="grid gap-2">
              <Button
                disabled={pending}
                onClick={archiveConversation}
                type="button"
              >
                {pending ? copy.archiving : copy.archiveConfirm}
              </Button>
              <Dialog.Close asChild>
                <Button disabled={pending} type="button" variant="ghost">
                  {copy.archiveCancel}
                </Button>
              </Dialog.Close>
            </div>

            {status ? (
              <p
                aria-live="polite"
                className="text-sm font-semibold text-lipstick-red"
              >
                {status}
              </p>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
