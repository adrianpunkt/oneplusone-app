import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventRoundType = "sharing_time" | "spicy_time";
export type EventRoundAccessStatus =
  | "expired"
  | "locked"
  | "open"
  | "unavailable";

export type EventRoundQuestionAccess = {
  city: string | null;
  closesAt: string;
  eventId: string;
  eventTitle: string;
  languageCode: "en" | "es";
  opensAt: string;
  question: string | null;
  roundType: EventRoundType;
  startsAt: string;
  status: Exclude<EventRoundAccessStatus, "unavailable">;
  timezone: string;
  venueName: string | null;
} | {
  status: "unavailable";
};

export async function getMyEventRoundQuestion(
  eventId: string,
  roundType: EventRoundType,
): Promise<EventRoundQuestionAccess> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_event_round_question", {
    p_event_id: eventId,
    p_round_type: roundType,
  });
  if (error) {
    throw new Error(`Unable to load the event round: ${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { status: "unavailable" };
  }

  const payload = data as Record<string, unknown>;
  const status = payload.status;
  if (status === "unavailable") return { status };
  if (status !== "locked" && status !== "open" && status !== "expired") {
    return { status: "unavailable" };
  }

  const languageCode = payload.languageCode === "es" ? "es" : "en";
  const resolvedRoundType = payload.roundType === "spicy_time"
    ? "spicy_time"
    : payload.roundType === "sharing_time"
      ? "sharing_time"
      : null;
  const eventIdValue = stringValue(payload.eventId);
  const eventTitle = stringValue(payload.eventTitle);
  const startsAt = stringValue(payload.startsAt);
  const timezone = stringValue(payload.timezone);
  const opensAt = stringValue(payload.opensAt);
  const closesAt = stringValue(payload.closesAt);
  const question = status === "open" ? stringValue(payload.question) : null;

  if (
    !resolvedRoundType
    || !eventIdValue
    || !eventTitle
    || !startsAt
    || !timezone
    || !opensAt
    || !closesAt
    || (status === "open" && !question)
  ) {
    return { status: "unavailable" };
  }

  return {
    city: nullableString(payload.city),
    closesAt,
    eventId: eventIdValue,
    eventTitle,
    languageCode,
    opensAt,
    question,
    roundType: resolvedRoundType,
    startsAt,
    status,
    timezone,
    venueName: nullableString(payload.venueName),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const resolved = stringValue(value);
  return resolved || null;
}
