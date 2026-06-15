"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const INVITE_BASE_URL = "https://oneplusoneclub.com/invite";
const ACTION_BUTTON_CLASSNAME = "h-11 w-full min-w-0 px-0 text-base";
const ACTION_ICON_CLASSNAME = "h-5 w-5 shrink-0";

type ReferralCodeActionsProps = {
  code: string | null;
};

export function ReferralCodeActions({ code }: ReferralCodeActionsProps) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (!code) return null;

  const inviteUrl = `${INVITE_BASE_URL}/${encodeURIComponent(code)}`;
  const shareTitle = "Join one plus one club";
  const shareText =
    "Join one plus one club with my invite code and you'll get 1 additional credit for free.";

  async function copyCode() {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
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
        onClick={copyCode}
      >
        {copied ? (
          <Check className={ACTION_ICON_CLASSNAME} />
        ) : (
          <Copy className={ACTION_ICON_CLASSNAME} />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button
        type="button"
        variant="default"
        className={ACTION_BUTTON_CLASSNAME}
        onClick={shareInvite}
        disabled={sharing}
      >
        <Share2 className={ACTION_ICON_CLASSNAME} />
        {sharing ? "Sharing..." : "Share"}
      </Button>
    </div>
  );
}
