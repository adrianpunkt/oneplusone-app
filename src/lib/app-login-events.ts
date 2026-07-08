import { getSupabaseServiceClient } from "@/lib/supabase/admin";

type MemberAppLoginMethod =
  | "auth_callback"
  | "demo_password"
  | "magic_link_confirm"
  | "otp_code";

type RecordMemberAppLoginEventOptions = {
  method: MemberAppLoginMethod;
  next?: string;
  userId: string;
};

export async function recordMemberAppLoginEvent({
  method,
  next,
  userId,
}: RecordMemberAppLoginEventOptions) {
  if (!userId) return;

  try {
    const supabase = getSupabaseServiceClient();
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle<{ id: string }>();

    if (memberError) {
      console.warn("Could not resolve member for app login event", memberError.message);
      return;
    }

    if (!member) return;

    const metadata: Record<string, string> = {
      method,
      source: "member_app",
    };
    if (next) metadata.next = next;

    const { error } = await supabase.from("member_app_login_events").insert({
      event_type: "login",
      member_id: member.id,
      metadata_json: metadata,
      user_id: userId,
    });

    if (!error) return;

    if (isMissingRelationError(error)) {
      console.warn("member_app_login_events is missing; skipping app login event.");
      return;
    }

    console.warn("Could not record app login event", error.message);
  } catch (error) {
    console.warn("Could not record app login event", error);
  }
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01" || /does not exist/i.test(error.message || "");
}
