"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  REFUND_FEEDBACK_COOKIE_NAME,
  resolveRefundFeedbackAccess,
  validateRefundFeedbackInput,
  type RefundFeedbackLocale,
} from "@/lib/membership-refund-feedback";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

export type RefundFeedbackActionState = {
  error?: string;
  ok?: boolean;
};

const errors = {
  en: {
    access: "This feedback link is invalid or has expired.",
    comments: "Comments must be 2,000 characters or fewer.",
    other: "Please add comments when choosing Other.",
    reason: "Choose a feedback reason.",
    save: "We could not save your feedback. Please try again.",
  },
  es: {
    access: "Este enlace de comentarios no es válido o ha caducado.",
    comments: "Los comentarios deben tener 2.000 caracteres o menos.",
    other: "Añade un comentario al seleccionar Otro.",
    reason: "Elige un motivo.",
    save: "No pudimos guardar tus comentarios. Inténtalo de nuevo.",
  },
} as const;

export async function submitRefundFeedbackAction(
  _previousState: RefundFeedbackActionState,
  formData: FormData,
): Promise<RefundFeedbackActionState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(REFUND_FEEDBACK_COOKIE_NAME)?.value || "";
  const access = await resolveRefundFeedbackAccess(token);
  if (access.status !== "valid") return { error: errors.en.access };

  const locale: RefundFeedbackLocale = access.context.refund.locale === "es" ? "es" : "en";
  if (access.context.feedback) return { ok: true };

  const parsed = validateRefundFeedbackInput(formData.get("reason"), formData.get("comments"));
  if ("error" in parsed) {
    const key = parsed.error.startsWith("Comments")
      ? "comments"
      : parsed.error.startsWith("Please")
        ? "other"
        : "reason";
    return { error: errors[locale][key] };
  }

  const { error } = await getSupabaseServiceClient().rpc("submit_membership_refund_feedback", {
    p_comments: parsed.comments,
    p_feedback_token_hash: access.tokenHash,
    p_reason: parsed.reason,
  });
  if (error) return { error: errors[locale].save };

  revalidatePath("/refund-feedback");
  return { ok: true };
}
