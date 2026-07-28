import { createHash } from "node:crypto";

export const REFUND_FEEDBACK_COOKIE_NAME = "opo-refund-feedback";
export const REFUND_FEEDBACK_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const refundFeedbackReasons = [
  "not_enough_suitable_events",
  "event_format_or_atmosphere",
  "people_or_connections",
  "price_or_value",
  "app_or_signup_experience",
  "personal_circumstances",
  "other",
] as const;

export type RefundFeedbackReason = (typeof refundFeedbackReasons)[number];
export type RefundFeedbackLocale = "en" | "es";

export function hashRefundFeedbackToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isRefundFeedbackExpired(expiresAt: string, now = Date.now()) {
  const expiresAtMs = new Date(expiresAt).getTime();
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now;
}

export function refundFeedbackClaimAction(
  hostHeader: string | null,
  forwardedProtocolHeader: string | null,
) {
  const relativeAction = "/refund-feedback/access/claim";
  const host = hostHeader?.split(",")[0]?.trim();
  if (!host) return relativeAction;

  try {
    const protocol = forwardedProtocolHeader?.split(",")[0]?.trim() === "https"
      ? "https:"
      : "http:";
    const requestOrigin = new URL(`${protocol}//${host}`);
    if (requestOrigin.hostname !== "localhost") return relativeAction;

    const isolatedOrigin = new URL(requestOrigin.origin);
    isolatedOrigin.hostname = "127.0.0.1";
    return new URL(relativeAction, isolatedOrigin).toString();
  } catch {
    return relativeAction;
  }
}

export function validateRefundFeedbackInput(
  reasonValue: unknown,
  commentsValue: unknown,
):
  | { error: string }
  | { comments: string | null; reason: RefundFeedbackReason } {
  const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";
  const comments = typeof commentsValue === "string" ? commentsValue.trim() : "";

  if (!refundFeedbackReasons.includes(reason as RefundFeedbackReason)) {
    return { error: "Choose a feedback reason." } as const;
  }
  if (comments.length > 2000) {
    return { error: "Comments must be 2,000 characters or fewer." } as const;
  }
  if (reason === "other" && !comments) {
    return { error: "Please add comments when choosing Other." } as const;
  }

  return {
    comments: comments || null,
    reason: reason as RefundFeedbackReason,
  } as const;
}
