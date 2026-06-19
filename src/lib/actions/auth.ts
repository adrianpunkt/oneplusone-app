"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAppOrigin } from "@/lib/app-origin";
import {
  normalizeMemberLoginNextPath,
  normalizeOtpType,
  type MemberLoginOtpType,
} from "@/lib/auth-link";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
import { normalizeLocale, type Locale } from "@/lib/i18n/locales";
import { sendMemberLoginEmail } from "@/lib/member-login-email";
import { emailSchema, otpCodeSchema } from "@/lib/validators/story";

export type AuthActionState = {
  error?: string;
  email?: string;
  next?: string;
  notRegistered?: boolean;
  otpType?: MemberLoginOtpType;
  sent?: boolean;
};

async function findActiveMemberByEmail(email: string) {
  const dictionary = getDictionary(await getRequestLocaleFallback());
  let serviceClient: ReturnType<typeof getSupabaseServiceClient>;

  try {
    serviceClient = getSupabaseServiceClient();
  } catch {
    return {
      error: dictionary.authErrors.memberAccess,
      member: null,
    };
  }

  const { data: member, error } = await serviceClient
    .from("members")
    .select("id,membership_status")
    .eq("email_norm", email)
    .eq("membership_status", "active")
    .maybeSingle();

  if (error) {
    return {
      error: dictionary.authErrors.checkMembership,
      member: null,
    };
  }

  return { error: null, member };
}

function getFormLocale(formData: FormData): Locale | null {
  const value = formData.get("locale");
  if (typeof value !== "string" || !value.trim()) return null;

  return normalizeLocale(value);
}

export async function requestOtpAction(
  previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const formLocale = getFormLocale(formData);
  const requestLocale = await getRequestLocaleFallback();
  const locale = formLocale || requestLocale;
  const dictionary = getDictionary(locale);
  const emailValue = formData.get("email");
  const submittedEmail = typeof emailValue === "string" ? emailValue : "";
  const parsedEmail = emailSchema.safeParse(emailValue);
  const next = normalizeMemberLoginNextPath(String(formData.get("next") || ""));

  if (!parsedEmail.success) {
    return { email: submittedEmail, error: dictionary.authErrors.validEmail, next };
  }

  const email = parsedEmail.data.trim().toLowerCase();
  const { error: memberLookupError, member } = await findActiveMemberByEmail(email);

  if (!member) {
    if (memberLookupError) return { email, error: memberLookupError };
    return { email, notRegistered: true };
  }

  const requestHeaders = await headers();
  const origin = resolveAppOrigin(requestHeaders.get("origin"));

  try {
    const loginEmail = await sendMemberLoginEmail({
      email,
      locale,
      next,
      origin,
      reason: previousState.sent ? "resend" : "login",
    });

    if (loginEmail.ok) {
      return { email, next, otpType: loginEmail.otpType, sent: true };
    }
  } catch (error) {
    console.error("Could not send Loops login email", error);
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { error: dictionary.authErrors.supabase };
  }

  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: {
        language: locale,
        locale,
      },
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return {
      email,
      error: dictionary.authErrors.loginEmail,
    };
  }

  return { email, next, otpType: "email", sent: true };
}

export async function verifyOtpAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const dictionary = getDictionary(await getRequestLocaleFallback());
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const parsedToken = otpCodeSchema.safeParse(formData.get("code"));
  const next = normalizeMemberLoginNextPath(String(formData.get("next") || ""));
  const otpType = normalizeOtpType(formData.get("otpType"));

  if (!parsedEmail.success) {
    return { error: dictionary.authErrors.emailForCode, sent: true };
  }

  const email = parsedEmail.data.trim().toLowerCase();

  if (!parsedToken.success) {
    return { email, error: dictionary.authErrors.codeFromEmail, next, sent: true };
  }

  const { error: memberLookupError, member } = await findActiveMemberByEmail(email);
  if (!member) {
    if (memberLookupError) return { email, error: memberLookupError, next, sent: true };
    return { email, next, notRegistered: true, sent: true };
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { email, error: dictionary.authErrors.supabase, next, sent: true };
  }

  const { error } = await supabase.auth.verifyOtp({
    email,
    token: parsedToken.data,
    type: otpType,
  });

  if (error) {
    return { email, error: dictionary.authErrors.invalidCode, next, sent: true };
  }

  await supabase.rpc("link_member_for_current_user");
  await supabase.rpc("claim_profile_registration_for_current_email");

  redirect(next);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
