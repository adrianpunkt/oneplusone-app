"use server";

import { revalidatePath } from "next/cache";

import { requireMemberContext } from "@/lib/data/member";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/validators/story";

export type MessageActionState = {
  changed?: boolean;
  error?: string;
  ok?: boolean;
};

type ParticipantReadRow = {
  conversation_id: string;
  last_read_at: string | null;
};

type LatestMessageRow = {
  sender_member_id: string;
  created_at: string;
};

async function markConversationMessagesRead(conversationId: string, memberId: string) {
  if (!conversationId) return { error: "Conversation was not found." };

  const supabase = await createSupabaseServerClient();
  const [{ data: participantData, error: participantError }, { data: messageData, error: messageError }] =
    await Promise.all([
      supabase
        .from("conversation_participants")
        .select("conversation_id,last_read_at")
        .eq("conversation_id", conversationId)
        .eq("member_id", memberId)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("sender_member_id,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (participantError) return { error: participantError.message };
  if (messageError) return { error: messageError.message };
  if (!participantData) return { error: "Conversation was not found." };

  const participant = participantData as ParticipantReadRow;
  const latestMessage = messageData ? (messageData as LatestMessageRow) : null;
  const hasUnreadMessage =
    latestMessage !== null &&
    latestMessage.sender_member_id !== memberId &&
    (!participant.last_read_at ||
      new Date(latestMessage.created_at) > new Date(participant.last_read_at));

  const readAt = new Date().toISOString();
  let changed = false;

  if (hasUnreadMessage) {
    const { error } = await supabase
      .from("conversation_participants")
      .update({ last_read_at: readAt })
      .eq("conversation_id", conversationId)
      .eq("member_id", memberId);

    if (error) return { error: error.message };
    changed = true;
  }

  const { data: readNotifications, error: notificationError } = await supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("member_id", memberId)
    .eq("type", "message")
    .eq("href", `/messages/${conversationId}`)
    .is("read_at", null)
    .select("id");

  if (notificationError) return { error: notificationError.message };

  return {
    changed: changed || Boolean(readNotifications?.length),
    ok: true,
  };
}

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

export async function markConversationReadAction(
  conversationId: string,
): Promise<MessageActionState> {
  const { member } = await requireMemberContext();
  const result = await markConversationMessagesRead(conversationId, member.id);

  if (result.error) return { error: result.error };

  if (result.changed) {
    revalidatePath("/messages");
    revalidatePath(`/messages/${conversationId}`);
  }

  return { changed: result.changed, ok: true };
}
