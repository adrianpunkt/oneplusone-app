import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Member, ProfileRegistration } from "@/lib/types";

export type MemberContext = {
  member: Member;
  profile: ProfileRegistration | null;
  user: User;
};

export async function getOptionalMemberContext(): Promise<MemberContext | null> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return null;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  await supabase.rpc("link_member_for_current_user");
  await supabase.rpc("claim_profile_registration_for_current_email");

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id,email,membership_status,membership_source,membership_granted_at,referral_code_id,user_id")
    .eq("user_id", user.id)
    .maybeSingle<Member>();

  if (memberError || !member) return null;

  const { data: profile } = await supabase
    .from("profile_registrations")
    .select("id,user_id,status,profile_json,contact_email,submitted_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProfileRegistration>();

  return {
    member,
    profile: profile || null,
    user,
  };
}

export async function requireMemberContext(): Promise<MemberContext> {
  const context = await getOptionalMemberContext();
  if (!context) redirect("/login");
  return context;
}
