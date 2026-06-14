"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils";
import { emailSchema, otpCodeSchema } from "@/lib/validators/story";

export type AuthActionState = {
  error?: string;
  email?: string;
  next?: string;
  notRegistered?: boolean;
  sent?: boolean;
};

async function findActiveMemberByEmail(email: string) {
  let serviceClient: ReturnType<typeof getSupabaseServiceClient>;

  try {
    serviceClient = getSupabaseServiceClient();
  } catch {
    return {
      error: "Member access is not configured yet. Add the Supabase service key first.",
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
      error: "We could not check your membership right now. Please try again.",
      member: null,
    };
  }

  return { error: null, member };
}

export async function requestOtpAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const next = safeInternalPath(String(formData.get("next") || "/dashboard"));

  if (!parsedEmail.success) {
    return { error: "Enter a valid email address." };
  }

  const email = parsedEmail.data.trim().toLowerCase();
  const { error: memberLookupError, member } = await findActiveMemberByEmail(email);

  if (!member) {
    if (memberLookupError) return { email, error: memberLookupError };
    return { email, notRegistered: true };
  }

  const requestHeaders = await headers();
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL ||
    requestHeaders.get("origin") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { error: "Supabase is not configured yet. Add .env.local first." };
  }

  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return {
      email,
      error:
        error.message === "Error sending magic link email"
          ? "We could not send the login email. Check the Supabase email provider for opo-dev."
          : error.message,
    };
  }

  return { email, next, sent: true };
}

export async function verifyOtpAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const parsedToken = otpCodeSchema.safeParse(formData.get("code"));
  const next = safeInternalPath(String(formData.get("next") || "/dashboard"));

  if (!parsedEmail.success) {
    return { error: "Enter the email address we sent the code to.", sent: true };
  }

  const email = parsedEmail.data.trim().toLowerCase();

  if (!parsedToken.success) {
    return { email, error: "Enter the code from your email.", next, sent: true };
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
    return { email, error: "Supabase is not configured yet. Add .env.local first.", next, sent: true };
  }

  const { error } = await supabase.auth.verifyOtp({
    email,
    token: parsedToken.data,
    type: "email",
  });

  if (error) {
    return { email, error: "That code did not work. Check the code or request a new one.", next, sent: true };
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
