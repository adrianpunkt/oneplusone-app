export type JsonObject = Record<string, unknown>;

export type Member = {
  id: string;
  email: string | null;
  membership_status: "pending" | "active" | "cancelled";
  membership_source: string | null;
  membership_granted_at: string | null;
  referral_code_id: string | null;
  user_id: string | null;
};

export type ProfileRegistration = {
  id: string;
  user_id: string;
  status: "started" | "submitted";
  profile_json: JsonObject;
  contact_email: string | null;
  submitted_at: string | null;
  updated_at: string;
};

export type EventPreferences = {
  member_id: string;
  prefers_saturday_dinner: boolean;
  prefers_sunday_brunch: boolean;
  dietary_restrictions: string | null;
  wants_to_host: boolean;
  host_notes: string | null;
  extra_preferences: JsonObject;
};

export type CreditProduct = {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  price_amount_cents: number;
  currency: string;
  stripe_price_id: string | null;
  status: "active" | "archived";
  sort_order: number;
};

export type CreditLedgerEntry = {
  id: string;
  member_id: string;
  delta: number;
  reason: string;
  source_type: string;
  source_id: string;
  notes: string | null;
  created_at: string;
};

export type EventRecord = {
  id: string;
  title: string;
  description: string | null;
  event_format: "dinner" | "brunch" | "other";
  status: "draft" | "inviting" | "confirmed" | "completed" | "cancelled";
  starts_at: string;
  ends_at: string | null;
  city: string | null;
  venue_name: string | null;
  venue_address: string | null;
  capacity: number | null;
  member_notes: string | null;
};

export type EventInvitation = {
  id: string;
  event_id: string;
  member_id: string;
  status: "invited" | "confirmed" | "waitlisted" | "declined" | "cancelled" | "expired";
  invited_at: string;
  responded_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  events?: EventRecord | null;
};

export type EventAttendee = {
  id: string;
  event_id: string;
  member_id: string;
  invitation_id: string | null;
  status: "confirmed" | "attended" | "host" | "no_show" | "cancelled";
  is_host: boolean;
  events?: EventRecord | null;
};

export type Conversation = {
  id: string;
  event_id: string;
  initiated_by_member_id: string;
  recipient_member_id: string;
  status: "pending" | "open" | "closed";
  created_at: string;
  updated_at: string;
  events?: EventRecord | null;
  correspondent?: {
    id: string;
    imageUrl: string;
    name: string;
    thumbnailUrl: string;
  } | null;
  lastMessage?: {
    createdAt: string;
    direction: "sent" | "received";
    isUnread: boolean;
  } | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_member_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type NotificationRecord = {
  id: string;
  member_id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};
