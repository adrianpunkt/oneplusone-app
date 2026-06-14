import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Conversation,
  CreditLedgerEntry,
  CreditProduct,
  EventAttendee,
  EventInvitation,
  EventPreferences,
  Message,
  NotificationRecord,
  EventRecord,
} from "@/lib/types";

type WithEventRelation<T> = T & { events?: EventRecord | EventRecord[] | null };

function normalizeEventRelation<T extends { events?: EventRecord | null }>(
  row: WithEventRelation<Omit<T, "events">>,
): T {
  const event = Array.isArray(row.events) ? row.events[0] || null : row.events || null;
  return { ...row, events: event } as T;
}

export async function getCreditBalance(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("member_credit_balances")
    .select("credit_balance")
    .eq("member_id", memberId)
    .maybeSingle();

  return Number(data?.credit_balance || 0);
}

export async function getCreditLedger(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("credit_ledger_entries")
    .select("id,member_id,delta,reason,source_type,source_id,notes,created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data || []) as CreditLedgerEntry[];
}

export async function getCreditProducts() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("credit_products")
    .select("id,name,description,credits,price_amount_cents,currency,stripe_price_id,status,sort_order")
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  return (data || []) as CreditProduct[];
}

export async function getReferralCode(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("benefit_codes")
    .select("code")
    .eq("owner_member_id", memberId)
    .eq("type", "referral")
    .maybeSingle();

  return data?.code || null;
}

export async function getPreferences(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("member_event_preferences")
    .select(
      "member_id,prefers_saturday_dinner,prefers_sunday_brunch,dietary_restrictions,wants_to_host,host_notes,extra_preferences",
    )
    .eq("member_id", memberId)
    .maybeSingle();

  return data as EventPreferences | null;
}

export async function getInvitations(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_invitations")
    .select(
      "id,event_id,member_id,status,invited_at,responded_at,confirmed_at,cancelled_at,notes,events(id,title,description,event_format,status,starts_at,ends_at,city,venue_name,venue_address,capacity,member_notes)",
    )
    .eq("member_id", memberId)
    .order("invited_at", { ascending: false });

  return ((data || []) as unknown as WithEventRelation<EventInvitation>[]).map((row) =>
    normalizeEventRelation<EventInvitation>(row),
  );
}

export async function getAttendedEvents(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_attendees")
    .select(
      "id,event_id,member_id,invitation_id,status,is_host,events(id,title,description,event_format,status,starts_at,ends_at,city,venue_name,venue_address,capacity,member_notes)",
    )
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  return ((data || []) as unknown as WithEventRelation<EventAttendee>[]).map((row) =>
    normalizeEventRelation<EventAttendee>(row),
  );
}

export async function getEventDetail(eventId: string, memberId: string) {
  const invitations = await getInvitations(memberId);
  const attendees = await getAttendedEvents(memberId);
  const invitation = invitations.find((item) => item.event_id === eventId) || null;
  const attendee = attendees.find((item) => item.event_id === eventId) || null;
  const event = invitation?.events || attendee?.events || null;

  const supabase = await createSupabaseServerClient();
  const { data: eventAttendees } = await supabase.rpc("get_past_event_attendees", {
    p_event_id: eventId,
  });

  return {
    attendee,
    event,
    eventAttendees: (eventAttendees || []) as Array<{ member_id: string; first_name: string }>,
    invitation,
  };
}

export async function getConversations(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id,event_id,initiated_by_member_id,recipient_member_id,status,created_at,updated_at,events(id,title,description,event_format,status,starts_at,ends_at,city,venue_name,venue_address,capacity,member_notes)",
    )
    .or(`initiated_by_member_id.eq.${memberId},recipient_member_id.eq.${memberId}`)
    .order("updated_at", { ascending: false });

  return ((data || []) as unknown as WithEventRelation<Conversation>[]).map((row) =>
    normalizeEventRelation<Conversation>(row),
  );
}

export async function getConversation(conversationId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: conversation }, { data: messages }] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id,event_id,initiated_by_member_id,recipient_member_id,status,created_at,updated_at,events(id,title,description,event_format,status,starts_at,ends_at,city,venue_name,venue_address,capacity,member_notes)",
      )
      .eq("id", conversationId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id,conversation_id,sender_member_id,body,created_at,edited_at,deleted_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    conversation: conversation
      ? normalizeEventRelation<Conversation>(
          conversation as unknown as WithEventRelation<Conversation>,
        )
      : null,
    messages: (messages || []) as Message[],
  };
}

export async function getUnreadNotifications(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id,member_id,type,title,body,href,read_at,created_at")
    .eq("member_id", memberId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data || []) as NotificationRecord[];
}
