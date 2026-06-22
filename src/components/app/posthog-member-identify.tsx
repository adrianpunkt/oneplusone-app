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
  member: Pick<Member, "id" | "membership_status">;
};

export function PostHogMemberIdentify({ locale, member }: PostHogMemberIdentifyProps) {
  const identifiedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const identifiedKey = `${member.id}:${member.membership_status}:${locale}`;
    if (identifiedKeyRef.current === identifiedKey) return;

    let cancelled = false;

    void loadPostHog().then((posthog) => {
      if (cancelled || !posthog) return;

      const persistedMemberId = getPostHogPersistedUserId();
      if (persistedMemberId && persistedMemberId !== member.id) {
        resetPostHogIdentity();
      }

      const properties = {
        locale,
        member_app_authenticated: true,
        member_id: member.id,
        membership_status: member.membership_status,
      };

      posthog.identify(member.id, {
        ...properties,
      });
      posthog.register({
        ...properties,
      });

      identifiedKeyRef.current = identifiedKey;
    });

    return () => {
      cancelled = true;
    };
  }, [locale, member.id, member.membership_status]);

  return null;
}
