import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { decodeEmailHint, type MemberLoginOtpType } from "@/lib/auth-link";
import { sendMemberLoginEmail } from "@/lib/member-login-email";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localeCookieName, normalizeLocale } from "@/lib/i18n/locales";
import { safeInternalPath } from "@/lib/utils";

const allowedEmailOtpTypes = new Set(["email", "invite", "magiclink", "signup"]);

function firstValue(value: string | null) {
  return value?.trim() || "";
}

function loginRedirectUrl(
  requestUrl: URL,
  auth: string,
  next: string,
  emailHint: string,
  options: { otpType?: MemberLoginOtpType; sent?: boolean } = {},
) {
  const url = new URL("/login", requestUrl.origin);
  url.searchParams.set("auth", auth);
  url.searchParams.set("next", next);
  if (emailHint) url.searchParams.set("email_hint", emailHint);
  if (options.sent) url.searchParams.set("sent", "1");
  if (options.otpType) url.searchParams.set("otp_type", options.otpType);
  return url;
}

async function expiredLinkRedirectUrl(requestUrl: URL, next: string, emailHint: string) {
  const email = decodeEmailHint(emailHint);
  if (!email) return loginRedirectUrl(requestUrl, "expired-link", next, emailHint);

  try {
    const serviceClient = getSupabaseServiceClient();
    const { data: member, error } = await serviceClient
      .from("members")
      .select("membership_status,preferred_locale")
      .eq("email_norm", email)
      .eq("membership_status", "active")
      .maybeSingle<{ membership_status: string | null; preferred_locale: string | null }>();

    if (error || member?.membership_status !== "active") {
      return loginRedirectUrl(requestUrl, "expired-link", next, emailHint);
    }

    const loginEmail = await sendMemberLoginEmail({
      email,
      locale: normalizeLocale(member.preferred_locale),
      next,
      origin: requestUrl.origin,
      reason: "expired_link",
    });

    if (loginEmail.ok) {
      return loginRedirectUrl(requestUrl, "expired-link-sent", next, emailHint, {
        otpType: loginEmail.otpType,
        sent: true,
      });
    }
  } catch (error) {
    console.error("Could not send fresh login link for expired auth link", error);
  }

  return loginRedirectUrl(requestUrl, "expired-link", next, emailHint);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = firstValue(
    requestUrl.searchParams.get("token_hash") || requestUrl.searchParams.get("token"),
  );
  const type = firstValue(requestUrl.searchParams.get("type"));
  const next = safeInternalPath(requestUrl.searchParams.get("next"), "/dashboard");
  const emailHint = firstValue(requestUrl.searchParams.get("email_hint"));

  if (!tokenHash || !allowedEmailOtpTypes.has(type)) {
    return NextResponse.redirect(loginRedirectUrl(requestUrl, "expired-link", next, emailHint));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error) {
    return NextResponse.redirect(await expiredLinkRedirectUrl(requestUrl, next, emailHint));
  }

  await supabase.rpc("link_member_for_current_user");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(await expiredLinkRedirectUrl(requestUrl, next, emailHint));
  }

  const { data: member } = await supabase
    .from("members")
    .select("membership_status,preferred_locale")
    .eq("user_id", user.id)
    .maybeSingle<{ membership_status: string | null; preferred_locale: string | null }>();

  if (member?.membership_status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(loginRedirectUrl(requestUrl, "inactive", next, emailHint));
  }

  await supabase.rpc("claim_profile_registration_for_current_email");

  const { data: profile } = await supabase
    .from("profile_registrations")
    .select("locale")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ locale: string | null }>();

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  const resolvedLocale = normalizeLocale(member?.preferred_locale || profile?.locale);
  if (resolvedLocale) {
    response.cookies.set(localeCookieName, resolvedLocale, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}
