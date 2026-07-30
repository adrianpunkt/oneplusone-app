const trackableLinkVariables = [
  "ctaUrl",
  "declineUrl",
  "eventUrl",
  "invitationLink",
  "sharingRoundUrl",
  "spicyRoundUrl",
] as const;

export const FEEDBACK_EMAIL_LOGIN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const EVENT_ROUND_ACCESS_DURATION_MS = 24 * 60 * 60 * 1000;

type FeedbackEmailAccessDelivery = {
  email_type: string;
  event_id: string;
  sent_at: string | null;
  status: string;
};

type EventRoundEmailAccessDelivery = FeedbackEmailAccessDelivery & {
  frozen_payload?: Record<string, unknown> | null;
};

export function trackEventEmailLinks({
  origin,
  token,
  variables,
}: {
  origin: string;
  token: string;
  variables: Record<string, string | number>;
}) {
  const appOrigin = new URL(origin).origin;
  const trackedVariables = { ...variables };

  for (const key of trackableLinkVariables) {
    const value = variables[key];
    if (typeof value !== "string") continue;

    let destination: URL;
    try {
      destination = new URL(value);
    } catch {
      continue;
    }
    if (destination.origin !== appOrigin || destination.pathname === "/email/click") continue;

    const trackedUrl = new URL("/email/click", appOrigin);
    trackedUrl.searchParams.set("token", token);
    trackedUrl.searchParams.set(
      "to",
      `${destination.pathname}${destination.search}${destination.hash}`,
    );
    trackedVariables[key] = trackedUrl.toString();
  }

  return trackedVariables;
}

export function eventEmailClickDestination(
  rawDestination: string,
  origin: string,
) {
  const fallback = new URL("/going-out", origin);
  if (!rawDestination.startsWith("/") || rawDestination.startsWith("//")) return fallback;

  try {
    const destination = new URL(rawDestination, origin);
    if (destination.origin !== new URL(origin).origin) return fallback;
    if (destination.pathname === "/email/click") return fallback;
    return destination;
  } catch {
    return fallback;
  }
}

export function feedbackEmailLoginNextPath({
  delivery,
  destination,
  now = Date.now(),
}: {
  delivery: FeedbackEmailAccessDelivery;
  destination: URL;
  now?: number;
}) {
  if (delivery.email_type !== "feedback_request" || delivery.status !== "sent") {
    return null;
  }

  const sentAt = new Date(delivery.sent_at || "").getTime();
  if (
    !Number.isFinite(sentAt)
    || sentAt > now
    || now - sentAt > FEEDBACK_EMAIL_LOGIN_MAX_AGE_MS
  ) {
    return null;
  }

  const expectedPath = `/events/${encodeURIComponent(delivery.event_id)}/feedback`;
  if (destination.pathname !== expectedPath || destination.hash) return null;

  const attended = destination.searchParams.get("attended");
  const rating = destination.searchParams.get("overall_rating");
  const allowedKeys = new Set(["attended", "overall_rating"]);
  if ([...destination.searchParams.keys()].some((key) => !allowedKeys.has(key))) {
    return null;
  }

  const isFormLink = !attended && !rating;
  const isDidNotAttendLink = attended === "no" && !rating;
  const isRatingLink =
    attended === "yes"
    && rating != null
    && /^[1-5]$/.test(rating);
  if (!isFormLink && !isDidNotAttendLink && !isRatingLink) return null;

  return `${destination.pathname}${destination.search}`;
}

export function eventRoundEmailLoginNextPath({
  delivery,
  destination,
  now = Date.now(),
}: {
  delivery: EventRoundEmailAccessDelivery;
  destination: URL;
  now?: number;
}) {
  if (delivery.email_type !== "event_reminder" || delivery.status !== "sent") {
    return null;
  }
  if (delivery.frozen_payload?.hostStatus !== "none") return null;

  const sentAt = new Date(delivery.sent_at || "").getTime();
  const startsAt = new Date(
    typeof delivery.frozen_payload.startsAt === "string"
      ? delivery.frozen_payload.startsAt
      : "",
  ).getTime();
  if (
    !Number.isFinite(sentAt)
    || sentAt > now
    || !Number.isFinite(startsAt)
    || now >= startsAt + EVENT_ROUND_ACCESS_DURATION_MS
  ) {
    return null;
  }

  const eventPath = `/events/${encodeURIComponent(delivery.event_id)}`;
  const allowedPaths = new Set([
    `${eventPath}/sharing-round`,
    `${eventPath}/spicy-round`,
  ]);
  if (
    !allowedPaths.has(destination.pathname)
    || destination.search
    || destination.hash
  ) {
    return null;
  }

  return destination.pathname;
}
