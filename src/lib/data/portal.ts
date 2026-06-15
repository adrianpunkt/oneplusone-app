import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { profileImageUrl } from "@/lib/profile-image";
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
  JsonObject,
} from "@/lib/types";
import { storyValue } from "@/lib/utils";

type WithEventRelation<T> = T & { events?: EventRecord | EventRecord[] | null };
type MemberLookupRow = { id: string; email: string | null; email_norm: string | null };
type ProfileLookupRow = {
  contact_email_norm: string | null;
  profile_json: JsonObject | null;
  updated_at: string;
};
type MessageLookupRow = {
  conversation_id: string;
  sender_member_id: string;
  created_at: string;
};
type ParticipantLookupRow = {
  conversation_id: string;
  last_read_at: string | null;
};

function normalizeEventRelation<T extends { events?: EventRecord | null }>(
  row: WithEventRelation<Omit<T, "events">>,
): T {
  const event = Array.isArray(row.events) ? row.events[0] || null : row.events || null;
  return { ...row, events: event } as T;
}

function otherConversationMemberId(conversation: Conversation, memberId: string) {
  return conversation.initiated_by_member_id === memberId
    ? conversation.recipient_member_id
    : conversation.initiated_by_member_id;
}

function fallbackMemberName(email: string | null | undefined) {
  return email?.split("@")[0].replace(/[._-]+/g, " ") || "Member";
}

function capitalizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, prefix: string, letter: string) =>
      `${prefix}${letter.toUpperCase()}`,
    );
}

async function attachCorrespondents(memberId: string, conversations: Conversation[]) {
  if (!conversations.length) return conversations;

  const correspondentIds = Array.from(
    new Set(conversations.map((conversation) => otherConversationMemberId(conversation, memberId))),
  );

  const serviceSupabase = getSupabaseServiceClient();
  const { data: memberData } = await serviceSupabase
    .from("members")
    .select("id,email,email_norm")
    .in("id", correspondentIds);
  const members = (memberData || []) as MemberLookupRow[];
  const emailNorms = members
    .map((member) => member.email_norm)
    .filter((emailNorm): emailNorm is string => Boolean(emailNorm));

  const profilesByEmailNorm = new Map<string, JsonObject>();
  if (emailNorms.length) {
    const { data: profileData } = await serviceSupabase
      .from("profile_registrations")
      .select("contact_email_norm,profile_json,updated_at")
      .eq("status", "submitted")
      .in("contact_email_norm", emailNorms)
      .order("updated_at", { ascending: false });
    const profiles = (profileData || []) as ProfileLookupRow[];

    for (const profile of profiles) {
      if (profile.contact_email_norm && !profilesByEmailNorm.has(profile.contact_email_norm)) {
        profilesByEmailNorm.set(profile.contact_email_norm, profile.profile_json || {});
      }
    }
  }

  const correspondentsById = new Map(
    members.map((member) => {
      const profileJson = member.email_norm
        ? profilesByEmailNorm.get(member.email_norm) || null
        : null;
      const name =
        storyValue(profileJson, "profile.first_name") || fallbackMemberName(member.email);

      return [
        member.id,
        {
          id: member.id,
          imageUrl: profileImageUrl(profileJson),
          name: capitalizeName(name),
        },
      ];
    }),
  );

  return conversations.map((conversation) => {
    const correspondentId = otherConversationMemberId(conversation, memberId);
    return {
      ...conversation,
      correspondent: correspondentsById.get(correspondentId) || {
        id: correspondentId,
        imageUrl: "",
        name: "Member",
      },
    };
  });
}

async function attachLastMessages(memberId: string, conversations: Conversation[]) {
  if (!conversations.length) return conversations;

  const conversationIds = conversations.map((conversation) => conversation.id);
  const serviceSupabase = getSupabaseServiceClient();
  const [{ data }, { data: participantData }] = await Promise.all([
    serviceSupabase
      .from("messages")
      .select("conversation_id,sender_member_id,created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
    serviceSupabase
      .from("conversation_participants")
      .select("conversation_id,last_read_at")
      .eq("member_id", memberId)
      .in("conversation_id", conversationIds),
  ]);
  const messages = (data || []) as MessageLookupRow[];
  const participants = (participantData || []) as ParticipantLookupRow[];
  const latestByConversationId = new Map<string, MessageLookupRow>();
  const lastReadAtByConversationId = new Map(
    participants.map((participant) => [
      participant.conversation_id,
      participant.last_read_at,
    ]),
  );

  for (const message of messages) {
    if (!latestByConversationId.has(message.conversation_id)) {
      latestByConversationId.set(message.conversation_id, message);
    }
  }

  return conversations.map((conversation) => {
    const lastMessage = latestByConversationId.get(conversation.id);
    const direction: "sent" | "received" =
      lastMessage?.sender_member_id === memberId ? "sent" : "received";
    const lastReadAt = lastReadAtByConversationId.get(conversation.id);
    const isUnread =
      lastMessage !== undefined &&
      direction === "received" &&
      (!lastReadAt || new Date(lastMessage.created_at) > new Date(lastReadAt));

    return {
      ...conversation,
      lastMessage: lastMessage
        ? {
            createdAt: lastMessage.created_at,
            direction,
            isUnread,
          }
        : null,
    };
  });
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

export async function getConversations(
  memberId: string,
  options: { includeCorrespondents?: boolean; includeLastMessage?: boolean } = {},
) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id,event_id,initiated_by_member_id,recipient_member_id,status,created_at,updated_at,events(id,title,description,event_format,status,starts_at,ends_at,city,venue_name,venue_address,capacity,member_notes)",
    )
    .or(`initiated_by_member_id.eq.${memberId},recipient_member_id.eq.${memberId}`)
    .order("updated_at", { ascending: false });

  const conversations = ((data || []) as unknown as WithEventRelation<Conversation>[]).map((row) =>
    normalizeEventRelation<Conversation>(row),
  );

  let enrichedConversations = conversations;

  if (options.includeCorrespondents) {
    enrichedConversations = await attachCorrespondents(memberId, enrichedConversations);
  }

  if (options.includeLastMessage) {
    enrichedConversations = await attachLastMessages(memberId, enrichedConversations);
  }

  return enrichedConversations;
}

export async function getConversation(conversationId: string, memberId: string) {
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
  const normalizedConversation = conversation
    ? normalizeEventRelation<Conversation>(
        conversation as unknown as WithEventRelation<Conversation>,
      )
    : null;
  const enrichedConversation = normalizedConversation
    ? (await attachCorrespondents(memberId, [normalizedConversation]))[0] || normalizedConversation
    : null;

  return {
    conversation: enrichedConversation,
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
