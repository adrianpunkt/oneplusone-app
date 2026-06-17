"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Share2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const INVITE_BASE_URL = "https://oneplusoneclub.com/invite";
const ACTION_BUTTON_CLASSNAME = "h-11 w-full min-w-0 px-0 text-base";
const ACTION_ICON_CLASSNAME = "h-5 w-5 shrink-0";

type CopyTarget = "code" | "url";

type ReferralCodeActionsProps = {
  code: string | null;
  copy: ReferralCopy;
};

type ReferralCopy = {
  close: string;
  codeCopied: string;
  copied: string;
  copy: string;
  couldNotCopy: string;
  inviteLink: string;
  linkCopied: string;
  opening: string;
  referralCode: string;
  share: string;
  shareChannels: string;
  shareDescription: string;
  shareReferral: string;
  shareTextPrefix: string;
  shareTextSuffix: string;
  shareTitle: string;
  shareVia: string;
  shareViaButton: string;
};

export function ReferralCodeActions({ code, copy }: ReferralCodeActionsProps) {
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [sharing, setSharing] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  if (!code) return null;

  const inviteUrl = `${INVITE_BASE_URL}/${encodeURIComponent(code)}`;
  const shareTitle = copy.shareTitle;
  const shareText = `${copy.shareTextPrefix}${code}${copy.shareTextSuffix}`;

  async function copyToClipboard(
    value: string,
    target: CopyTarget,
    successTitle: string,
  ) {
    try {
      await writeClipboardText(value);
      setCopiedTarget(target);
      showToast({ title: successTitle });

      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedTarget((current) => (current === target ? null : current));
      }, 1600);
    } catch {
      setCopiedTarget(null);
      showToast({
        title: copy.couldNotCopy,
        variant: "error",
      });
    }
  }

  async function shareInvite() {
    setSharing(true);

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl,
        });
      } else {
        openEmailShare();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      openEmailShare();
    } finally {
      setSharing(false);
    }
  }

  function openEmailShare() {
    const body = `${shareText}\n\n${inviteUrl}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:w-56 sm:shrink-0">
      <Button
        type="button"
        variant="secondary"
        className={ACTION_BUTTON_CLASSNAME}
        onClick={() => copyToClipboard(code, "code", copy.codeCopied)}
      >
        {copiedTarget === "code" ? (
          <Check className={ACTION_ICON_CLASSNAME} />
        ) : (
          <Copy className={ACTION_ICON_CLASSNAME} />
        )}
        {copiedTarget === "code" ? copy.copied : copy.copy}
      </Button>
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <Button
            type="button"
            variant="default"
            className={ACTION_BUTTON_CLASSNAME}
          >
            <Share2 className={ACTION_ICON_CLASSNAME} />
            {copy.share}
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-wine/35 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-wine/10 bg-white p-4 shadow-2xl sm:w-[calc(100vw-2rem)] sm:gap-5 sm:p-5">
            <div className="grid gap-2 pr-10">
              <Dialog.Title className="font-display text-xl font-extrabold text-wine">
                {copy.shareReferral}
              </Dialog.Title>
              <Dialog.Description className="text-sm leading-6 text-muted">
                {copy.shareDescription}
              </Dialog.Description>
            </div>

            <div className="grid gap-3">
              <InviteCopyRow
                copied={copiedTarget === "url"}
                compactValue
                copy={copy.copy}
                copiedLabel={copy.copied}
                label={copy.inviteLink}
                onCopy={() => copyToClipboard(inviteUrl, "url", copy.linkCopied)}
                value={inviteUrl}
              />
              <InviteCopyRow
                copied={copiedTarget === "code"}
                copy={copy.copy}
                copiedLabel={copy.copied}
                label={copy.referralCode}
                onCopy={() => copyToClipboard(code, "code", copy.codeCopied)}
                value={code}
              />
            </div>

            <div className="grid gap-3 rounded-lg border border-wine/10 bg-white p-2 sm:p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {copy.shareVia}
                </p>
                <Button
                  type="button"
                  className="shrink-0"
                  onClick={shareInvite}
                  disabled={sharing}
                  size="sm"
                >
                  <Share2 className="h-4 w-4" />
                  {sharing ? copy.opening : copy.shareViaButton}
                </Button>
              </div>
              <div className="grid gap-1">
                <p className="text-sm leading-5 text-muted">
                  {copy.shareChannels}
                </p>
              </div>
            </div>

            <Dialog.Close asChild>
              <Button
                aria-label={copy.close}
                className="absolute right-3 top-3 h-9 w-9 rounded-full p-0 text-muted hover:bg-blush hover:text-wine"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

async function writeClipboardText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Fall back for browsers or embedded webviews that block Clipboard API.
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error("Copy command failed.");
  }
}

function InviteCopyRow({
  compactValue = false,
  copy,
  copied,
  copiedLabel,
  label,
  onCopy,
  value,
}: {
  compactValue?: boolean;
  copy: string;
  copied: boolean;
  copiedLabel: string;
  label: string;
  onCopy: () => void;
  value: string;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-wine/10 bg-white p-2 sm:p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCopy}
          className="shrink-0"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? copiedLabel : copy}
        </Button>
      </div>
      <p
        className={`rounded-md bg-blush py-2 font-mono font-semibold text-wine ${
          compactValue
            ? "overflow-x-auto whitespace-nowrap px-2 text-xs leading-5 sm:break-all sm:px-3 sm:text-sm sm:leading-6"
            : "break-all px-3 text-sm leading-6"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
