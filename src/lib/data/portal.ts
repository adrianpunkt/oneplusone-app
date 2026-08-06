import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";
import { profileImageThumbnailUrl, profileImageUrl } from "@/lib/profile-image";
import type {
  Conversation,
  CreditLedgerEntry,
  CreditProduct,
  EventAttendee,
  EventGroupSummary,
  EventFeedback,
  EventHost,
  EventInvitation,
  EventMaterial,
  EventPreferences,
  Message,
  NotificationRecord,
  EventRecord,
  JsonObject,
  PostEventCreditOffer,
} from "@/lib/types";
import { currentHostPackageMaterials } from "@/lib/events/host-package-visibility";
import { eventRelationshipIntention } from "@/lib/events/relationship-intention";
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
type ParticipantArchiveLookupRow = {
  archived_at: string | null;
  conversation_id: string;
};
type ConversationFeedbackLookupRow = {
  event_id: string;
  id: string;
};
type EventFeedbackLookupRow = {
  attended: boolean;
  event_id: string;
  submitted_at: string;
};
type EventInvitationLookupRow = {
  cancelled_at: string | null;
  event_id: string;
  seat_status: string;
};
type RecipientConversationFeedbackState = {
  feedbackIneligibleConversationIds: ReadonlySet<string>;
  feedbackLockedConversationIds: ReadonlySet<string>;
  feedbackSubmittedAtByConversationId: ReadonlyMap<string, string>;
  recipientConversationIds: ReadonlySet<string>;
};
type PastEventAttendee = {
  first_name: string;
  imageUrl: string;
  member_id: string;
  thumbnailUrl: string;
};
type PastEventAttendeeRow = Pick<
  PastEventAttendee,
  "first_name" | "member_id"
>;
type InvitationResponseModeRow = {
  invitation_id: string;
  response_mode: "apply_waitlist" | "closed" | "confirm" | "waitlist";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_FIELDS = "id,title,description,localized_content,language_code,event_format,status,starts_at,ends_at,timezone,city,capacity,invitation_limit,credit_cost,minimum_confirmed_count,minimum_run_count,gender_balance_enabled,invitation_send_at,rsvp_deadline_at,prepared_at,invitations_opened_at,venue_confirmed_at,confirmation_released_at,completed_at,cancelled_at,cancellation_reason";

type ReleasedVenue = Pick<
  EventRecord,
  "confirmation_released_at" | "id" | "venue_address" | "venue_name"
>;

type ConfirmedInvitationVenueRow = {
  event_id: string;
  events: ReleasedVenue | ReleasedVenue[] | null;
};

function normalizeEventRelation<T extends { events?: EventRecord | null }>(
  row: WithEventRelation<Omit<T, "events">>,
): T {
  const event = Array.isArray(row.events) ? row.events[0] || null : row.events || null;
  return { ...row, events: event } as T;
}

async function attachReleasedVenues<
  T extends { event_id: string; events?: EventRecord | null },
>(memberId: string, items: T[]) {
  const releasedEventIds = Array.from(
    new Set(
      items
        .filter((item) => item.events?.confirmation_released_at)
        .map((item) => item.event_id)
        .filter((eventId) => UUID_PATTERN.test(eventId)),
    ),
  );
  if (!releasedEventIds.length) return items;

  const { data, error } = await getSupabaseServiceClient()
    .from("event_invitations")
    .select(
      "event_id,events!inner(id,venue_name,venue_address,confirmation_released_at)",
    )
    .eq("member_id", memberId)
    .eq("seat_status", "confirmed")
    .in("event_id", releasedEventIds);

  if (error) {
    throw new Error(`Unable to load released event venues: ${error.message}`);
  }

  const venuesByEventId = new Map<string, ReleasedVenue>();
  for (const row of (data || []) as unknown as ConfirmedInvitationVenueRow[]) {
    const venue = Array.isArray(row.events) ? row.events[0] : row.events;
    if (venue?.confirmation_released_at) {
      venuesByEventId.set(row.event_id, venue);
    }
  }

  return items.map((item) => {
    const venue = venuesByEventId.get(item.event_id);
    if (!venue || !item.events) return item;

    return {
      ...item,
      events: { ...item.events, ...venue },
    };
  });
}

function otherConversationMemberId(conversation: Conversation, memberId: string) {
  return conversation.initiated_by_member_id === memberId
    ? conversation.recipient_member_id
    : conversation.initiated_by_member_id;
}

function fallbackMemberName() {
  return "Member";
}

function capitalizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, prefix: string, letter: string) =>
      `${prefix}${letter.toUpperCase()}`,
    );
}

function messageNotificationConversationId(notification: NotificationRecord) {
  if (notification.type !== "message" || !notification.href) return null;

  const match = notification.href.match(/^\/messages\/([^/?#]+)$/);
  const conversationId = match?.[1];

  return conversationId && UUID_PATTERN.test(conversationId) ? conversationId : null;
}

async function getRecipientConversationFeedbackState(
  memberId: string,
): Promise<RecipientConversationFeedbackState> {
  const emptyState: RecipientConversationFeedbackState = {
    feedbackIneligibleConversationIds: new Set(),
    feedbackLockedConversationIds: new Set(),
    feedbackSubmittedAtByConversationId: new Map(),
    recipientConversationIds: new Set(),
  };
  const serviceSupabase = getSupabaseServiceClient();
  const { data: conversationData, error: conversationError } =
    await serviceSupabase
      .from("conversations")
      .select("id,event_id")
      .eq("recipient_member_id", memberId);

  if (conversationError) return emptyState;

  const conversations = (conversationData || []) as ConversationFeedbackLookupRow[];
  const eventIds = Array.from(
    new Set(conversations.map((conversation) => conversation.event_id)),
  );
  if (!eventIds.length) return emptyState;

  const [{ data: feedbackData, error: feedbackError }, { data: invitationData, error: invitationError }] =
    await Promise.all([
      serviceSupabase
        .from("event_feedback")
        .select("event_id,attended,submitted_at")
        .eq("member_id", memberId)
        .in("event_id", eventIds),
      serviceSupabase
        .from("event_invitations")
        .select("event_id,seat_status,cancelled_at")
        .eq("member_id", memberId)
        .in("event_id", eventIds),
    ]);

  if (feedbackError || invitationError) return emptyState;

  const feedbackByEventId = new Map(
    ((feedbackData || []) as EventFeedbackLookupRow[]).map((feedback) => [
      feedback.event_id,
      feedback,
    ]),
  );
  const eligibleInvitationEventIds = new Set(
    ((invitationData || []) as EventInvitationLookupRow[])
      .filter(
        (invitation) =>
          invitation.seat_status === "confirmed" && !invitation.cancelled_at,
      )
      .map((invitation) => invitation.event_id),
  );
  const eligibleConversations = conversations.filter((conversation) =>
    eligibleInvitationEventIds.has(conversation.event_id),
  );
  const feedbackLockedConversationIds = new Set<string>();
  const feedbackIneligibleConversationIds = new Set<string>();
  const feedbackSubmittedAtByConversationId = new Map<string, string>();

  for (const conversation of eligibleConversations) {
    const feedback = feedbackByEventId.get(conversation.event_id);

    if (!feedback) {
      feedbackLockedConversationIds.add(conversation.id);
    } else if (!feedback.attended) {
      feedbackIneligibleConversationIds.add(conversation.id);
    } else {
      feedbackSubmittedAtByConversationId.set(
        conversation.id,
        feedback.submitted_at,
      );
    }
  }

  return {
    feedbackIneligibleConversationIds,
    feedbackLockedConversationIds,
    feedbackSubmittedAtByConversationId,
    recipientConversationIds: new Set(
      eligibleConversations.map((conversation) => conversation.id),
    ),
  };
}

function isIncomingMessageUnread({
  conversationId,
  feedbackState,
  lastReadAt,
  latestMessage,
  memberId,
}: {
  conversationId: string;
  feedbackState: RecipientConversationFeedbackState;
  lastReadAt: string | null | undefined;
  latestMessage: MessageLookupRow;
  memberId: string;
}) {
  if (
    latestMessage.sender_member_id === memberId ||
    feedbackState.feedbackIneligibleConversationIds.has(conversationId)
  ) {
    return false;
  }

  const feedbackSubmittedAt =
    feedbackState.feedbackSubmittedAtByConversationId.get(conversationId);
  const wasReadBeforeFeedback =
    lastReadAt !== null &&
    lastReadAt !== undefined &&
    feedbackSubmittedAt !== undefined &&
    new Date(lastReadAt) < new Date(feedbackSubmittedAt);

  return (
    feedbackState.feedbackLockedConversationIds.has(conversationId) ||
    wasReadBeforeFeedback ||
    !lastReadAt ||
    new Date(latestMessage.created_at) > new Date(lastReadAt)
  );
}

async function getUnreadConversationIds(
  memberId: string,
  conversationIds: string[],
  feedbackState: RecipientConversationFeedbackState,
) {
  if (!conversationIds.length) return new Set<string>();

  const serviceSupabase = getSupabaseServiceClient();
  const [{ data: messageData, error: messageError }, { data: participantData, error: participantError }] =
    await Promise.all([
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

  if (messageError || participantError) return new Set(conversationIds);

  const latestByConversationId = new Map<string, MessageLookupRow>();
  const lastReadAtByConversationId = new Map(
    ((participantData || []) as ParticipantLookupRow[]).map((participant) => [
      participant.conversation_id,
      participant.last_read_at,
    ]),
  );

  for (const message of (messageData || []) as MessageLookupRow[]) {
    if (!latestByConversationId.has(message.conversation_id)) {
      latestByConversationId.set(message.conversation_id, message);
    }
  }

  return new Set(
    conversationIds.filter((conversationId) => {
      const latestMessage = latestByConversationId.get(conversationId);
      const isParticipant = lastReadAtByConversationId.has(conversationId);
      const lastReadAt = lastReadAtByConversationId.get(conversationId);

      return (
        isParticipant &&
        latestMessage !== undefined &&
        isIncomingMessageUnread({
          conversationId,
          feedbackState,
          lastReadAt,
          latestMessage,
          memberId,
        })
      );
    }),
  );
}

async function filterStaleMessageNotifications(
  memberId: string,
  notifications: NotificationRecord[],
  feedbackState: RecipientConversationFeedbackState,
) {
  const conversationIds = Array.from(
    new Set(
      notifications
        .map(messageNotificationConversationId)
        .filter((conversationId): conversationId is string => Boolean(conversationId)),
    ),
  );

  if (!conversationIds.length) return notifications;

  const unreadConversationIds = await getUnreadConversationIds(
    memberId,
    conversationIds,
    feedbackState,
  );

  return notifications.filter((notification) => {
    const conversationId = messageNotificationConversationId(notification);

    return conversationId
      ? unreadConversationIds.has(conversationId)
      : !notification.read_at;
  });
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
        storyValue(profileJson, "profile.first_name") || fallbackMemberName();

      return [
        member.id,
        {
          id: member.id,
          imageUrl: profileImageUrl(profileJson),
          name: capitalizeName(name),
          thumbnailUrl: profileImageThumbnailUrl(profileJson),
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
        thumbnailUrl: "",
      },
    };
  });
}

async function attachPastEventAttendeeImages(
  attendees: PastEventAttendeeRow[],
): Promise<PastEventAttendee[]> {
  if (!attendees.length) return [];

  const serviceSupabase = getSupabaseServiceClient();
  const { data: memberData } = await serviceSupabase
    .from("members")
    .select("id,email,email_norm")
    .in(
      "id",
      attendees.map((attendee) => attendee.member_id),
    );
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
      if (
        profile.contact_email_norm &&
        !profilesByEmailNorm.has(profile.contact_email_norm)
      ) {
        profilesByEmailNorm.set(
          profile.contact_email_norm,
          profile.profile_json || {},
        );
      }
    }
  }

  const profilesByMemberId = new Map(
    members.map((member) => [
      member.id,
      member.email_norm
        ? profilesByEmailNorm.get(member.email_norm) || null
        : null,
    ]),
  );

  return attendees.map((attendee) => {
    const profileJson = profilesByMemberId.get(attendee.member_id) || null;

    return {
      ...attendee,
      imageUrl: profileImageUrl(profileJson),
      thumbnailUrl: profileImageThumbnailUrl(profileJson),
    };
  });
}

async function attachLastMessages(memberId: string, conversations: Conversation[]) {
  if (!conversations.length) return conversations;

  const conversationIds = conversations.map((conversation) => conversation.id);
  const serviceSupabase = getSupabaseServiceClient();
  const [{ data }, { data: participantData }, feedbackState] = await Promise.all([
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
    getRecipientConversationFeedbackState(memberId),
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

  return conversations.flatMap((conversation) => {
    const lastMessage = latestByConversationId.get(conversation.id);
    if (!lastMessage) return [];

    const direction: "sent" | "received" =
      lastMessage.sender_member_id === memberId ? "sent" : "received";
    const lastReadAt = lastReadAtByConversationId.get(conversation.id);
    const isUnread = isIncomingMessageUnread({
      conversationId: conversation.id,
      feedbackState,
      lastReadAt,
      latestMessage: lastMessage,
      memberId,
    });

    return [
      {
        ...conversation,
        lastMessage: {
          createdAt: lastMessage.created_at,
          direction,
          isUnread,
        },
      },
    ];
  });
}

async function attachConversationParticipantState(
  memberId: string,
  conversations: Conversation[],
) {
  if (!conversations.length) return conversations;

  const serviceSupabase = getSupabaseServiceClient();
  const { data, error } = await serviceSupabase
    .from("conversation_participants")
    .select("conversation_id,archived_at")
    .eq("member_id", memberId)
    .in(
      "conversation_id",
      conversations.map((conversation) => conversation.id),
    );

  if (error) {
    console.error("Could not load conversation archive state", {
      code: error.code,
      memberId,
      message: error.message,
    });
    throw new Error("Could not load conversation archive state.");
  }

  const archivedAtByConversationId = new Map(
    ((data || []) as ParticipantArchiveLookupRow[]).map((participant) => [
      participant.conversation_id,
      participant.archived_at,
    ]),
  );

  return conversations.map((conversation) => ({
    ...conversation,
    archived_at: archivedAtByConversationId.get(conversation.id) || null,
  }));
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
    .select("id,name,description,localized_content,credits,price_amount_cents,currency,stripe_price_id,status,sort_order,offer_type")
    .eq("status", "active")
    .eq("offer_type", "standard")
    .order("sort_order", { ascending: true });

  return (data || []) as CreditProduct[];
}

type PostEventCreditOfferRow = {
  product_id: string;
  product_name: string;
  product_description: string | null;
  product_localized_content: JsonObject;
  product_credits: number;
  product_price_amount_cents: number;
  product_currency: string;
  product_stripe_price_id: string | null;
  product_status: "active" | "archived";
  product_sort_order: number;
  product_offer_type: "post_event_48h";
  offer_event_id: string;
  offer_event_timezone: string;
  offer_expires_at: string;
};

export async function getPostEventCreditOffer(): Promise<PostEventCreditOffer | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_current_post_event_credit_offer");
  if (error) {
    console.error("Could not load post-event credit offer", error);
    return null;
  }

  const row = ((data || []) as PostEventCreditOfferRow[])[0];
  if (!row) return null;

  return {
    product: {
      id: row.product_id,
      name: row.product_name,
      description: row.product_description,
      localized_content: row.product_localized_content,
      credits: row.product_credits,
      price_amount_cents: row.product_price_amount_cents,
      currency: row.product_currency,
      stripe_price_id: row.product_stripe_price_id,
      status: row.product_status,
      sort_order: row.product_sort_order,
      offer_type: row.product_offer_type,
    },
    eventId: row.offer_event_id,
    eventTimezone: row.offer_event_timezone,
    expiresAt: row.offer_expires_at,
  };
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

export async function hasReferralCodeSignup(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("benefit_code_redemptions")
    .select("id")
    .eq("referrer_member_id", memberId)
    .eq("code_type", "referral")
    .in("status", ["pending_payment", "completed"])
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

export async function hasReceivedEventInvitation(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_invitations")
    .select("id")
    .eq("member_id", memberId)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

export async function hasConfirmedEventInvitation(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_invitations")
    .select("id")
    .eq("member_id", memberId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

export async function hasSentMessage(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("sender_member_id", memberId)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

export async function hasAttendedSecondEvent(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_attendees")
    .select("id")
    .eq("member_id", memberId)
    .in("status", ["attended", "host"])
    .limit(2);

  return (data?.length || 0) >= 2;
}

export async function getPreferences(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("member_event_preferences")
    .select(
      "member_id,receives_event_invitations,prefers_saturday_dinner,prefers_sunday_brunch,dietary_restrictions,wants_to_host,host_notes,extra_preferences",
    )
    .eq("member_id", memberId)
    .maybeSingle();

  return data as EventPreferences | null;
}

export async function getInvitations(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: responseModeData }] = await Promise.all([
    supabase
      .from("event_invitations")
      .select(
        `id,event_id,member_id,status,response_status,seat_status,payment_status,waitlist_reason,priority_at,member_status_at_invite,held_at,waitlisted_at,payment_completed_at,invited_at,responded_at,confirmed_at,cancelled_at,notes,events(${EVENT_FIELDS})`,
      )
      .eq("member_id", memberId)
      .order("invited_at", { ascending: false }),
    supabase.rpc("get_event_invitation_response_modes"),
  ]);

  const responseModes = new Map(
    ((responseModeData || []) as InvitationResponseModeRow[]).map((row) => [
      row.invitation_id,
      row.response_mode,
    ]),
  );

  const normalizedInvitations = (
    (data || []) as unknown as WithEventRelation<EventInvitation>[]
  ).map((row) => {
    const invitation = normalizeEventRelation<EventInvitation>(row);
    return {
      ...invitation,
      response_mode: responseModes.get(invitation.id),
    };
  });
  const invitations = await attachReleasedVenues(memberId, normalizedInvitations);
  const cancelledInvitationIds = invitations
    .filter(
      (invitation) =>
        invitation.status === "cancelled" && Boolean(invitation.confirmed_at),
    )
    .map((invitation) => invitation.id);

  if (!cancelledInvitationIds.length) return invitations;

  const { data: replacementRefunds } = await supabase
    .from("credit_ledger_entries")
    .select("source_id")
    .eq("member_id", memberId)
    .eq("reason", "event_waitlist_replacement_refund")
    .eq("source_type", "event_invitation")
    .in("source_id", cancelledInvitationIds);
  const replacedInvitationIds = new Set(
    (replacementRefunds || []).map((entry) => entry.source_id).filter(Boolean),
  );

  return invitations.map((invitation) => ({
    ...invitation,
    replacement_found: replacedInvitationIds.has(invitation.id),
  }));
}

export async function getAttendedEvents(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_attendees")
    .select(
      `id,event_id,member_id,invitation_id,status,is_host,events(${EVENT_FIELDS})`,
    )
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  return attachReleasedVenues(
    memberId,
    ((data || []) as unknown as WithEventRelation<EventAttendee>[]).map((row) =>
      normalizeEventRelation<EventAttendee>(row),
    ),
  );
}

export async function getHostedEventPackages(
  memberId: string,
  events: Array<{ id: string; languageCode: "en" | "es" }>,
) {
  const eventLanguageById = new Map(
    events
      .filter((event) => UUID_PATTERN.test(event.id))
      .map((event) => [event.id, event.languageCode]),
  );
  const eventIds = Array.from(eventLanguageById.keys());
  if (!eventIds.length) return new Map<string, string | null>();

  const serviceSupabase = getSupabaseServiceClient();
  const { data: hostData, error: hostError } = await serviceSupabase
    .from("event_hosts")
    .select("event_id")
    .eq("member_id", memberId)
    .in("event_id", eventIds);

  if (hostError) throw new Error(`Unable to load host assignments: ${hostError.message}`);
  const hostedEventIds = Array.from(new Set((hostData || []).map((host) => host.event_id)));
  if (!hostedEventIds.length) return new Map<string, string | null>();

  const [questionSetResult, materialResult] = await Promise.all([
    serviceSupabase
      .from("event_question_sets")
      .select("event_id,revision")
      .in("event_id", hostedEventIds),
    serviceSupabase
      .from("event_materials")
      .select("id,event_id,locale,kind,version,public_url,storage_path,content_hash,byte_size,question_set_revision,source_snapshot,stale_at")
      .in("event_id", hostedEventIds)
      .eq("kind", "event_guide")
      .order("created_at", { ascending: false }),
  ]);
  if (questionSetResult.error || materialResult.error) {
    throw new Error(
      `Unable to load host packages: ${questionSetResult.error?.message || materialResult.error?.message}`,
    );
  }

  const revisionByEventId = new Map(
    (questionSetResult.data || []).map((questionSet) => [
      questionSet.event_id,
      questionSet.revision,
    ]),
  );
  const materials = (materialResult.data || []) as EventMaterial[];

  return new Map(hostedEventIds.map((eventId) => {
    const currentMaterial = currentHostPackageMaterials({
      currentRevision: revisionByEventId.get(eventId) || null,
      eventLanguage: eventLanguageById.get(eventId) || "en",
      isAssignedHost: true,
      materials: materials.filter((material) => material.event_id === eventId),
    })[0];
    return [eventId, currentMaterial?.public_url || null] as const;
  }));
}

export async function getEventGroupSummaries(
  events: Array<EventRecord | null | undefined>,
) {
  const uniqueEvents = Array.from(
    new Map(
      events
        .filter((event): event is EventRecord =>
          Boolean(event?.id && UUID_PATTERN.test(event.id)),
        )
        .map((event) => [event.id, event]),
    ).values(),
  );
  const summaries: Record<string, EventGroupSummary> = Object.fromEntries(
    uniqueEvents.map((event) => [event.id, emptyEventGroupSummary(event)]),
  );
  if (!uniqueEvents.length) return summaries;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_summary_snapshots")
    .select("event_id,stage,age_min,age_max,majority_intention,additional_languages,source_count")
    .in("event_id", uniqueEvents.map((event) => event.id));
  const snapshots = (data || []) as Array<{
    additional_languages: string[];
    age_max: number | null;
    age_min: number | null;
    event_id: string;
    majority_intention: string | null;
    source_count: number;
    stage: "proposed" | "confirmed";
  }>;

  for (const event of uniqueEvents) {
    const preferredStage = event.confirmation_released_at ? "confirmed" : "proposed";
    const snapshot = snapshots.find(
      (candidate) => candidate.event_id === event.id && candidate.stage === preferredStage,
    );
    const majorityIntention = eventRelationshipIntention(
      event.localized_content,
      snapshot?.majority_intention,
    );
    if (!snapshot) {
      summaries[event.id] = {
        ...summaries[event.id],
        majorityIntention,
      };
      continue;
    }
    summaries[event.id] = {
      ...summaries[event.id],
      additionalLanguages: snapshot.additional_languages || [],
      ageMax: snapshot.age_max,
      ageMin: snapshot.age_min,
      majorityIntention,
      participantCount: snapshot.source_count,
    };
  }

  return summaries;
}

function emptyEventGroupSummary(event: EventRecord): EventGroupSummary {
  return {
    ageMax: null,
    ageMin: null,
    approved: event.status === "confirmed" || event.status === "completed",
    genderShares: [],
    participantCount: null,
    participantMax: event.capacity,
    participantMin: event.minimum_confirmed_count,
    additionalLanguages: [],
    majorityIntention: null,
  };
}

export async function getEventDetail(eventId: string, memberId: string) {
  const invitations = await getInvitations(memberId);
  const attendees = await getAttendedEvents(memberId);
  const invitation = invitations.find((item) => item.event_id === eventId) || null;
  const attendee = attendees.find((item) => item.event_id === eventId) || null;
  let event = invitation?.events || attendee?.events || null;

  if (
    event?.confirmation_released_at &&
    invitation?.seat_status === "confirmed"
  ) {
    const { data: releasedDetails } = await getSupabaseServiceClient()
      .from("events")
      .select("venue_name,venue_address,restaurant_image_url,event_instructions,member_notes")
      .eq("id", eventId)
      .maybeSingle<Pick<
        EventRecord,
        "event_instructions" | "member_notes" | "restaurant_image_url" | "venue_address" | "venue_name"
      >>();
    if (releasedDetails) event = { ...event, ...releasedDetails };
  }

  const supabase = await createSupabaseServerClient();
  const [attendeeResult, hostResult, materialResult, feedbackResult, summaries] =
    await Promise.all([
      supabase.rpc("get_past_event_attendees", { p_event_id: eventId }),
      supabase
        .from("event_hosts")
        .select("event_id,member_id,invitation_id,public_intro,assigned_at")
        .eq("event_id", eventId)
        .maybeSingle<EventHost>(),
      supabase
        .from("event_materials")
        .select("id,event_id,locale,kind,version,public_url,storage_path,content_hash,byte_size,question_set_revision,source_snapshot,stale_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
      supabase
        .from("event_feedback")
        .select(
          "id,event_id,member_id,attended,wants_to_connect,connection_member_ids,submitted_at",
        )
        .eq("event_id", eventId)
        .eq("member_id", memberId)
        .maybeSingle<EventFeedback>(),
      event
        ? getEventGroupSummaries([event])
        : Promise.resolve({} as Record<string, EventGroupSummary>),
    ]);
  const host = hostResult.data
    ? await attachEventHostFirstName(hostResult.data as EventHost)
    : null;
  const isHost = host?.member_id === memberId;
  const questionSetResult = isHost
    ? await getSupabaseServiceClient()
      .from("event_question_sets")
      .select("revision")
      .eq("event_id", eventId)
      .maybeSingle<{ revision: number }>()
    : { data: null, error: null };
  if (questionSetResult.error) throw new Error(`Unable to load the host package revision: ${questionSetResult.error.message}`);
  const questionSetRevision = questionSetResult.data?.revision || null;
  const materials = currentHostPackageMaterials({
    currentRevision: questionSetRevision,
    eventLanguage: event?.language_code === "es" ? "es" : "en",
    isAssignedHost: isHost,
    materials: (materialResult.data || []) as EventMaterial[],
  });
  const eventAttendees = await attachPastEventAttendeeImages(
    (attendeeResult.data || []) as PastEventAttendeeRow[],
  );

  return {
    attendee,
    event,
    eventAttendees,
    feedback: (feedbackResult.data || null) as EventFeedback | null,
    host,
    isHost,
    invitation,
    materials,
    summary: event ? summaries[event.id] || emptyEventGroupSummary(event) : null,
  };
}

async function attachEventHostFirstName(host: EventHost): Promise<EventHost> {
  const serviceSupabase = getSupabaseServiceClient();
  const { data: member } = await serviceSupabase
    .from("members")
    .select("email_norm")
    .eq("id", host.member_id)
    .maybeSingle<{ email_norm: string | null }>();
  if (!member?.email_norm) return { ...host, first_name: "Host" };

  const { data: profile } = await serviceSupabase
    .from("profile_registrations")
    .select("profile_json")
    .eq("contact_email_norm", member.email_norm)
    .eq("status", "submitted")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ profile_json: JsonObject | null }>();
  const firstName = storyValue(profile?.profile_json, "profile.first_name");
  return { ...host, first_name: firstName ? capitalizeName(firstName) : "Host" };
}

export async function getConversations(
  memberId: string,
  options: {
    includeCorrespondents?: boolean;
    includeLastMessage?: boolean;
    includeParticipantState?: boolean;
  } = {},
) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      `id,event_id,initiated_by_member_id,recipient_member_id,status,created_at,updated_at,events(${EVENT_FIELDS})`,
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

  if (options.includeParticipantState) {
    enrichedConversations = await attachConversationParticipantState(
      memberId,
      enrichedConversations,
    );
  }

  return enrichedConversations;
}

export async function getCompletedEventFeedbackState(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const [invitationResult, feedbackResult] = await Promise.all([
    supabase
      .from("event_invitations")
      .select(`event_id,events(${EVENT_FIELDS})`)
      .eq("member_id", memberId)
      .eq("seat_status", "confirmed")
      .is("cancelled_at", null),
    supabase
      .from("event_feedback")
      .select("event_id,attended")
      .eq("member_id", memberId),
  ]);

  if (invitationResult.error || feedbackResult.error) {
    return {
      attendedEventIds: [] as string[],
      eventsAwaitingFeedback: [] as EventRecord[],
      submittedEventIds: [] as string[],
    };
  }

  const feedbackRows = (feedbackResult.data || []) as Array<
    Pick<EventFeedback, "attended" | "event_id">
  >;
  const submittedEventIds = new Set(
    feedbackRows.map((feedback) => feedback.event_id),
  );
  const attendedEventIds = new Set(
    feedbackRows
      .filter((feedback) => feedback.attended)
      .map((feedback) => feedback.event_id),
  );
  const invitations = (invitationResult.data || []) as unknown as Array<
    WithEventRelation<{ event_id: string }>
  >;

  const eventsAwaitingFeedback = invitations
    .map((invitation) => normalizeEventRelation(invitation).events)
    .filter(
      (event): event is EventRecord =>
        Boolean(
          event &&
            event.status === "completed" &&
            !submittedEventIds.has(event.id),
        ),
    )
    .sort(
      (left, right) =>
        new Date(right.starts_at).getTime() -
        new Date(left.starts_at).getTime(),
    );

  return {
    attendedEventIds: [...attendedEventIds],
    eventsAwaitingFeedback,
    submittedEventIds: [...submittedEventIds],
  };
}

export async function getCompletedEventsAwaitingFeedback(memberId: string) {
  const { eventsAwaitingFeedback } =
    await getCompletedEventFeedbackState(memberId);
  return eventsAwaitingFeedback;
}

export async function getConversationFeedbackGate(
  conversationId: string,
  memberId: string,
) {
  const serviceSupabase = getSupabaseServiceClient();
  const { data: conversation, error: conversationError } =
    await serviceSupabase
      .from("conversations")
      .select("id,event_id,initiated_by_member_id,recipient_member_id")
      .eq("id", conversationId)
      .maybeSingle<{
        event_id: string;
        id: string;
        initiated_by_member_id: string;
        recipient_member_id: string;
      }>();

  if (conversationError) {
    console.error("Could not check conversation feedback access", {
      code: conversationError.code,
      conversationId,
      message: conversationError.message,
    });
    throw new Error("Could not check conversation feedback access.");
  }
  if (
    !conversation ||
    (conversation.initiated_by_member_id !== memberId &&
      conversation.recipient_member_id !== memberId)
  ) {
    return null;
  }

  const [feedbackResult, invitationResult] = await Promise.all([
    serviceSupabase
      .from("event_feedback")
      .select("attended")
      .eq("event_id", conversation.event_id)
      .eq("member_id", memberId)
      .maybeSingle<{ attended: boolean }>(),
    serviceSupabase
      .from("event_invitations")
      .select("seat_status,cancelled_at")
      .eq("event_id", conversation.event_id)
      .eq("member_id", memberId)
      .maybeSingle<{
        cancelled_at: string | null;
        seat_status: string;
      }>(),
  ]);

  if (feedbackResult.error || invitationResult.error) {
    const error = feedbackResult.error || invitationResult.error;
    console.error("Could not check conversation feedback requirement", {
      code: error?.code,
      conversationId,
      message: error?.message,
    });
    throw new Error("Could not check conversation feedback requirement.");
  }

  const invitation = invitationResult.data;
  if (
    feedbackResult.data ||
    invitation?.seat_status !== "confirmed" ||
    invitation.cancelled_at
  ) {
    return null;
  }

  return {
    eventId: conversation.event_id,
  };
}

export async function getConversation(conversationId: string, memberId: string) {
  const supabase = await createSupabaseServerClient();
  const serviceSupabase = getSupabaseServiceClient();
  const [conversationResult, messagesResult, participantResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id,event_id,initiated_by_member_id,recipient_member_id,status,created_at,updated_at")
      .eq("id", conversationId)
      .or(`initiated_by_member_id.eq.${memberId},recipient_member_id.eq.${memberId}`)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id,conversation_id,sender_member_id,body,created_at,edited_at,deleted_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    serviceSupabase
      .from("conversation_participants")
      .select("conversation_id,archived_at")
      .eq("conversation_id", conversationId)
      .eq("member_id", memberId)
      .maybeSingle(),
  ]);

  if (conversationResult.error) {
    console.error("Could not load conversation", {
      code: conversationResult.error.code,
      conversationId,
      message: conversationResult.error.message,
    });
    throw new Error("Could not load conversation.");
  }
  if (messagesResult.error) {
    console.error("Could not load conversation messages", {
      code: messagesResult.error.code,
      conversationId,
      message: messagesResult.error.message,
    });
    throw new Error("Could not load conversation messages.");
  }
  if (participantResult.error) {
    console.error("Could not load conversation participant", {
      code: participantResult.error.code,
      conversationId,
      message: participantResult.error.message,
    });
    throw new Error("Could not load conversation participant.");
  }
  const conversation = conversationResult.data as Conversation | null;
  const enrichedConversation = conversation
    ? (await attachCorrespondents(memberId, [conversation]))[0] || conversation
    : null;

  return {
    conversation: enrichedConversation,
    messages: (messagesResult.data || []) as Message[],
    participant: participantResult.data as ParticipantArchiveLookupRow | null,
  };
}

export async function getUnreadNotifications(memberId: string) {
  const supabase = await createSupabaseServerClient();
  const feedbackState =
    await getRecipientConversationFeedbackState(memberId);
  const recipientConversationHrefs = Array.from(
    feedbackState.recipientConversationIds,
  ).map(
    (conversationId) => `/messages/${conversationId}`,
  );
  const notificationFields =
    "id,member_id,type,title,body,href,localized_content,read_at,created_at";

  const unreadQuery = supabase
    .from("notifications")
    .select(notificationFields)
    .eq("member_id", memberId)
    .eq("type", "message")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  const recipientConversationQuery = recipientConversationHrefs.length
    ? supabase
        .from("notifications")
        .select(notificationFields)
        .eq("member_id", memberId)
        .eq("type", "message")
        .in("href", recipientConversationHrefs)
        .order("created_at", { ascending: false })
        .limit(50)
    : Promise.resolve({ data: [] });
  const [{ data: unreadData }, { data: recipientConversationData }] =
    await Promise.all([unreadQuery, recipientConversationQuery]);
  const notificationsById = new Map<string, NotificationRecord>();

  for (const notification of [
    ...((unreadData || []) as NotificationRecord[]),
    ...((recipientConversationData || []) as NotificationRecord[]),
  ]) {
    notificationsById.set(notification.id, notification);
  }

  const notifications = Array.from(notificationsById.values()).sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );

  return (
    await filterStaleMessageNotifications(
      memberId,
      notifications,
      feedbackState,
    )
  ).slice(0, 10);
}
