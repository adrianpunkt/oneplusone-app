import "server-only";

import { resolveAppOrigin } from "@/lib/app-origin";
import { getRuntimeEnv } from "@/lib/env";
import { normalizeLocale, type Locale } from "@/lib/i18n/locales";
import { sendLoopsTransactionalEmail } from "@/lib/loops";
import { createMemberLoginLink } from "@/lib/member-login-email";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { storyValue } from "@/lib/utils";

const DEFAULT_MESSAGE_TRANSACTIONAL_ID_EN = "cms6u1rqf0juz0jtg6yh72oqx";
const DEFAULT_MESSAGE_TRANSACTIONAL_ID_ES = "cms6u1s4c07450jzmtpsphbhy";

type MessageEmailDeliveryRow = {
  id: string;
  locale: string;
  recipient_member_id: string;
  status: "draft" | "sending" | "sent" | "failed";
};

type MessageEmailDeliveryClaim = {
  attempts?: number;
  conversationId?: string;
  deliveryId?: string;
  idempotencyKey?: string;
  locale?: string;
  messageId?: string;
  recipientEmail?: string;
  skipped?: boolean;
  status?: string;
  templateId?: string;
};

export async function deliverMessageEmailFromResult(result: unknown) {
  const deliveryId = objectString(result, "deliveryId");
  if (!deliveryId) return { ok: true, skipped: true } as const;

  try {
    return await deliverMessageEmail(deliveryId);
  } catch (error) {
    return {
      error: safeError(
        error instanceof Error ? error.message : "Message email delivery failed.",
      ),
      ok: false,
    } as const;
  }
}

export async function deliverMessageEmail(deliveryId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("message_email_deliveries")
    .select("id,recipient_member_id,locale,status")
    .eq("id", deliveryId)
    .maybeSingle<MessageEmailDeliveryRow>();

  if (error || !data) {
    return {
      error: safeError(error?.message || "Message email delivery was not found."),
      ok: false,
    } as const;
  }
  if (data.status === "sent") {
    return { ok: true, skipped: true } as const;
  }

  const locale = normalizeLocale(data.locale);
  const transactionalId = getMessageEmailTransactionalId(locale);
  const { data: claimData, error: claimError } = await supabase.rpc(
    "claim_message_email_delivery",
    {
      p_delivery_id: data.id,
      p_template_id: transactionalId,
    },
  );

  if (
    claimError ||
    !claimData ||
    typeof claimData !== "object" ||
    Array.isArray(claimData)
  ) {
    return {
      error: safeError(
        claimError?.message || "Could not claim message email delivery.",
      ),
      ok: false,
    } as const;
  }

  const claim = claimData as MessageEmailDeliveryClaim;
  if (claim.skipped || claim.status === "sent") {
    return { ok: true, skipped: true } as const;
  }

  let succeeded = false;
  let providerMessageId: string | null = null;
  let deliveryError: string | null = null;

  try {
    const recipientEmail = claim.recipientEmail?.trim();
    const conversationId = claim.conversationId?.trim();
    const messageId = claim.messageId?.trim();
    const idempotencyKey = claim.idempotencyKey?.trim();

    if (!recipientEmail) throw new Error("Message email recipient is missing.");
    if (!conversationId) throw new Error("Message email conversation is missing.");
    if (!messageId) throw new Error("Message email message ID is missing.");
    if (!idempotencyKey) throw new Error("Message email idempotency key is missing.");

    const firstName = await messageRecipientFirstName(
      data.recipient_member_id,
      locale,
    );
    const { loginUrl: ctaUrl } = await createMemberLoginLink({
      autoSubmit: true,
      email: recipientEmail,
      locale,
      next: `/messages/${conversationId}`,
      origin: resolveAppOrigin(),
    });
    const sendResult = await sendLoopsTransactionalEmail({
      addToAudience: false,
      dataVariables: {
        ctaUrl,
        firstName,
      },
      email: recipientEmail,
      idempotencyKey,
      transactionalId,
    });

    succeeded = true;
    providerMessageId =
      typeof sendResult.id === "string" ? sendResult.id : null;
  } catch (sendError) {
    deliveryError = safeError(
      sendError instanceof Error
        ? sendError.message
        : "Message email delivery failed.",
    );
  }

  const { error: resultError } = await supabase.rpc(
    "record_message_email_delivery_result",
    {
      p_delivery_id: data.id,
      p_error: deliveryError,
      p_provider_message_id: providerMessageId,
      p_succeeded: succeeded,
    },
  );

  if (resultError) {
    return { error: safeError(resultError.message), ok: false } as const;
  }

  return succeeded
    ? { ok: true } as const
    : {
        error: deliveryError || "Message email delivery failed.",
        ok: false,
      } as const;
}

export function getMessageEmailTransactionalId(locale: Locale) {
  if (locale === "es") {
    return (
      getRuntimeEnv("LOOPS_TRANSACTIONAL_MESSAGE_NOTIFICATION_ES") ||
      DEFAULT_MESSAGE_TRANSACTIONAL_ID_ES
    );
  }

  return (
    getRuntimeEnv("LOOPS_TRANSACTIONAL_MESSAGE_NOTIFICATION_EN") ||
    DEFAULT_MESSAGE_TRANSACTIONAL_ID_EN
  );
}

async function messageRecipientFirstName(memberId: string, locale: Locale) {
  const supabase = getSupabaseServiceClient();
  const { data: member } = await supabase
    .from("members")
    .select("email_norm")
    .eq("id", memberId)
    .maybeSingle<{ email_norm: string | null }>();

  const { data: profile } = member?.email_norm
    ? await supabase
        .from("profile_registrations")
        .select("profile_json")
        .eq("contact_email_norm", member.email_norm)
        .eq("status", "submitted")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ profile_json: Record<string, unknown> | null }>()
    : { data: null };

  return (
    storyValue(profile?.profile_json, "profile.first_name") ||
    (locale === "es" ? "amistad" : "friend")
  );
}

function objectString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : "";
}

function safeError(value: string) {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted-email]",
    )
    .replace(
      /\b(token|secret|signature|session)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .slice(0, 2000);
}
