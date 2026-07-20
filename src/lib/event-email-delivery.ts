import { resolveAppOrigin } from "@/lib/app-origin";
import { getRuntimeEnv } from "@/lib/env";
import {
  eventCancellationOutcomeLabel,
  eventCancellationReasonLabel,
} from "@/lib/event-cancellation";
import {
  isLocale,
  languageName,
  normalizeLocale,
  type Locale,
} from "@/lib/i18n/locales";
import { profileOptionLabel } from "@/lib/i18n/dictionaries";
import { localizeText } from "@/lib/i18n/dynamic";
import { sendLoopsTransactionalEmail } from "@/lib/loops";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import type { JsonObject } from "@/lib/types";
import { storyValue } from "@/lib/utils";

const immediateEventEmailTypes = [
  "invitation_pending",
  "seat_confirmed",
  "waitlist_balance",
  "waitlist_balance_released",
  "waitlist_capacity",
  "cancellation_received",
  "reservation_cancellation_received",
] as const;

type ImmediateEventEmailType = (typeof immediateEventEmailTypes)[number];

const eventTransactionalIds: Record<
  `${ImmediateEventEmailType}:${Locale}`,
  string
> = {
  "cancellation_received:en": "cmrs2pmd501ww0jz12tb2byqh",
  "cancellation_received:es": "cmrs2pmmb039k0j1ha54q8fu3",
  "reservation_cancellation_received:en": "cmrt70cwq02ep0iv7zaew1zck",
  "reservation_cancellation_received:es": "cmrt70d5e024o0ix1q3kdiinz",
  "invitation_pending:en": "cmrs2pkig01i10jyuqc4rwood",
  "invitation_pending:es": "cmrs2pkpv01je0j11ge5w0ych",
  "seat_confirmed:en": "cmrs2pkxk33nf0j123zfdk4rd",
  "seat_confirmed:es": "cmrs2pl5r009p0jz2srdsx0fv",
  "waitlist_balance:en": "cmrs2plen009l0j1fxd63afhx",
  "waitlist_balance:es": "cmrs2plmf01w60j18dsqofpjn",
  "waitlist_balance_released:en": "cmrt6gzhp012l0jvpll9x9uyx",
  "waitlist_balance_released:es": "cmrt6gzhp00z50jv3u36lucnb",
  "waitlist_capacity:en": "cmrs2plv31dbp0j1j06lmxwke",
  "waitlist_capacity:es": "cmrs2pm5h04zt0j194o7ufh27",
};

type DeliveryRow = {
  email_type: ImmediateEventEmailType;
  event_id: string;
  id: string;
  locale: string;
  member_id: string;
  status: "draft" | "sending" | "sent" | "failed" | "cancelled";
};

type DeliveryClaim = {
  attempts?: number;
  deliveryId?: string;
  emailType?: string;
  idempotencyKey?: string;
  invitationAccessToken?: string;
  locale?: string;
  payload?: Record<string, unknown>;
  recipientEmail?: string;
};

export async function deliverMemberEventEmailFromResult(result: unknown) {
  const deliveryIds = new Set<string>();
  const deliveryId = objectString(result, "deliveryId");
  if (deliveryId) deliveryIds.add(deliveryId);

  const eventId = objectString(result, "eventId");
  const invitationId = objectString(result, "invitationId");
  if (eventId && invitationId) {
    const { data: pairedDeliveries } = await getSupabaseServiceClient()
      .from("event_email_deliveries")
      .select("id")
      .eq("event_id", eventId)
      .eq("status", "draft")
      .contains("payload", { pairedByInvitationId: invitationId });

    for (const delivery of pairedDeliveries || []) {
      if (typeof delivery.id === "string") deliveryIds.add(delivery.id);
    }
  }

  if (!deliveryIds.size) return { ok: true, skipped: true } as const;
  try {
    const deliveries = await Promise.all(
      [...deliveryIds].map((candidateId) => deliverMemberEventEmail(candidateId)),
    );
    const failed = deliveries.find((delivery) => !delivery.ok);
    return failed || { ok: true } as const;
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

  if (data.email_type === "invitation_pending") {
    const { data: memberPreference, error: preferenceError } = await supabase
      .from("member_event_preferences")
      .select("receives_event_invitations")
      .eq("member_id", data.member_id)
      .maybeSingle<{ receives_event_invitations: boolean }>();

    if (preferenceError) {
      return { error: safeError(preferenceError.message), ok: false } as const;
    }
    if (memberPreference?.receives_event_invitations === false) {
      const now = new Date().toISOString();
      const { error: cancelError } = await supabase
        .from("event_email_deliveries")
        .update({
          cancelled_at: now,
          failed_at: null,
          last_error: null,
          status: "cancelled",
          updated_at: now,
        })
        .eq("id", data.id)
        .in("status", ["draft", "failed"]);

      return cancelError
        ? { error: safeError(cancelError.message), ok: false } as const
        : { ok: true, skipped: true } as const;
    }
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
    const durableIdempotencyKey = objectString(claimData, "idempotencyKey")
      || `event-email:${data.id}`;
    const providerIdempotencyKey = data.email_type === "invitation_pending"
      ? `${durableIdempotencyKey}:attempt:${Math.max(1, Number(claim.attempts || 1))}`
      : durableIdempotencyKey;
    const sendResult = await sendLoopsTransactionalEmail({
      addToAudience: false,
      dataVariables: await eventEmailVariables(
        data,
        locale,
        claim.payload || {},
        claim,
      ),
      email: recipientEmail,
      idempotencyKey: providerIdempotencyKey,
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
  claim: DeliveryClaim,
) {
  const supabase = getSupabaseServiceClient();
  const [{ data: member }, { data: summary }, { data: event }] = await Promise.all([
    supabase
      .from("members")
      .select("email_norm")
      .eq("id", delivery.member_id)
      .maybeSingle<{ email_norm: string | null }>(),
    supabase
      .from("event_summary_snapshots")
      .select("age_min,age_max,majority_intention")
      .eq("event_id", delivery.event_id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        age_max: number | null;
        age_min: number | null;
        majority_intention: string | null;
      }>(),
    supabase
      .from("events")
      .select("localized_content")
      .eq("id", delivery.event_id)
      .maybeSingle<{ localized_content: JsonObject | null }>(),
  ]);
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
  const rsvpDeadlineAt = objectString(payload, "rsvpDeadlineAt");
  const origin = resolveAppOrigin();
  const memberEventUrl = `${origin}/events/${encodeURIComponent(delivery.event_id)}`;
  const invitationAccessToken = claim.invitationAccessToken?.trim() || "";
  const invitationUrl = invitationAccessToken
    ? pendingInvitationUrl(origin, invitationAccessToken)
    : "";
  const unsubscribeUrl = invitationAccessToken
    ? pendingInvitationUnsubscribeUrl(origin, invitationAccessToken, locale)
    : "";
  const eventUrl = delivery.email_type === "invitation_pending"
    ? invitationUrl
    : memberEventUrl;
  const eventFormat = objectString(payload, "eventFormat");
  const majorityIntention = summary?.majority_intention
    || objectString(payload, "majorityIntention");

  if (delivery.email_type === "invitation_pending" && !invitationUrl) {
    throw new Error("Pending invitation access token is missing.");
  }

  return {
    ...primitiveVariables(payload),
    ageRange: summary?.age_min != null && summary.age_max != null
      ? `${summary.age_min}–${summary.age_max}`
      : locale === "es" ? "edades variadas" : "a range of ages",
    cancellationOutcome: eventCancellationOutcomeLabel(
      objectString(payload, "creditOutcome"),
      locale,
    ),
    cancellationReason: eventCancellationReasonLabel(
      objectString(payload, "cancellationReason"),
      locale,
    ),
    city: objectString(payload, "city"),
    ctaUrl: eventUrl,
    eventDate: formatEventPart(startsAt, timezone, locale, "date"),
    eventFormat: formatEventFormat(eventFormat, locale),
    eventIntro: formatEventInvitationIntro(eventFormat, startsAt, timezone, locale),
    eventLanguage: formatEventLanguage(objectString(payload, "languageCode"), locale),
    eventTime: formatEventPart(startsAt, timezone, locale, "time"),
    eventTitle: localizeText(
      objectString(payload, "title"),
      event?.localized_content,
      locale,
      "title",
    ),
    eventUrl,
    firstName: storyValue(profile?.profile_json, "profile.first_name")
      || (locale === "es" ? "amistad" : "friend"),
    holdMinutes: 10,
    invitationLink: invitationUrl,
    majorityIntention: majorityIntention
      ? profileOptionLabel(majorityIntention, locale)
      : locale === "es" ? "sin especificar" : "not specified",
    rsvpDeadline: rsvpDeadlineAt
      ? formatRsvpDeadline(rsvpDeadlineAt, timezone, locale)
      : objectString(payload, "rsvpDeadline"),
    timezone,
    unsubscribeUrl,
  };
}

function pendingInvitationUrl(origin: string, token: string) {
  const url = new URL("/event-invitation/access", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function pendingInvitationUnsubscribeUrl(
  origin: string,
  token: string,
  locale: Locale,
) {
  const url = new URL("/event-invitation/unsubscribe", origin);
  url.searchParams.set("token", token);
  url.searchParams.set("locale", locale);
  return url.toString();
}

function formatEventFormat(value: string, locale: Locale) {
  const labels: Record<string, Record<Locale, string>> = {
    brunch: { en: "brunch", es: "brunch" },
    dinner: { en: "dinner", es: "cena" },
    other: { en: "event", es: "encuentro" },
  };
  return labels[value]?.[locale] || value;
}

function formatEventInvitationIntro(
  eventFormat: string,
  startsAt: string,
  timezone: string,
  locale: Locale,
) {
  const eventDate = formatEventPart(startsAt, timezone, locale, "date");
  if (locale === "es") {
    const occasion = eventFormat === "dinner"
      ? "para cenar"
      : eventFormat === "brunch" ? "para un brunch" : "para un encuentro";
    return `este fin de semana ${occasion} el ${eventDate}`;
  }
  return `this weekend for ${formatEventFormat(eventFormat, locale)} on ${eventDate}`;
}

function eventTemplate(emailType: ImmediateEventEmailType, locale: Locale) {
  const envName = `LOOPS_TRANSACTIONAL_${emailType.toUpperCase()}_${locale.toUpperCase()}`;
  return {
    envName,
    transactionalId: getRuntimeEnv(envName)
      || eventTransactionalIds[`${emailType}:${locale}`],
  };
}

function isImmediateEventEmailType(value: string): value is ImmediateEventEmailType {
  return (immediateEventEmailTypes as readonly string[]).includes(value);
}

function primitiveVariables(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).flatMap(([key, value]) => {
    if (key === "refreshSourceAccessId") return [];
    if (typeof value === "string" || typeof value === "number") return [[key, value]];
    if (typeof value === "boolean") return [[key, value ? "true" : "false"]];
    return [];
  }));
}

function formatEventLanguage(value: string, displayLocale: Locale) {
  const languageCode = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(languageCode) ? languageName(languageCode, displayLocale) : value;
}

function formatEventPart(
  value: string,
  timezone: string,
  locale: Locale,
  part: "date" | "time",
) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  if (part === "date" && locale === "en") {
    return formatEnglishInvitationDate(date, timezone);
  }
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    dateStyle: part === "date" ? "long" : undefined,
    timeStyle: part === "time" ? "short" : undefined,
    timeZone: timezone,
  }).format(date);
}

function formatEnglishInvitationDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: timezone,
    weekday: "long",
  }).formatToParts(date);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const month = parts.find((part) => part.type === "month")?.value;
  const weekday = parts.find((part) => part.type === "weekday")?.value;

  if (!day || !month || !weekday) {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeZone: timezone,
    }).format(date);
  }

  return `${weekday}, the ${ordinalDay(day)} of ${month}`;
}

function formatRsvpDeadline(value: string, timezone: string, locale: Locale) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "long",
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value || "";

  const weekday = part("weekday");
  const day = part("day");
  const month = part("month");
  const year = part("year");
  const hour = part("hour");
  const minute = part("minute");

  if (!weekday || !day || !month || !year || !hour || !minute) {
    return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  }

  return locale === "es"
    ? `${weekday}, ${day} de ${month} de ${year} a las ${hour}:${minute}`
    : `${weekday}, ${day} ${month} ${year} at ${hour}:${minute}`;
}

function ordinalDay(day: number) {
  const lastTwoDigits = day % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${day}th`;

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
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
