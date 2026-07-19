import { resolveAppOrigin } from "@/lib/app-origin";
import { getRuntimeEnv } from "@/lib/env";
import { normalizeLocale, type Locale } from "@/lib/i18n/locales";
import { sendLoopsTransactionalEmail } from "@/lib/loops";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { storyValue } from "@/lib/utils";

const immediateEventEmailTypes = [
  "seat_confirmed",
  "waitlist_balance",
  "waitlist_capacity",
  "cancellation_received",
] as const;

type ImmediateEventEmailType = (typeof immediateEventEmailTypes)[number];

type DeliveryRow = {
  email_type: ImmediateEventEmailType;
  event_id: string;
  id: string;
  locale: string;
  member_id: string;
  status: "draft" | "sending" | "sent" | "failed" | "cancelled";
};

type DeliveryClaim = {
  deliveryId?: string;
  emailType?: string;
  idempotencyKey?: string;
  locale?: string;
  payload?: Record<string, unknown>;
  recipientEmail?: string;
};

export async function deliverMemberEventEmailFromResult(result: unknown) {
  const deliveryId = objectString(result, "deliveryId");
  if (!deliveryId) return { ok: true, skipped: true } as const;
  try {
    return await deliverMemberEventEmail(deliveryId);
  } catch (error) {
    return {
      error: safeError(error instanceof Error ? error.message : "Event email delivery failed."),
      ok: false,
    } as const;
  }
}

export async function deliverMemberEventEmail(deliveryId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("event_email_deliveries")
    .select("id,event_id,member_id,email_type,locale,status")
    .eq("id", deliveryId)
    .maybeSingle<DeliveryRow>();

  if (error || !data) {
    return { error: safeError(error?.message || "Event email delivery was not found."), ok: false } as const;
  }
  if (!isImmediateEventEmailType(data.email_type)) {
    return { error: "This event email is not sent by a member action.", ok: false } as const;
  }
  if (data.status === "sent" || data.status === "cancelled") {
    return { ok: true, skipped: true } as const;
  }

  const locale = normalizeLocale(data.locale);
  const template = eventTemplate(data.email_type, locale);
  const resolvedTemplateId = template.transactionalId || `unconfigured:${template.envName}`;
  const { data: claimData, error: claimError } = await supabase.rpc(
    "claim_event_email_delivery",
    {
      p_action_id: null,
      p_delivery_id: data.id,
      p_template_id: resolvedTemplateId,
    },
  );
  if (claimError || !claimData || typeof claimData !== "object" || Array.isArray(claimData)) {
    return { error: safeError(claimError?.message || "Could not claim event email delivery."), ok: false } as const;
  }

  const claim = claimData as DeliveryClaim;
  let succeeded = false;
  let providerMessageId: string | null = null;
  let deliveryError: string | null = null;

  try {
    if (!template.transactionalId) throw new Error(`Missing ${template.envName}.`);
    const recipientEmail = claim.recipientEmail?.trim();
    if (!recipientEmail) throw new Error("Event email recipient is missing.");
    const sendResult = await sendLoopsTransactionalEmail({
      addToAudience: false,
      dataVariables: await eventEmailVariables(data, locale, claim.payload || {}),
      email: recipientEmail,
      idempotencyKey: objectString(claimData, "idempotencyKey") || `event-email:${data.id}`,
      transactionalId: template.transactionalId,
    });
    succeeded = true;
    providerMessageId = typeof sendResult.id === "string" ? sendResult.id : null;
  } catch (sendError) {
    deliveryError = safeError(sendError instanceof Error ? sendError.message : "Event email delivery failed.");
  }

  const { error: resultError } = await supabase.rpc("record_event_email_delivery_result", {
    p_action_id: null,
    p_delivery_id: data.id,
    p_error: deliveryError,
    p_provider_message_id: providerMessageId,
    p_succeeded: succeeded,
  });
  if (resultError) {
    return { error: safeError(resultError.message), ok: false } as const;
  }

  return succeeded
    ? { ok: true } as const
    : { error: deliveryError || "Event email delivery failed.", ok: false } as const;
}

async function eventEmailVariables(
  delivery: DeliveryRow,
  locale: Locale,
  payload: Record<string, unknown>,
) {
  const supabase = getSupabaseServiceClient();
  const { data: member } = await supabase
    .from("members")
    .select("email_norm")
    .eq("id", delivery.member_id)
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

  const startsAt = objectString(payload, "startsAt");
  const timezone = objectString(payload, "timezone") || "UTC";
  const eventUrl = `${resolveAppOrigin()}/events/${encodeURIComponent(delivery.event_id)}`;

  return {
    ...primitiveVariables(payload),
    city: objectString(payload, "city"),
    ctaUrl: eventUrl,
    eventDate: formatEventPart(startsAt, timezone, locale, "date"),
    eventFormat: objectString(payload, "eventFormat"),
    eventLanguage: objectString(payload, "languageCode"),
    eventTime: formatEventPart(startsAt, timezone, locale, "time"),
    eventTitle: objectString(payload, "title"),
    eventUrl,
    firstName: storyValue(profile?.profile_json, "profile.first_name")
      || (locale === "es" ? "amistad" : "friend"),
    timezone,
  };
}

function eventTemplate(emailType: ImmediateEventEmailType, locale: Locale) {
  const envName = `LOOPS_TRANSACTIONAL_${emailType.toUpperCase()}_${locale.toUpperCase()}`;
  return { envName, transactionalId: getRuntimeEnv(envName) };
}

function isImmediateEventEmailType(value: string): value is ImmediateEventEmailType {
  return (immediateEventEmailTypes as readonly string[]).includes(value);
}

function primitiveVariables(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).flatMap(([key, value]) => {
    if (typeof value === "string" || typeof value === "number") return [[key, value]];
    if (typeof value === "boolean") return [[key, value ? "true" : "false"]];
    return [];
  }));
}

function formatEventPart(
  value: string,
  timezone: string,
  locale: Locale,
  part: "date" | "time",
) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    dateStyle: part === "date" ? "long" : undefined,
    timeStyle: part === "time" ? "short" : undefined,
    timeZone: timezone,
  }).format(date);
}

function objectString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : "";
}

function safeError(value: string) {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\b(token|secret|signature|session)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 2000);
}
