import type { EmailOtpType } from "@supabase/supabase-js";

import { recordMemberAppLoginEvent } from "@/lib/app-login-events";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EventInvitationMemberSessionResult =
  | {
      ok: true;
      preferredLocale: string | null;
    }
  | {
      error: string;
      ok: false;
    };

export async function createEventInvitationMemberSession({
  email,
  expectedMemberId,
  locale,
  next,
  supabaseClient,
}: {
  email: string;
  expectedMemberId: string;
  locale: "en" | "es";
  next: string;
  supabaseClient?: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}): Promise<EventInvitationMemberSessionResult> {
  try {
    const serviceClient = getSupabaseServiceClient();
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          language: locale,
          locale,
        },
      },
    });

    if (error || !data.properties?.hashed_token) {
      return {
        error: error?.message || "Supabase did not return a session token.",
        ok: false,
      };
    }

    const supabase = supabaseClient || await createSupabaseServerClient();
    const otpType = normalizeGeneratedOtpType(data.properties.verification_type);
    const verification = await verifyGeneratedLoginToken(
      supabase,
      data.properties.hashed_token,
      otpType,
    );

    if (verification.error) {
      return { error: verification.error.message, ok: false };
    }

    const { error: linkError } = await supabase.rpc("link_member_for_current_user");
    if (linkError) {
      await supabase.auth.signOut();
      return { error: linkError.message, ok: false };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      await supabase.auth.signOut();
      return { error: "Supabase did not create a member session.", ok: false };
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id,membership_status,preferred_locale")
      .eq("user_id", user.id)
      .maybeSingle<{
        id: string;
        membership_status: string | null;
        preferred_locale: string | null;
      }>();

    if (
      memberError ||
      member?.id !== expectedMemberId ||
      member.membership_status !== "active"
    ) {
      await supabase.auth.signOut();
      return {
        error: memberError?.message || "The authenticated member does not match this invitation.",
        ok: false,
      };
    }

    await supabase.rpc("claim_profile_registration_for_current_email");
    await recordMemberAppLoginEvent({
      method: "event_invitation",
      next,
      userId: user.id,
    });

    return {
      ok: true,
      preferredLocale: member.preferred_locale,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

function normalizeGeneratedOtpType(value: unknown) {
  return value === "email" ? "email" : "magiclink";
}

function counterpartLoginOtpType(type: string): EmailOtpType | null {
  if (type === "email") return "magiclink";
  if (type === "magiclink") return "email";
  return null;
}

async function verifyGeneratedLoginToken(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tokenHash: string,
  type: "email" | "magiclink",
) {
  const result = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
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
