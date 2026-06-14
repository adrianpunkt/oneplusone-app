"use server";

import { revalidatePath } from "next/cache";

import { requireMemberContext } from "@/lib/data/member";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EventActionState = {
  error?: string;
  ok?: boolean;
};

export async function confirmInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  await requireMemberContext();
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("confirm_event_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: error.message };

  revalidatePath("/events");
  revalidatePath("/credits");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function cancelInvitationAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  await requireMemberContext();
  const invitationId = String(formData.get("invitation_id") || "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_event_confirmation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: error.message };

  revalidatePath("/events");
  revalidatePath("/dashboard");
  return { ok: true };
}
