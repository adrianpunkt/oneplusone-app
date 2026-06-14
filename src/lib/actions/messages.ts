"use server";

import { revalidatePath } from "next/cache";

import { requireMemberContext } from "@/lib/data/member";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/validators/story";

export type MessageActionState = {
  error?: string;
  ok?: boolean;
};

export async function startConversationAction(
  _previousState: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  await requireMemberContext();
  const parsed = messageSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid message." };

  const eventId = String(formData.get("event_id") || "");
  const recipientMemberId = String(formData.get("recipient_member_id") || "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("start_conversation", {
    p_event_id: eventId,
    p_recipient_member_id: recipientMemberId,
    p_body: parsed.data.body,
  });

  if (error) return { error: error.message };

  revalidatePath("/messages");
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function sendMessageAction(
  _previousState: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  await requireMemberContext();
  const parsed = messageSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid message." };

  const conversationId = String(formData.get("conversation_id") || "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_body: parsed.data.body,
  });

  if (error) return { error: error.message };

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  return { ok: true };
}
