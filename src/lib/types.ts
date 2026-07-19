export type JsonObject = Record<string, unknown>;

export type Member = {
  id: string;
  email: string | null;
  membership_status: "pending" | "active" | "cancelled";
  membership_source: string | null;
  membership_granted_at: string | null;
  preferred_locale: "en" | "es" | null;
  referral_code_id: string | null;
  user_id: string | null;
};

export type ProfileRegistration = {
  id: string;
  user_id: string;
  status: "started" | "submitted";
  profile_json: JsonObject;
  locale: "en" | "es";
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
  localized_content: JsonObject;
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
  localized_content: JsonObject;
  language_code: "en" | "es" | null;
  event_format: "dinner" | "brunch" | "other";
  status: "draft" | "inviting" | "confirmed" | "completed" | "cancelled";
  starts_at: string;
  ends_at: string | null;
  city: string | null;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  restaurant_image_url: string | null;
  event_instructions: string | null;
  capacity: number;
  invitation_limit: number;
  credit_cost: number;
  minimum_confirmed_count: number;
  minimum_run_count: number;
  invitation_send_at: string | null;
  rsvp_deadline_at: string;
  prepared_at: string | null;
  invitations_opened_at: string | null;
  venue_confirmed_at: string | null;
  confirmation_released_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  member_notes: string | null;
};

export type InvitationResponseStatus = "invited" | "accepted" | "declined" | "expired";
export type InvitationSeatStatus =
  | "none"
  | "held"
  | "confirmed"
  | "waitlisted"
  | "cancelled"
  | "replaced";
export type InvitationPaymentStatus = "not_required" | "pending" | "paid" | "failed" | "expired";
export type InvitationWaitlistReason = "capacity" | "balance" | "payment_hold_expired" | null;

export type EventInvitation = {
  id: string;
  event_id: string;
  member_id: string;
  status: "invited" | "confirmed" | "waitlisted" | "declined" | "cancelled" | "expired";
  response_status: InvitationResponseStatus;
  seat_status: InvitationSeatStatus;
  payment_status: InvitationPaymentStatus;
  waitlist_reason: InvitationWaitlistReason;
  priority_at: string | null;
  member_status_at_invite: "active" | "pending";
  held_at: string | null;
  waitlisted_at: string | null;
  payment_completed_at: string | null;
  invited_at: string;
  responded_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  replacement_found?: boolean;
  response_mode?: "apply_waitlist" | "closed" | "confirm" | "waitlist";
  events?: EventRecord | null;
};

export type EventSummarySnapshot = {
  event_id: string;
  stage: "proposed" | "confirmed";
  age_min: number | null;
  age_max: number | null;
  primary_language: "en" | "es" | null;
  additional_languages: string[];
  majority_intention: string | null;
  source_count: number;
};

export type EventHost = {
  event_id: string;
  member_id: string;
  invitation_id: string;
  public_intro: string | null;
  assigned_at: string;
  first_name?: string;
};

export type EventMaterial = {
  id: string;
  event_id: string;
  locale: "en" | "es";
  kind: "host_guide" | "questions_pdf" | "event_guide";
  version: string;
  public_url: string;
};

export type EventFeedback = {
  id: string;
  event_id: string;
  member_id: string;
  submitted_at: string;
};

export type PublicInvitationSession = {
  ok: true;
  event: {
    id: string;
    startsAt: string;
    endsAt: string | null;
    timezone: string;
    city: string | null;
    eventFormat: "dinner" | "brunch" | "other";
    languageCode: "en" | "es" | null;
    ageRange: { min: number | null; max: number | null };
    majorityIntention: string | null;
    additionalLanguages: string[];
    preferenceNudge: boolean;
    rsvpDeadlineAt: string;
    creditCost: number;
  };
  invitation: {
    responseStatus: InvitationResponseStatus;
    seatStatus: InvitationSeatStatus;
    paymentStatus: InvitationPaymentStatus;
    waitlistReason: InvitationWaitlistReason;
    priorityAt: string | null;
  };
  canApply: boolean;
  locale: "en" | "es";
};

export type PublicEventPaymentResult = {
  ok: boolean;
  status: "confirmed" | "waitlisted" | "payment_pending" | "failed";
  eventId: string;
  seatStatus: "confirmed" | "waitlisted" | "held" | "none";
  paymentStatus: "pending" | "paid" | "failed" | "expired";
  waitlistReason: InvitationWaitlistReason;
  creditAvailable: boolean;
  loginNext: string;
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

export type EventGroupGender = "female" | "male" | "other" | "unspecified";

export type EventGroupSummary = {
  additionalLanguages: string[];
  ageMax: number | null;
  ageMin: number | null;
  approved: boolean;
  genderShares: Array<{
    gender: EventGroupGender;
    percentage: number;
  }>;
  participantCount: number | null;
  participantMax: number;
  participantMin: number;
  majorityIntention: string | null;
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
  localized_content: JsonObject | null;
  read_at: string | null;
  created_at: string;
};
