import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import {
  hashRefundFeedbackToken,
  isRefundFeedbackExpired,
  type RefundFeedbackLocale,
  type RefundFeedbackReason,
} from "@/lib/membership-refund-feedback-core";

export {
  hashRefundFeedbackToken,
  isRefundFeedbackExpired,
  refundFeedbackClaimAction,
  REFUND_FEEDBACK_COOKIE_NAME,
  REFUND_FEEDBACK_MAX_AGE_SECONDS,
  refundFeedbackReasons,
  validateRefundFeedbackInput,
  type RefundFeedbackLocale,
  type RefundFeedbackReason,
} from "@/lib/membership-refund-feedback-core";

type RefundEmailDelivery = {
  feedback_expires_at: string;
  id: string;
  refund_id: string;
  status: "pending" | "sent" | "failed";
};

type MembershipRefund = {
  amount_cents: number;
  currency: string;
  id: string;
  locale: RefundFeedbackLocale;
  member_email: string;
  member_id: string;
  status: string;
};

type RefundFeedbackResponse = {
  comments: string | null;
  id: string;
  reason: RefundFeedbackReason;
  submitted_at: string;
};

export type RefundFeedbackContext = {
  delivery: RefundEmailDelivery;
  feedback: RefundFeedbackResponse | null;
  refund: MembershipRefund;
};

export type RefundFeedbackAccess =
  | { status: "valid"; context: RefundFeedbackContext; tokenHash: string }
  | { status: "expired"; locale: RefundFeedbackLocale }
  | { status: "invalid" };

export async function resolveRefundFeedbackAccess(rawToken: string): Promise<RefundFeedbackAccess> {
  const token = rawToken.trim();
  if (!token || token.length > 512) return { status: "invalid" };

  const tokenHash = hashRefundFeedbackToken(token);
  const supabase = getSupabaseServiceClient();
  const { data: deliveryData, error: deliveryError } = await supabase
    .from("membership_refund_email_deliveries")
    .select("id,refund_id,status,feedback_expires_at")
    .eq("feedback_token_hash", tokenHash)
    .maybeSingle<RefundEmailDelivery>();

  if (deliveryError || !deliveryData || deliveryData.status !== "sent") {
    return { status: "invalid" };
  }
  if (isRefundFeedbackExpired(deliveryData.feedback_expires_at)) {
    const { data: expiredRefund } = await supabase
      .from("membership_refunds")
      .select("locale")
      .eq("id", deliveryData.refund_id)
      .maybeSingle<{ locale: RefundFeedbackLocale }>();
    return {
      locale: expiredRefund?.locale === "es" ? "es" : "en",
      status: "expired",
    };
  }

  const [{ data: refundData, error: refundError }, { data: feedbackData, error: feedbackError }] =
    await Promise.all([
      supabase
        .from("membership_refunds")
        .select("id,member_id,member_email,amount_cents,currency,status,locale")
        .eq("id", deliveryData.refund_id)
        .maybeSingle<MembershipRefund>(),
      supabase
        .from("membership_refund_feedback")
        .select("id,reason,comments,submitted_at")
        .eq("refund_id", deliveryData.refund_id)
        .maybeSingle<RefundFeedbackResponse>(),
    ]);

  if (refundError || feedbackError || !refundData) return { status: "invalid" };

  return {
    context: {
      delivery: deliveryData,
      feedback: feedbackData || null,
      refund: refundData,
    },
    status: "valid",
    tokenHash,
  };
}
