import "server-only";

import {
  eventRoundEmailLoginNextPath,
  feedbackEmailLoginNextPath,
} from "@/lib/event-email-click";
import { normalizeLocale } from "@/lib/i18n/locales";
import { createMemberLoginLink } from "@/lib/member-login-email";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

type FeedbackDeliveryRow = {
  email_type: string;
  event_id: string;
  frozen_payload: Record<string, unknown> | null;
  locale: string;
  member_id: string;
  sent_at: string | null;
  status: string;
};

type FeedbackMemberRow = {
  email: string | null;
  membership_status: string | null;
  preferred_locale: string | null;
};

type FeedbackEmailLoginContext = {
  email: string;
  locale: ReturnType<typeof normalizeLocale>;
  next: string;
};

export async function createFeedbackEmailLoginRedirect({
  deliveryId,
  destination,
  origin,
}: {
  deliveryId: string;
  destination: URL;
  origin: string;
}) {
  return createEventEmailLoginRedirect({ deliveryId, destination, origin });
}

export async function createEventEmailLoginRedirect({
  deliveryId,
  destination,
  origin,
}: {
  deliveryId: string;
  destination: URL;
  origin: string;
}) {
  const context = await eventEmailLoginContext({ deliveryId, destination });
  if (!context) return null;

  const { loginUrl } = await createMemberLoginLink({
    autoSubmit: true,
    email: context.email,
    locale: context.locale,
    next: context.next,
    origin,
  });

  return loginUrl || null;
}

async function eventEmailLoginContext({
  deliveryId,
  destination,
}: {
  deliveryId: string;
  destination: URL;
}): Promise<FeedbackEmailLoginContext | null> {
  const supabase = getSupabaseServiceClient();
  const { data: delivery, error: deliveryError } = await supabase
    .from("event_email_deliveries")
    .select("event_id,member_id,email_type,locale,status,sent_at,frozen_payload:payload")
    .eq("id", deliveryId)
    .maybeSingle<FeedbackDeliveryRow>();

  if (deliveryError || !delivery) return null;

  const next = feedbackEmailLoginNextPath({ delivery, destination })
    || eventRoundEmailLoginNextPath({ delivery, destination });
  if (!next) return null;

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("email,membership_status,preferred_locale")
    .eq("id", delivery.member_id)
    .maybeSingle<FeedbackMemberRow>();

  if (
    memberError
    || member?.membership_status !== "active"
    || !member.email?.trim()
  ) {
    return null;
  }

  return {
    email: member.email,
    locale: normalizeLocale(delivery.locale || member.preferred_locale),
    next,
  };
}
