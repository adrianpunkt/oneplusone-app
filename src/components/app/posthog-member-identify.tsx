"use client";

import { useEffect, useRef } from "react";

import {
  getPostHogPersistedUserId,
  loadPostHog,
  resetPostHogIdentity,
} from "@/lib/posthog/client";
import type { Locale } from "@/lib/i18n/locales";
import type { Member } from "@/lib/types";

type PostHogMemberIdentifyProps = {
  locale: Locale;
  member: Pick<Member, "email" | "id" | "membership_status">;
};

function normalizeEmailProperty(value: string | null) {
  const email = String(value || "").trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function PostHogMemberIdentify({ locale, member }: PostHogMemberIdentifyProps) {
  const identifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const email = normalizeEmailProperty(member.email);
    const identifiedKey = `${member.id}:${member.membership_status}:${locale}:${email}`;
    if (identifiedKeyRef.current === identifiedKey) return;

    let cancelled = false;

    void loadPostHog().then((posthog) => {
      if (cancelled || !posthog) return;

      const persistedMemberId = getPostHogPersistedUserId();
      if (persistedMemberId && persistedMemberId !== member.id) {
        resetPostHogIdentity();
      }

      const identifyProperties = {
        ...(email ? { email } : {}),
        locale,
        member_app_authenticated: true,
        member_id: member.id,
        membership_status: member.membership_status,
      };

      posthog.identify(member.id, identifyProperties);
      posthog.register({
        locale,
        member_app_authenticated: true,
        member_id: member.id,
        membership_status: member.membership_status,
      });

      identifiedKeyRef.current = identifiedKey;
    });

    return () => {
      cancelled = true;
    };
  }, [locale, member.email, member.id, member.membership_status]);

  return null;
}
