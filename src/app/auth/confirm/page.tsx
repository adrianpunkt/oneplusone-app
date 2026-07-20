import type { EmailOtpType } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { LanguageSwitcher } from "@/components/app/language-switcher";
import { BrandLogo } from "@/components/brand-logo";
import { AutoSubmitButton } from "@/components/forms/auto-submit-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { recordMemberAppLoginEvent } from "@/lib/app-login-events";
import {
  decodeEmailHint,
  MEMBER_LOGIN_LINK_TTL_MINUTES,
  normalizeMemberLoginNextPath,
  type MemberLoginOtpType,
} from "@/lib/auth-link";
import { resolveAppOrigin } from "@/lib/app-origin";
import { getOptionalMemberContextForRender } from "@/lib/data/member";
import { isDemoMemberEmail } from "@/lib/demo-member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
import { localeCookieName, normalizeLocale } from "@/lib/i18n/locales";
import { sendMemberLoginEmail } from "@/lib/member-login-email";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedEmailOtpTypes = new Set(["email", "invite", "magiclink", "signup"]);
const authLinkPreflightStatuses = new Set(["invalid", "unknown", "valid"]);

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm login",
};

type ConfirmSearchParams = {
  auto?: string | string[];
  email_hint?: string | string[];
  next?: string | string[];
  token?: string | string[];
  token_hash?: string | string[];
  type?: string | string[];
};

function firstValue(value: FormDataEntryValue | string | string[] | null | undefined) {
  if (Array.isArray(value)) return firstValue(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function loginRedirectPath(
  auth: string,
  next: string,
  emailHint: string,
  options: { otpType?: MemberLoginOtpType; sent?: boolean } = {},
) {
  const params = new URLSearchParams({ auth, next });
  if (emailHint) params.set("email_hint", emailHint);
  if (options.sent) params.set("sent", "1");
  if (options.otpType) params.set("otp_type", options.otpType);
  return `/login?${params.toString()}`;
}

function counterpartLoginOtpType(type: string): EmailOtpType | "" {
  if (type === "email") return "magiclink";
  if (type === "magiclink") return "email";
  return "";
}

async function preflightAuthLink(tokenHash: string, type: string) {
  const primaryStatus = await preflightAuthLinkType(tokenHash, type);
  if (primaryStatus === "valid") return "valid";

  const fallbackType = counterpartLoginOtpType(type);
  if (!fallbackType) return primaryStatus;

  const fallbackStatus = await preflightAuthLinkType(tokenHash, fallbackType);
  if (fallbackStatus === "valid") return "valid";
  if (primaryStatus === "unknown" || fallbackStatus === "unknown") return "unknown";
  return "invalid";
}

async function preflightAuthLinkType(tokenHash: string, type: string) {
  try {
    const serviceClient = getSupabaseServiceClient();
    const { data, error } = await serviceClient.rpc("preflight_member_auth_link", {
      p_otp_ttl_seconds: MEMBER_LOGIN_LINK_TTL_MINUTES * 60,
      p_token_hash: tokenHash,
      p_type: type,
    });

    if (error) {
      console.warn("Could not preflight auth link", error.message);
      return "unknown";
    }

    return typeof data === "string" && authLinkPreflightStatuses.has(data)
      ? data
      : "unknown";
  } catch (error) {
    console.warn("Could not preflight auth link", error);
    return "unknown";
  }
}

async function verifyAuthLink(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tokenHash: string,
  type: string,
) {
  const result = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (!result.error) return result;

  const fallbackType = counterpartLoginOtpType(type);
  if (!fallbackType) return result;

  const fallbackResult = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: fallbackType,
  });

  return fallbackResult.error ? result : fallbackResult;
}

async function expiredLinkRedirectPath(
  origin: string,
  next: string,
  emailHint: string,
  autoSubmit = false,
) {
  const email = decodeEmailHint(emailHint);
  if (!email) return loginRedirectPath("expired-link", next, emailHint);
  if (isDemoMemberEmail(email)) return loginRedirectPath("expired-link", next, emailHint);

  try {
    const serviceClient = getSupabaseServiceClient();
    const { data: member, error } = await serviceClient
      .from("members")
      .select("membership_status,preferred_locale")
      .eq("email_norm", email)
      .eq("membership_status", "active")
      .maybeSingle<{ membership_status: string | null; preferred_locale: string | null }>();

    if (error || member?.membership_status !== "active") {
      return loginRedirectPath("expired-link", next, emailHint);
    }

    const loginEmail = await sendMemberLoginEmail({
      autoSubmit,
      email,
      locale: normalizeLocale(member.preferred_locale),
      next,
      origin,
      reason: "expired_link",
    });

    if (loginEmail.ok) {
      return loginRedirectPath("expired-link-sent", next, emailHint, {
        otpType: loginEmail.otpType,
        sent: true,
      });
    }
  } catch (error) {
    console.error("Could not send fresh login link for expired auth link", error);
  }

  return loginRedirectPath("expired-link", next, emailHint);
}

export async function confirmLoginAction(formData: FormData) {
  "use server";

  const tokenHash = firstValue(formData.get("token_hash") || formData.get("token"));
  const type = firstValue(formData.get("type"));
  const next = normalizeMemberLoginNextPath(firstValue(formData.get("next")));
  const emailHint = firstValue(formData.get("email_hint"));
  const autoSubmit = firstValue(formData.get("auto")) === "1";
  const requestHeaders = await headers();
  const origin = resolveAppOrigin(requestHeaders.get("origin"));

  if (!tokenHash || !allowedEmailOtpTypes.has(type)) {
    redirect(loginRedirectPath("expired-link", next, emailHint));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await verifyAuthLink(supabase, tokenHash, type);

  if (error) {
    console.warn("Could not verify auth link", error.message);
    redirect(await expiredLinkRedirectPath(origin, next, emailHint, autoSubmit));
  }

  await supabase.rpc("link_member_for_current_user");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(await expiredLinkRedirectPath(origin, next, emailHint, autoSubmit));
  }

  const { data: member } = await supabase
    .from("members")
    .select("membership_status,preferred_locale")
    .eq("user_id", user.id)
    .maybeSingle<{ membership_status: string | null; preferred_locale: string | null }>();

  if (member?.membership_status !== "active") {
    await supabase.auth.signOut();
    redirect(loginRedirectPath("inactive", next, emailHint));
  }

  await supabase.rpc("claim_profile_registration_for_current_email");

  const { data: profile } = await supabase
    .from("profile_registrations")
    .select("locale")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ locale: string | null }>();

  const resolvedLocale = normalizeLocale(member?.preferred_locale || profile?.locale);
  if (resolvedLocale) {
    const cookieStore = await cookies();
    cookieStore.set(localeCookieName, resolvedLocale, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  await recordMemberAppLoginEvent({ method: "magic_link_confirm", next, userId: user.id });

  redirect(next);
}

export default async function ConfirmLoginPage({
  searchParams,
}: {
  searchParams: Promise<ConfirmSearchParams>;
}) {
  const locale = await getRequestLocaleFallback();
  const dictionary = getDictionary(locale);
  const params = await searchParams;
  const tokenHash = firstValue(params.token_hash || params.token);
  const type = firstValue(params.type);
  const next = normalizeMemberLoginNextPath(firstValue(params.next));
  const emailHint = firstValue(params.email_hint);
  const autoSubmit = firstValue(params.auto) === "1";
  const context = await getOptionalMemberContextForRender();
  if (context) redirect(next);

  if (!tokenHash || !allowedEmailOtpTypes.has(type)) {
    redirect(loginRedirectPath("expired-link", next, emailHint));
  }

  const preflightStatus = await preflightAuthLink(tokenHash, type);
  if (preflightStatus === "invalid") {
    const requestHeaders = await headers();
    const origin = resolveAppOrigin(requestHeaders.get("origin"));
    redirect(await expiredLinkRedirectPath(origin, next, emailHint, autoSubmit));
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="relative flex flex-col items-center gap-3 sm:min-h-10 sm:flex-row sm:justify-center">
            <BrandLogo className="w-40" priority />
            <LanguageSwitcher
              ariaLabel={dictionary.common.language}
              className="sm:absolute sm:right-0 sm:top-0"
              currentLocale={locale}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <h1 className="font-display text-2xl font-extrabold leading-tight text-wine-burgundy">
                {dictionary.login.confirmTitle}
              </h1>
              <p className="text-sm leading-6 text-muted">
                {dictionary.login.confirmBody}
              </p>
            </div>
            <form action={confirmLoginAction} className="grid gap-4">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="email_hint" value={emailHint} />
              <input type="hidden" name="auto" value={autoSubmit ? "1" : ""} />
              <AutoSubmitButton autoSubmit={autoSubmit} size="lg">
                <KeyRound className="h-4 w-4" />
                {dictionary.login.confirmButton}
              </AutoSubmitButton>
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
