import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import {
  buildAuthConfirmUrl,
  MEMBER_LOGIN_LINK_TTL_MINUTES,
  type MemberLoginOtpType,
} from "@/lib/auth-link";
import {
  getLoopsTransactionalId,
  isLoopsLoginEmailConfigured,
  sendLoopsTransactionalEmail,
} from "@/lib/loops";
import type { Locale } from "@/lib/i18n/locales";

export type MemberLoginEmailResult = {
  loginUrl?: string;
  ok: boolean;
  otpType?: MemberLoginOtpType;
};

export async function sendMemberLoginEmail({
  autoSubmit = false,
  email,
  locale,
  next,
  origin,
  reason = "login",
}: {
  autoSubmit?: boolean;
  email: string;
  locale: Locale;
  next: string;
  origin: string;
  reason?: "expired_link" | "login" | "resend";
}): Promise<MemberLoginEmailResult> {
  if (!isLoopsLoginEmailConfigured(locale)) {
    return { ok: false };
  }

  const supabase = getSupabaseServiceClient();
  const redirectTo = buildAuthConfirmUrl({ autoSubmit, email, next, origin }).toString();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      data: {
        language: locale,
        locale,
      },
      redirectTo,
    },
  });

  if (error) {
    throw new Error(error.message || "Could not generate login link.");
  }

  const properties = data.properties;
  const tokenHash = properties?.hashed_token;
  if (!tokenHash) {
    throw new Error("Supabase did not return a hashed login token.");
  }

  const otpType = normalizeGeneratedOtpType(properties?.verification_type);
  const loginUrl = buildAuthConfirmUrl({
    autoSubmit,
    email,
    next,
    origin,
    tokenHash: String(tokenHash),
    type: otpType,
  }).toString();
  const loginCode = typeof properties?.email_otp === "string" ? properties.email_otp : "";
  const transactionalId = getLoopsTransactionalId(locale);

  if (!transactionalId) {
    throw new Error("Loops login email is not configured: missing transactional id.");
  }

  await sendLoopsTransactionalEmail({
    email,
    transactionalId,
    addToAudience: false,
    idempotencyKey: `member-login-${reason}-${String(tokenHash).slice(0, 24)}`,
    dataVariables: {
      email,
      confirmationUrl: loginUrl,
      expiresInMinutes: MEMBER_LOGIN_LINK_TTL_MINUTES,
      language: locale,
      locale,
      token: loginCode,
      loginCode,
      loginLink: loginUrl,
      loginUrl,
      magicLink: loginUrl,
      next,
      reason,
    },
  });

  return {
    loginUrl,
    ok: true,
    otpType,
  };
}

function normalizeGeneratedOtpType(value: unknown): MemberLoginOtpType {
  return value === "email" ? "email" : "magiclink";
}
