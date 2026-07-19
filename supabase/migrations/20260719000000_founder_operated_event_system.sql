-- Founder-operated event lifecycle. This migration intentionally creates no
-- scheduler, cron job, or autonomous event transition.

create extension if not exists pgcrypto with schema extensions;

alter table public.members
  add column if not exists marketing_eligible boolean not null default false;

alter table public.events
  add column if not exists matching_group_id uuid,
  add column if not exists timezone text not null default 'Europe/Madrid',
  add column if not exists invitation_send_at timestamptz,
  add column if not exists rsvp_deadline_at timestamptz,
  add column if not exists minimum_confirmed_count integer not null default 6,
  add column if not exists minimum_run_count integer not null default 5,
  add column if not exists invitation_limit integer not null default 12,
  add column if not exists credit_cost integer not null default 1,
  add column if not exists prepared_at timestamptz,
  add column if not exists invitations_opened_at timestamptz,
  add column if not exists venue_confirmed_at timestamptz,
  add column if not exists confirmation_released_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists event_instructions text,
  add column if not exists restaurant_image_url text;

update public.events
set capacity = coalesce(capacity, 8),
    invitation_limit = greatest(coalesce(invitation_limit, 12), coalesce(capacity, 8)),
    rsvp_deadline_at = coalesce(rsvp_deadline_at, starts_at),
    prepared_at = coalesce(prepared_at, created_at),
    invitations_opened_at = case
      when status in ('inviting', 'confirmed', 'completed')
        then coalesce(invitations_opened_at, invitation_send_at, created_at)
      else invitations_opened_at
    end,
    confirmation_released_at = case
      when status in ('confirmed', 'completed')
        then coalesce(confirmation_released_at, updated_at)
      else confirmation_released_at
    end,
    completed_at = case
      when status = 'completed' then coalesce(completed_at, updated_at)
      else completed_at
    end,
    cancelled_at = case
      when status = 'cancelled' then coalesce(cancelled_at, updated_at)
      else cancelled_at
    end;

alter table public.events
  alter column capacity set default 8,
  alter column capacity set not null,
  alter column rsvp_deadline_at set not null,
  drop constraint if exists events_capacity_check,
  drop constraint if exists events_operating_counts_check,
  drop constraint if exists events_invitation_limit_check,
  drop constraint if exists events_timezone_check,
  add constraint events_capacity_check check (capacity > 0),
  add constraint events_operating_counts_check check (
    minimum_confirmed_count > 0
    and minimum_run_count > 0
    and minimum_run_count <= minimum_confirmed_count
    and minimum_confirmed_count <= capacity
  ),
  add constraint events_invitation_limit_check check (invitation_limit >= capacity),
  add constraint events_timezone_check check (length(btrim(timezone)) between 1 and 100),
  add constraint events_credit_cost_check check (credit_cost > 0);

create unique index if not exists events_matching_group_key
  on public.events (matching_group_id)
  where matching_group_id is not null;

create or replace function public.validate_event_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'A valid IANA timezone is required.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_event_timezone on public.events;
create trigger validate_event_timezone
  before insert or update of timezone on public.events
  for each row execute function public.validate_event_timezone();

create or replace function public.enforce_event_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if (old.status = 'draft' and new.status in ('inviting', 'cancelled'))
    or (old.status = 'inviting' and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('completed', 'cancelled')) then
    return new;
  end if;
  raise exception 'Invalid event status transition from % to %.', old.status, new.status
    using errcode = '23514';
end;
$$;

drop trigger if exists enforce_event_status_transition on public.events;
create trigger enforce_event_status_transition
  before update of status on public.events
  for each row execute function public.enforce_event_status_transition();

revoke all on function public.validate_event_timezone()
  from public, anon, authenticated;
revoke all on function public.enforce_event_status_transition()
  from public, anon, authenticated;

-- Venue and released-detail columns are never directly selectable with a
-- member JWT. Server data loaders re-attach them only after checking the
-- caller owns a confirmed seat and the founder released confirmation.
revoke select on table public.events from authenticated;
grant select (
  id, title, description, localized_content,
  event_format, language_code, status, starts_at, ends_at, timezone, city,
  capacity, invitation_limit, credit_cost, minimum_confirmed_count,
  minimum_run_count, gender_balance_enabled, invitation_send_at,
  rsvp_deadline_at, prepared_at, invitations_opened_at, venue_confirmed_at,
  confirmation_released_at, completed_at, cancelled_at, cancellation_reason,
  created_at, updated_at
) on public.events to authenticated;

do $$
begin
  if to_regclass('ops.matching_groups') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'events_matching_group_id_fkey'
        and conrelid = 'public.events'::regclass
    ) then
      alter table public.events
        add constraint events_matching_group_id_fkey
        foreign key (matching_group_id)
        references ops.matching_groups(id)
        on delete restrict;
    end if;

    create unique index if not exists matching_groups_event_id_key
      on ops.matching_groups (event_id)
      where event_id is not null;
  end if;
end;
$$;

alter table public.event_invitations
  add column if not exists response_status text not null default 'invited',
  add column if not exists seat_status text not null default 'none',
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists waitlist_reason text,
  add column if not exists priority_at timestamptz,
  add column if not exists member_status_at_invite text,
  add column if not exists held_at timestamptz,
  add column if not exists waitlisted_at timestamptz,
  add column if not exists payment_completed_at timestamptz;

update public.event_invitations as invitations
set response_status = case invitations.status
      when 'declined' then 'declined'
      when 'expired' then 'expired'
      when 'confirmed' then 'accepted'
      when 'waitlisted' then 'accepted'
      when 'cancelled' then case when invitations.confirmed_at is null then 'declined' else 'accepted' end
      else 'invited'
    end,
    seat_status = case invitations.status
      when 'confirmed' then 'confirmed'
      when 'waitlisted' then 'waitlisted'
      when 'cancelled' then case when invitations.confirmed_at is null then 'none' else 'cancelled' end
      else 'none'
    end,
    payment_status = case
      when members.membership_status = 'pending' then 'pending'
      else 'not_required'
    end,
    waitlist_reason = case
      when invitations.status = 'waitlisted' then 'capacity'
      else null
    end,
    priority_at = case
      when invitations.status in ('confirmed', 'waitlisted', 'cancelled')
        then coalesce(invitations.responded_at, invitations.confirmed_at, invitations.created_at)
      else invitations.priority_at
    end,
    member_status_at_invite = coalesce(
      invitations.member_status_at_invite,
      case when members.membership_status = 'pending' then 'pending' else 'active' end
    ),
    waitlisted_at = case
      when invitations.status = 'waitlisted'
        then coalesce(invitations.waitlisted_at, invitations.responded_at, invitations.updated_at)
      else invitations.waitlisted_at
    end
from public.members
where members.id = invitations.member_id;

alter table public.event_invitations
  alter column member_status_at_invite set not null,
  drop constraint if exists event_invitations_response_status_check,
  drop constraint if exists event_invitations_seat_status_check,
  drop constraint if exists event_invitations_payment_status_check,
  drop constraint if exists event_invitations_waitlist_reason_check,
  drop constraint if exists event_invitations_member_status_at_invite_check,
  add constraint event_invitations_response_status_check
    check (response_status in ('invited', 'accepted', 'declined', 'expired')),
  add constraint event_invitations_seat_status_check
    check (seat_status in ('none', 'held', 'confirmed', 'waitlisted', 'cancelled', 'replaced')),
  add constraint event_invitations_payment_status_check
    check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'expired')),
  add constraint event_invitations_waitlist_reason_check
    check (waitlist_reason is null or waitlist_reason in ('capacity', 'balance', 'payment_hold_expired')),
  add constraint event_invitations_member_status_at_invite_check
    check (member_status_at_invite in ('active', 'pending'));

create index if not exists event_invitations_seat_priority_idx
  on public.event_invitations (event_id, seat_status, priority_at, created_at);

create table if not exists public.event_action_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  action_type text not null,
  idempotency_key text not null unique,
  actor_admin_id uuid references ops.ops_admin_users(id) on delete set null,
  actor_member_id uuid references public.members(id) on delete set null,
  status text not null default 'running',
  parameters jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint event_action_runs_status_check check (status in ('running', 'succeeded', 'failed')),
  constraint event_action_runs_idempotency_key_check check (length(idempotency_key) between 1 and 100),
  constraint event_action_runs_actor_check check (actor_admin_id is not null or actor_member_id is not null)
);

create index if not exists event_action_runs_event_created_idx
  on public.event_action_runs (event_id, created_at desc);

create table if not exists public.event_summary_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  stage text not null,
  age_min integer,
  age_max integer,
  primary_language text,
  additional_languages jsonb not null default '[]'::jsonb,
  majority_intention text,
  majority_source_count integer not null default 0,
  source_count integer not null default 0,
  calculated_at timestamptz not null default now(),
  created_action_id uuid references public.event_action_runs(id) on delete set null,
  constraint event_summary_snapshots_stage_check check (stage in ('proposed', 'confirmed')),
  constraint event_summary_snapshots_ages_check check (
    (age_min is null and age_max is null)
    or (age_min between 18 and 120 and age_max between age_min and 120)
  ),
  constraint event_summary_snapshots_languages_check check (jsonb_typeof(additional_languages) = 'array'),
  unique (event_id, stage)
);

create table if not exists public.event_invitation_access_tokens (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  action_id uuid references public.event_action_runs(id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_invitation_access_tokens_invitation_idx
  on public.event_invitation_access_tokens (invitation_id, expires_at desc);

create table if not exists public.event_invitation_sessions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  token_id uuid references public.event_invitation_access_tokens(id) on delete set null,
  session_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists event_invitation_sessions_expiry_idx
  on public.event_invitation_sessions (expires_at);

create table if not exists public.event_seat_holds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  priority_at timestamptz not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  converted_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_seat_holds_status_check check (status in ('active', 'converted', 'expired', 'released'))
);

create unique index if not exists event_seat_holds_one_active_per_invitation
  on public.event_seat_holds (invitation_id)
  where status = 'active';

create index if not exists event_seat_holds_capacity_idx
  on public.event_seat_holds (event_id, status, expires_at);

create table if not exists public.event_invitation_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  hold_id uuid references public.event_seat_holds(id) on delete set null,
  member_id uuid not null references public.members(id) on delete cascade,
  idempotency_key text not null unique,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  status text not null default 'created',
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  checkout_created_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint event_invitation_payment_attempts_status_check
    check (status in ('created', 'checkout_created', 'paid', 'failed', 'cancelled')),
  constraint event_invitation_payment_attempts_key_check check (length(idempotency_key) between 1 and 100)
);

create index if not exists event_invitation_payment_attempts_invitation_idx
  on public.event_invitation_payment_attempts (invitation_id, created_at desc);

create table if not exists public.stripe_event_receipts (
  stripe_event_id text primary key,
  payment_attempt_id uuid references public.event_invitation_payment_attempts(id) on delete set null,
  event_type text not null,
  result jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create table if not exists public.event_replacements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  cancelled_invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  replacement_invitation_id uuid references public.event_invitations(id) on delete set null,
  status text not null default 'eligible',
  refund_eligible_at timestamptz,
  replaced_at timestamptz,
  refunded_at timestamptz,
  actor_admin_id uuid references ops.ops_admin_users(id) on delete set null,
  action_id uuid references public.event_action_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_replacements_status_check check (status in ('eligible', 'replaced', 'no_replacement', 'restored')),
  unique (cancelled_invitation_id),
  unique (replacement_invitation_id)
);

create table if not exists public.event_hosts (
  event_id uuid primary key references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  public_intro text,
  assigned_by_admin_id uuid not null references ops.ops_admin_users(id) on delete restrict,
  assigned_action_id uuid references public.event_action_runs(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_hosts_event_member_key
  on public.event_hosts (event_id, member_id);

create table if not exists public.event_materials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  locale text not null,
  kind text not null,
  version text not null,
  public_url text not null,
  created_action_id uuid references public.event_action_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_materials_locale_check check (locale in ('en', 'es')),
  constraint event_materials_kind_check check (kind in ('host_guide', 'questions_pdf', 'event_guide')),
  constraint event_materials_public_url_check check (public_url ~ '^https://'),
  unique (event_id, locale, kind, version)
);

create table if not exists public.event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  overall_rating integer,
  questions_rating integer,
  restaurant_rating integer,
  host_rating integer,
  hosting_experience_rating integer,
  comments text,
  one_star_detail text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_feedback_overall_check check (overall_rating is null or overall_rating between 1 and 5),
  constraint event_feedback_questions_check check (questions_rating is null or questions_rating between 1 and 5),
  constraint event_feedback_restaurant_check check (restaurant_rating is null or restaurant_rating between 1 and 5),
  constraint event_feedback_host_check check (host_rating is null or host_rating between 1 and 5),
  constraint event_feedback_hosting_check check (hosting_experience_rating is null or hosting_experience_rating between 1 and 5),
  constraint event_feedback_one_star_detail_check check (
    not (
      overall_rating = 1
      or questions_rating = 1
      or restaurant_rating = 1
      or host_rating = 1
      or hosting_experience_rating = 1
    )
    or length(btrim(coalesce(one_star_detail, ''))) > 0
  ),
  constraint event_feedback_at_least_one_rating_check check (
    overall_rating is not null
    or questions_rating is not null
    or restaurant_rating is not null
    or host_rating is not null
    or hosting_experience_rating is not null
  ),
  unique (event_id, member_id)
);

create table if not exists public.event_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invitation_id uuid references public.event_invitations(id) on delete set null,
  member_id uuid not null references public.members(id) on delete cascade,
  triggered_by_admin_id uuid references ops.ops_admin_users(id) on delete set null,
  triggered_by_member_id uuid references public.members(id) on delete set null,
  triggering_action_id uuid references public.event_action_runs(id) on delete set null,
  invitation_access_token_id uuid references public.event_invitation_access_tokens(id) on delete set null,
  email_type text not null,
  locale text not null,
  template_id text not null,
  template_version text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'draft',
  due_at timestamptz,
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  claimed_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_email_deliveries_type_check check (email_type in (
    'invitation_member', 'invitation_pending', 'seat_confirmed',
    'waitlist_capacity', 'waitlist_balance', 'cancellation_received',
    'rsvp_reminder', 'event_confirmed', 'event_cancelled', 'host_package',
    'event_reminder', 'replacement_refund', 'no_replacement',
    'late_cancellation_notice', 'feedback_request', 'credit_offer'
  )),
  constraint event_email_deliveries_locale_check check (locale in ('en', 'es')),
  constraint event_email_deliveries_status_check check (status in ('draft', 'sending', 'sent', 'failed', 'cancelled')),
  constraint event_email_deliveries_attempts_check check (attempts >= 0),
  constraint event_email_deliveries_key_check check (length(idempotency_key) between 1 and 100),
  constraint event_email_deliveries_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint event_email_deliveries_actor_check check (
    triggered_by_admin_id is not null or triggered_by_member_id is not null
  )
);

create index if not exists event_email_deliveries_event_status_idx
  on public.event_email_deliveries (event_id, status, due_at);

create index if not exists event_email_deliveries_failed_idx
  on public.event_email_deliveries (failed_at)
  where status = 'failed';

alter table public.event_action_runs enable row level security;
alter table public.event_summary_snapshots enable row level security;
alter table public.event_invitation_access_tokens enable row level security;
alter table public.event_invitation_sessions enable row level security;
alter table public.event_seat_holds enable row level security;
alter table public.event_invitation_payment_attempts enable row level security;
alter table public.stripe_event_receipts enable row level security;
alter table public.event_replacements enable row level security;
alter table public.event_hosts enable row level security;
alter table public.event_materials enable row level security;
alter table public.event_feedback enable row level security;
alter table public.event_email_deliveries enable row level security;

revoke all on table public.event_action_runs from public, anon, authenticated;
revoke all on table public.event_summary_snapshots from public, anon, authenticated;
revoke all on table public.event_invitation_access_tokens from public, anon, authenticated;
revoke all on table public.event_invitation_sessions from public, anon, authenticated;
revoke all on table public.event_seat_holds from public, anon, authenticated;
revoke all on table public.event_invitation_payment_attempts from public, anon, authenticated;
revoke all on table public.stripe_event_receipts from public, anon, authenticated;
revoke all on table public.event_replacements from public, anon, authenticated;
revoke all on table public.event_hosts from public, anon, authenticated;
revoke all on table public.event_materials from public, anon, authenticated;
revoke all on table public.event_feedback from public, anon, authenticated;
revoke all on table public.event_email_deliveries from public, anon, authenticated;

grant all on table public.event_action_runs to service_role;
grant all on table public.event_summary_snapshots to service_role;
grant all on table public.event_invitation_access_tokens to service_role;
grant all on table public.event_invitation_sessions to service_role;
grant all on table public.event_seat_holds to service_role;
grant all on table public.event_invitation_payment_attempts to service_role;
grant all on table public.stripe_event_receipts to service_role;
grant all on table public.event_replacements to service_role;
grant all on table public.event_hosts to service_role;
grant all on table public.event_materials to service_role;
grant all on table public.event_feedback to service_role;
grant all on table public.event_email_deliveries to service_role;

grant select on table public.event_summary_snapshots to authenticated;
grant select on table public.event_hosts to authenticated;
grant select on table public.event_materials to authenticated;
grant select on table public.event_feedback to authenticated;

create policy "Members can view summaries for their events"
  on public.event_summary_snapshots for select to authenticated
  using (exists (
    select 1 from public.event_invitations
    where event_invitations.event_id = event_summary_snapshots.event_id
      and event_invitations.member_id = public.current_member_id()
  ));

create policy "Confirmed members can view the event host"
  on public.event_hosts for select to authenticated
  using (exists (
    select 1 from public.event_invitations
    where event_invitations.event_id = event_hosts.event_id
      and event_invitations.member_id = public.current_member_id()
      and event_invitations.seat_status = 'confirmed'
  ));

create policy "Assigned hosts can view event materials"
  on public.event_materials for select to authenticated
  using (exists (
    select 1 from public.event_hosts
    where event_hosts.event_id = event_materials.event_id
      and event_hosts.member_id = public.current_member_id()
  ));

create policy "Members can view own event feedback"
  on public.event_feedback for select to authenticated
  using (member_id = public.current_member_id());

-- Keep the legacy combined invitation status usable while the three state
-- machines above are adopted by all consumers.
create or replace function public.sync_event_invitation_compatibility_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'invited'
    or tg_op = 'UPDATE' and new.status is distinct from old.status
      and new.response_status is not distinct from old.response_status
      and new.seat_status is not distinct from old.seat_status then
    case new.status
      when 'confirmed' then
        new.response_status := 'accepted';
        new.seat_status := 'confirmed';
        new.waitlist_reason := null;
      when 'waitlisted' then
        new.response_status := 'accepted';
        new.seat_status := 'waitlisted';
        new.waitlist_reason := coalesce(new.waitlist_reason, 'capacity');
        new.priority_at := coalesce(new.priority_at, new.responded_at, now());
        new.waitlisted_at := coalesce(new.waitlisted_at, now());
      when 'declined' then
        new.response_status := 'declined';
        new.seat_status := 'none';
        new.waitlist_reason := null;
      when 'cancelled' then
        if new.confirmed_at is null then
          new.response_status := 'declined';
          new.seat_status := 'none';
        else
          new.response_status := 'accepted';
          new.seat_status := 'cancelled';
        end if;
        new.waitlist_reason := null;
      when 'expired' then
        new.response_status := 'expired';
        new.seat_status := 'none';
        new.waitlist_reason := null;
      else
        new.response_status := 'invited';
        new.seat_status := 'none';
        new.waitlist_reason := null;
    end case;
  end if;

  new.status := case
    when new.seat_status = 'confirmed' then 'confirmed'
    when new.seat_status = 'waitlisted' then 'waitlisted'
    when new.seat_status in ('cancelled', 'replaced') then 'cancelled'
    when new.response_status = 'declined' then 'declined'
    when new.response_status = 'expired' then 'expired'
    else 'invited'
  end;

  return new;
end;
$$;

drop trigger if exists sync_event_invitation_compatibility_status
  on public.event_invitations;
create trigger sync_event_invitation_compatibility_status
  before insert or update on public.event_invitations
  for each row execute function public.sync_event_invitation_compatibility_status();

revoke all on function public.sync_event_invitation_compatibility_status()
  from public, anon, authenticated;

create or replace function public.event_payload_is_secret_free(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_payload, '{}'::jsonb)::text !~* '"[^"]*(token|secret|bearer)[^"]*"[[:space:]]*:'
    and coalesce(p_payload, '{}'::jsonb)::text !~* '(\?|&)(token|secret|session)=';
$$;

alter table public.event_action_runs
  drop constraint if exists event_action_runs_parameters_secret_free,
  drop constraint if exists event_action_runs_result_secret_free,
  add constraint event_action_runs_parameters_secret_free
    check (public.event_payload_is_secret_free(parameters)),
  add constraint event_action_runs_result_secret_free
    check (result is null or public.event_payload_is_secret_free(result));

alter table public.event_email_deliveries
  drop constraint if exists event_email_deliveries_payload_secret_free,
  add constraint event_email_deliveries_payload_secret_free
    check (public.event_payload_is_secret_free(payload));

revoke all on function public.event_payload_is_secret_free(jsonb)
  from public, anon, authenticated;

create or replace function public.event_admin_is_authorized(
  p_admin_id uuid,
  p_admin_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from ops.ops_admin_users
    where id = p_admin_id
      and email_norm = lower(nullif(btrim(p_admin_email), ''))
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.begin_event_action(
  p_event_id uuid,
  p_action_type text,
  p_admin_id uuid,
  p_member_id uuid,
  p_idempotency_key text,
  p_parameters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_record public.event_action_runs%rowtype;
  clean_key text := nullif(btrim(p_idempotency_key), '');
begin
  if clean_key is null or length(clean_key) > 100 then
    raise exception 'An idempotency key between 1 and 100 characters is required.'
      using errcode = '22023';
  end if;

  if not public.event_payload_is_secret_free(coalesce(p_parameters, '{}'::jsonb)) then
    raise exception 'Action parameters cannot contain bearer secrets.'
      using errcode = '22023';
  end if;

  select * into action_record
  from public.event_action_runs
  where idempotency_key = clean_key
  for update;

  if action_record.id is not null then
    if action_record.action_type <> p_action_type
      or action_record.event_id is distinct from p_event_id
      or action_record.actor_admin_id is distinct from p_admin_id
      or action_record.actor_member_id is distinct from p_member_id then
      raise exception 'The idempotency key is already used by another event action.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'actionId', action_record.id,
      'replay', action_record.status = 'succeeded',
      'result', action_record.result
    );
  end if;

  insert into public.event_action_runs (
    event_id,
    action_type,
    idempotency_key,
    actor_admin_id,
    actor_member_id,
    parameters
  ) values (
    p_event_id,
    p_action_type,
    clean_key,
    p_admin_id,
    p_member_id,
    coalesce(p_parameters, '{}'::jsonb)
  )
  returning * into action_record;

  return jsonb_build_object(
    'actionId', action_record.id,
    'replay', false,
    'result', null
  );
end;
$$;

create or replace function public.finish_event_action(
  p_action_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.event_payload_is_secret_free(coalesce(p_result, '{}'::jsonb)) then
    raise exception 'Action results cannot contain bearer secrets.'
      using errcode = '22023';
  end if;

  update public.event_action_runs
  set status = 'succeeded',
      result = coalesce(p_result, '{}'::jsonb),
      last_error = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_action_id;

  return p_result;
end;
$$;

revoke all on function public.event_admin_is_authorized(uuid, text)
  from public, anon, authenticated;
revoke all on function public.begin_event_action(uuid, text, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.finish_event_action(uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.event_frozen_payload(
  p_event_id uuid,
  p_invitation_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'eventId', events.id,
    'invitationId', p_invitation_id,
    'title', events.title,
    'eventFormat', events.event_format,
    'startsAt', events.starts_at,
    'endsAt', events.ends_at,
    'timezone', events.timezone,
    'city', events.city,
    'languageCode', events.language_code,
    'rsvpDeadlineAt', events.rsvp_deadline_at,
    'creditCost', events.credit_cost,
    'capacity', events.capacity,
    'venueName', case
      when events.confirmation_released_at is not null then events.venue_name
      else null
    end,
    'venueAddress', case
      when events.confirmation_released_at is not null then events.venue_address
      else null
    end,
    'restaurantImageUrl', case
      when events.confirmation_released_at is not null then events.restaurant_image_url
      else null
    end,
    'eventInstructions', case
      when events.confirmation_released_at is not null then events.event_instructions
      else null
    end
  ))
  from public.events
  where events.id = p_event_id;
$$;

create or replace function public.queue_event_email_delivery(
  p_event_id uuid,
  p_invitation_id uuid,
  p_member_id uuid,
  p_admin_id uuid,
  p_member_actor_id uuid,
  p_action_id uuid,
  p_email_type text,
  p_payload jsonb,
  p_idempotency_key text,
  p_due_at timestamptz default null,
  p_invitation_access_token_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_id uuid;
  delivery_locale text;
  clean_key text := nullif(btrim(p_idempotency_key), '');
begin
  if clean_key is null or length(clean_key) > 100 then
    raise exception 'Delivery idempotency keys must be between 1 and 100 characters.'
      using errcode = '22023';
  end if;

  if not public.event_payload_is_secret_free(coalesce(p_payload, '{}'::jsonb)) then
    raise exception 'Email payloads cannot contain bearer secrets.'
      using errcode = '22023';
  end if;

  delivery_locale := public.effective_member_locale(p_member_id);

  insert into public.event_email_deliveries (
    event_id,
    invitation_id,
    member_id,
    triggered_by_admin_id,
    triggered_by_member_id,
    triggering_action_id,
    invitation_access_token_id,
    email_type,
    locale,
    template_id,
    template_version,
    payload,
    idempotency_key,
    due_at
  ) values (
    p_event_id,
    p_invitation_id,
    p_member_id,
    p_admin_id,
    p_member_actor_id,
    p_action_id,
    p_invitation_access_token_id,
    p_email_type,
    delivery_locale,
    p_email_type,
    'v1',
    coalesce(p_payload, '{}'::jsonb),
    clean_key,
    p_due_at
  )
  on conflict (idempotency_key) do update
    set updated_at = public.event_email_deliveries.updated_at
  returning id into delivery_id;

  return delivery_id;
end;
$$;

revoke all on function public.event_frozen_payload(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.queue_event_email_delivery(uuid, uuid, uuid, uuid, uuid, uuid, text, jsonb, text, timestamptz, uuid)
  from public, anon, authenticated;

create or replace function public.current_active_member_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_id uuid;
begin
  select id into member_id
  from public.members
  where user_id = auth.uid()
    and membership_status = 'active'
  limit 1;

  return member_id;
end;
$$;

revoke all on function public.current_active_member_id()
  from public, anon, authenticated;
grant execute on function public.current_active_member_id()
  to authenticated, service_role;

-- A Supabase auth session is not sufficient for protected member data. These
-- policies repeat the active-membership gate at the database boundary.
drop policy if exists "Members can manage own event preferences" on public.member_event_preferences;
create policy "Members can manage own event preferences"
  on public.member_event_preferences for all to authenticated
  using (member_id = public.current_active_member_id())
  with check (member_id = public.current_active_member_id());

drop policy if exists "Members can view own referral code" on public.benefit_codes;
create policy "Members can view own referral code"
  on public.benefit_codes for select to authenticated
  using (owner_member_id = public.current_active_member_id());

drop policy if exists "Members can view own code redemptions" on public.benefit_code_redemptions;
create policy "Members can view own code redemptions"
  on public.benefit_code_redemptions for select to authenticated
  using (
    beneficiary_member_id = public.current_active_member_id()
    or referrer_member_id = public.current_active_member_id()
  );

drop policy if exists "Members can view own credit ledger" on public.credit_ledger_entries;
create policy "Members can view own credit ledger"
  on public.credit_ledger_entries for select to authenticated
  using (member_id = public.current_active_member_id());

drop policy if exists "Members can view their event records" on public.events;
create policy "Members can view their event records"
  on public.events for select to authenticated
  using (exists (
    select 1 from public.event_invitations
    where event_id = events.id
      and member_id = public.current_active_member_id()
  ));

drop policy if exists "Members can view own invitations" on public.event_invitations;
create policy "Members can view own invitations"
  on public.event_invitations for select to authenticated
  using (member_id = public.current_active_member_id());

drop policy if exists "Members can view own attendee records" on public.event_attendees;
create policy "Members can view own attendee records"
  on public.event_attendees for select to authenticated
  using (member_id = public.current_active_member_id());

drop policy if exists "Conversation members can view conversations" on public.conversations;
create policy "Conversation members can view conversations"
  on public.conversations for select to authenticated
  using (
    public.current_active_member_id() is not null
    and public.is_conversation_participant(id)
  );

drop policy if exists "Conversation members can view participants" on public.conversation_participants;
create policy "Conversation members can view participants"
  on public.conversation_participants for select to authenticated
  using (
    public.current_active_member_id() is not null
    and public.is_conversation_participant(conversation_id)
  );

drop policy if exists "Members can update own participant read state" on public.conversation_participants;
create policy "Members can update own participant read state"
  on public.conversation_participants for update to authenticated
  using (member_id = public.current_active_member_id())
  with check (member_id = public.current_active_member_id());

drop policy if exists "Conversation members can view messages" on public.messages;
create policy "Conversation members can view messages"
  on public.messages for select to authenticated
  using (
    public.current_active_member_id() is not null
    and public.is_conversation_participant(conversation_id)
  );

drop policy if exists "Members can update own messages" on public.messages;
create policy "Members can update own messages"
  on public.messages for update to authenticated
  using (sender_member_id = public.current_active_member_id())
  with check (sender_member_id = public.current_active_member_id());

drop policy if exists "Members can view own notifications" on public.notifications;
create policy "Members can view own notifications"
  on public.notifications for select to authenticated
  using (member_id = public.current_active_member_id());

drop policy if exists "Members can update own notifications" on public.notifications;
create policy "Members can update own notifications"
  on public.notifications for update to authenticated
  using (member_id = public.current_active_member_id())
  with check (member_id = public.current_active_member_id());

drop policy if exists "Members can view summaries for their events" on public.event_summary_snapshots;
create policy "Members can view summaries for their events"
  on public.event_summary_snapshots for select to authenticated
  using (exists (
    select 1 from public.event_invitations
    where event_id = event_summary_snapshots.event_id
      and member_id = public.current_active_member_id()
  ));

drop policy if exists "Confirmed members can view the event host" on public.event_hosts;
create policy "Confirmed members can view the event host"
  on public.event_hosts for select to authenticated
  using (exists (
    select 1 from public.event_invitations
    where event_id = event_hosts.event_id
      and member_id = public.current_active_member_id()
      and seat_status = 'confirmed'
  ));

drop policy if exists "Assigned hosts can view event materials" on public.event_materials;
create policy "Assigned hosts can view event materials"
  on public.event_materials for select to authenticated
  using (exists (
    select 1 from public.event_hosts
    where event_id = event_materials.event_id
      and member_id = public.current_active_member_id()
  ));

drop policy if exists "Members can view own event feedback" on public.event_feedback;
create policy "Members can view own event feedback"
  on public.event_feedback for select to authenticated
  using (member_id = public.current_active_member_id());

create or replace function public.event_seat_waitlist_reason(
  p_event_id uuid,
  p_member_id uuid,
  p_exclude_invitation_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  occupied_count integer;
  female_count integer;
  male_count integer;
  member_gender text;
begin
  select * into event_record
  from public.events
  where id = p_event_id;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    return 'closed';
  end if;

  select
    count(*) filter (where occupant.kind = 'seat')
      + count(*) filter (where occupant.kind = 'hold')
  into occupied_count
  from (
    select invitations.member_id, invitations.id as invitation_id, 'seat'::text as kind
    from public.event_invitations as invitations
    where invitations.event_id = p_event_id
      and invitations.seat_status = 'confirmed'
      and invitations.id is distinct from p_exclude_invitation_id
    union all
    select holds.member_id, holds.invitation_id, 'hold'::text
    from public.event_seat_holds as holds
    where holds.event_id = p_event_id
      and holds.status = 'active'
      and holds.expires_at > now()
      and holds.invitation_id is distinct from p_exclude_invitation_id
  ) as occupant;

  if occupied_count >= event_record.capacity then
    return 'capacity';
  end if;

  if not event_record.gender_balance_enabled then
    return null;
  end if;

  member_gender := public.event_member_binary_gender(p_member_id);
  if member_gender is null or member_gender not in ('female', 'male') then
    return null;
  end if;

  select
    count(*) filter (where public.event_member_binary_gender(occupant.member_id) = 'female'),
    count(*) filter (where public.event_member_binary_gender(occupant.member_id) = 'male')
  into female_count, male_count
  from (
    select invitations.member_id, invitations.id as invitation_id
    from public.event_invitations as invitations
    where invitations.event_id = p_event_id
      and invitations.seat_status = 'confirmed'
      and invitations.id is distinct from p_exclude_invitation_id
    union all
    select holds.member_id, holds.invitation_id
    from public.event_seat_holds as holds
    where holds.event_id = p_event_id
      and holds.status = 'active'
      and holds.expires_at > now()
      and holds.invitation_id is distinct from p_exclude_invitation_id
  ) as occupant;

  if member_gender = 'female' and female_count > male_count then
    return 'balance';
  end if;
  if member_gender = 'male' and male_count > female_count then
    return 'balance';
  end if;

  return null;
end;
$$;

revoke all on function public.event_seat_waitlist_reason(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.enforce_event_invitation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_count integer;
  target_limit integer;
begin
  if tg_op = 'UPDATE' and new.event_id = old.event_id then
    return new;
  end if;

  perform 1 from public.events where id = new.event_id for update;
  select invitation_limit into target_limit
  from public.events where id = new.event_id;

  if tg_op = 'UPDATE' then
    select count(*)::integer into invitation_count
    from public.event_invitations
    where event_id = new.event_id
      and id <> old.id;
  else
    select count(*)::integer into invitation_count
    from public.event_invitations
    where event_id = new.event_id;
  end if;

  if invitation_count >= target_limit then
    raise exception 'The event invitation limit has been reached.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.event_invitation_response_mode_for_member(
  p_event_id uuid,
  p_member_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reason text;
begin
  reason := public.event_seat_waitlist_reason(p_event_id, p_member_id, null);
  if reason = 'closed' then return 'closed'; end if;
  if reason = 'capacity' then return 'waitlist'; end if;
  if reason = 'balance' then return 'apply_waitlist'; end if;
  return 'confirm';
end;
$$;

create or replace function public.get_event_invitation_response_modes()
returns table(invitation_id uuid, response_mode text)
language sql
stable
security definer
set search_path = ''
as $$
  select invitations.id,
    public.event_invitation_response_mode_for_member(
      invitations.event_id,
      invitations.member_id
    )
  from public.event_invitations as invitations
  where invitations.member_id = public.current_active_member_id()
    and invitations.response_status in ('invited', 'declined')
    and invitations.seat_status in ('none', 'waitlisted');
$$;

revoke all on function public.get_event_invitation_response_modes()
  from public, anon, authenticated;
grant execute on function public.get_event_invitation_response_modes()
  to authenticated;

create or replace function public.confirm_event_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  waitlist_reason_value text;
  credit_balance integer;
  delivery_id uuid;
  result jsonb;
  is_reapplication boolean;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id
    and member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  if invitation_record.seat_status = 'confirmed' then
    return jsonb_build_object(
      'ok', true,
      'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', null
    );
  end if;

  if invitation_record.response_status = 'expired'
    or invitation_record.seat_status in ('cancelled', 'replaced', 'held') then
    raise exception 'This invitation cannot be confirmed.' using errcode = '22023';
  end if;

  is_reapplication := invitation_record.response_status = 'declined';

  -- All seat-changing flows lock invitation first and event second.
  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'The RSVP deadline has passed.' using errcode = '22023';
  end if;

  update public.event_seat_holds
  set status = 'expired', updated_at = now()
  where event_id = event_record.id
    and status = 'active'
    and expires_at <= now();

  waitlist_reason_value := public.event_seat_waitlist_reason(
    event_record.id,
    current_member_id_value,
    invitation_record.id
  );

  if waitlist_reason_value in ('capacity', 'balance') then
    if is_reapplication then
      raise exception 'A seat is no longer available for this event.' using errcode = '22023';
    end if;

    update public.event_invitations
    set response_status = 'accepted',
        seat_status = 'waitlisted',
        payment_status = 'not_required',
        waitlist_reason = waitlist_reason_value,
        priority_at = coalesce(priority_at, now()),
        responded_at = coalesce(responded_at, now()),
        waitlisted_at = coalesce(waitlisted_at, now()),
        cancelled_at = null,
        updated_at = now()
    where id = invitation_record.id
    returning * into invitation_record;

    delivery_id := public.queue_event_email_delivery(
      event_record.id,
      invitation_record.id,
      current_member_id_value,
      null,
      current_member_id_value,
      null,
      case when waitlist_reason_value = 'balance' then 'waitlist_balance' else 'waitlist_capacity' end,
      public.event_frozen_payload(event_record.id, invitation_record.id)
        || jsonb_build_object('seatStatus', 'waitlisted', 'waitlistReason', waitlist_reason_value),
      'member-waitlist-' || waitlist_reason_value || '-' || invitation_record.id::text
    );

    return jsonb_build_object(
      'ok', true,
      'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', delivery_id
    );
  end if;

  if waitlist_reason_value = 'closed' then
    raise exception 'The RSVP deadline has passed.' using errcode = '22023';
  end if;

  select coalesce(sum(delta), 0)::integer into credit_balance
  from public.credit_ledger_entries
  where member_id = current_member_id_value;

  if credit_balance < event_record.credit_cost then
    raise exception 'You do not have enough credits to confirm this event.' using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'accepted',
      seat_status = 'confirmed',
      payment_status = 'not_required',
      waitlist_reason = null,
      priority_at = coalesce(priority_at, now()),
      responded_at = coalesce(responded_at, now()),
      confirmed_at = coalesce(confirmed_at, now()),
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  insert into public.event_attendees (
    event_id, member_id, invitation_id, status, is_host, created_at, updated_at
  ) values (
    event_record.id, current_member_id_value, invitation_record.id,
    'confirmed', false, now(), now()
  )
  on conflict (event_id, member_id) do update
  set invitation_id = excluded.invitation_id,
      status = 'confirmed',
      updated_at = now();

  perform public.grant_member_credit(
    current_member_id_value,
    -event_record.credit_cost,
    'event_confirmation',
    'event_invitation',
    invitation_record.id::text,
    null,
    'Credit used to confirm an event seat.',
    now()
  );

  if is_reapplication then
    update public.event_invitation_declines
    set follow_up_status = 'resolved',
        reviewed_at = coalesce(reviewed_at, now())
    where invitation_id = invitation_record.id
      and follow_up_status <> 'resolved';
  end if;

  delivery_id := public.queue_event_email_delivery(
    event_record.id,
    invitation_record.id,
    current_member_id_value,
    null,
    current_member_id_value,
    null,
    'seat_confirmed',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('seatStatus', 'confirmed'),
    'member-seat-confirmed-' || invitation_record.id::text
  );

  result := jsonb_build_object(
    'ok', true,
    'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'responseStatus', invitation_record.response_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'priorityAt', invitation_record.priority_at,
    'deliveryId', delivery_id
  );
  return result;
end;
$$;

create or replace function public.join_event_waitlist(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  reason text;
  delivery_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id and member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  if invitation_record.seat_status = 'waitlisted'
    and invitation_record.response_status = 'accepted' then
    return jsonb_build_object(
      'ok', true, 'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', null
    );
  end if;

  select * into event_record
  from public.events where id = invitation_record.event_id for update;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'This waitlist is no longer available.' using errcode = '22023';
  end if;

  reason := public.event_seat_waitlist_reason(
    event_record.id, current_member_id_value, invitation_record.id
  );
  if reason not in ('capacity', 'balance') then
    raise exception 'A seat is currently available for this invitation.' using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'accepted',
      seat_status = 'waitlisted',
      payment_status = 'not_required',
      waitlist_reason = reason,
      priority_at = coalesce(priority_at, now()),
      responded_at = coalesce(responded_at, now()),
      waitlisted_at = coalesce(waitlisted_at, now()),
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  delivery_id := public.queue_event_email_delivery(
    event_record.id, invitation_record.id, current_member_id_value,
    null, current_member_id_value, null,
    case when reason = 'balance' then 'waitlist_balance' else 'waitlist_capacity' end,
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('seatStatus', 'waitlisted', 'waitlistReason', reason),
    'member-waitlist-' || reason || '-' || invitation_record.id::text
  );

  return jsonb_build_object(
    'ok', true, 'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'responseStatus', invitation_record.response_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'priorityAt', invitation_record.priority_at,
    'deliveryId', delivery_id
  );
end;
$$;

create or replace function public.decline_event_invitation(
  p_invitation_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  normalized_reason text := lower(btrim(coalesce(p_reason, '')));
  normalized_details text := nullif(btrim(coalesce(p_details, '')), '');
  delivery_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;
  if normalized_reason not in (
    'weekend_unavailable', 'prefers_sunday_brunch', 'event_fit',
    'other_commitment', 'prefer_not_to_say'
  ) then
    raise exception 'Choose a reason before declining this invitation.' using errcode = '22023';
  end if;
  if char_length(normalized_details) > 500 then
    raise exception 'Decline details must be 500 characters or fewer.' using errcode = '22001';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id and member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  select * into event_record
  from public.events where id = invitation_record.event_id for update;

  if invitation_record.response_status = 'declined'
    and invitation_record.seat_status = 'none' then
    select id into delivery_id from public.event_email_deliveries
    where idempotency_key = 'member-decline-' || invitation_record.id::text;
    return jsonb_build_object(
      'ok', true, 'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id, 'responseStatus', 'declined',
      'seatStatus', 'none', 'paymentStatus', invitation_record.payment_status,
      'waitlistReason', null, 'priorityAt', invitation_record.priority_at,
      'deliveryId', delivery_id
    );
  end if;

  if event_record.id is null or now() >= event_record.rsvp_deadline_at
    or invitation_record.seat_status in ('confirmed', 'held', 'cancelled', 'replaced') then
    raise exception 'This invitation can no longer be declined.' using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'declined',
      seat_status = 'none',
      waitlist_reason = null,
      responded_at = now(),
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id;

  insert into public.event_invitation_declines (
    invitation_id, event_id, member_id, reason, details
  ) values (
    invitation_record.id, invitation_record.event_id,
    current_member_id_value, normalized_reason, normalized_details
  );

  delivery_id := public.queue_event_email_delivery(
    event_record.id, invitation_record.id, current_member_id_value,
    null, current_member_id_value, null, 'cancellation_received',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('responseStatus', 'declined'),
    'member-decline-' || invitation_record.id::text
  );

  return jsonb_build_object(
    'ok', true,
    'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'responseStatus', 'declined',
    'seatStatus', 'none',
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', null,
    'priorityAt', invitation_record.priority_at,
    'deliveryId', delivery_id
  );
end;
$$;

create or replace function public.cancel_event_confirmation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  delivery_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id and member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  select * into event_record
  from public.events where id = invitation_record.event_id for update;

  if event_record.id is null or event_record.status in ('completed', 'cancelled') then
    raise exception 'This event confirmation can no longer be cancelled.' using errcode = '22023';
  end if;

  if invitation_record.seat_status = 'waitlisted' then
    update public.event_invitations
    set response_status = 'declined',
        seat_status = 'none',
        waitlist_reason = null,
        responded_at = coalesce(responded_at, now()),
        updated_at = now()
    where id = invitation_record.id;

    delivery_id := public.queue_event_email_delivery(
      event_record.id, invitation_record.id, current_member_id_value,
      null, current_member_id_value, null, 'cancellation_received',
      public.event_frozen_payload(event_record.id, invitation_record.id)
        || jsonb_build_object('responseStatus', 'declined', 'previousSeatStatus', 'waitlisted'),
      'member-cancellation-' || invitation_record.id::text
    );

    return jsonb_build_object(
      'ok', true, 'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', 'declined', 'seatStatus', 'none',
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', null, 'priorityAt', invitation_record.priority_at,
      'deliveryId', delivery_id
    );
  end if;

  if invitation_record.seat_status = 'cancelled' then
    select id into delivery_id
    from public.event_email_deliveries
    where idempotency_key = 'member-cancellation-' || invitation_record.id::text;

    return jsonb_build_object(
      'ok', true, 'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', delivery_id
    );
  end if;

  if invitation_record.seat_status <> 'confirmed' then
    raise exception 'Only confirmed or waitlisted invitations can be cancelled here.' using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'accepted',
      seat_status = 'cancelled',
      waitlist_reason = null,
      cancelled_at = now(),
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  update public.event_attendees
  set status = 'cancelled', is_host = false, updated_at = now()
  where event_id = event_record.id and member_id = current_member_id_value;

  insert into public.event_replacements (
    event_id, cancelled_invitation_id, status, refund_eligible_at
  ) values (
    event_record.id, invitation_record.id, 'eligible', null
  ) on conflict (cancelled_invitation_id) do nothing;

  delete from public.event_hosts
  where event_id = event_record.id and member_id = current_member_id_value;

  delivery_id := public.queue_event_email_delivery(
    event_record.id, invitation_record.id, current_member_id_value,
    null, current_member_id_value, null,
    'cancellation_received',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('seatStatus', 'cancelled'),
    'member-cancellation-' || invitation_record.id::text
  );

  return jsonb_build_object(
    'ok', true, 'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'responseStatus', invitation_record.response_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'priorityAt', invitation_record.priority_at,
    'deliveryId', delivery_id
  );
end;
$$;

create or replace function public.restore_cancelled_event_confirmation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  reason text;
  delivery_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id and member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.' using errcode = 'P0002';
  end if;

  if invitation_record.seat_status = 'confirmed' then
    return jsonb_build_object(
      'ok', true, 'invitationId', invitation_record.id,
      'eventId', invitation_record.event_id,
      'responseStatus', invitation_record.response_status,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'priorityAt', invitation_record.priority_at,
      'deliveryId', null
    );
  end if;

  if invitation_record.seat_status <> 'cancelled' or invitation_record.confirmed_at is null then
    raise exception 'This invitation can no longer be restored.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.event_replacements
    where cancelled_invitation_id = invitation_record.id
      and status = 'replaced'
  ) then
    raise exception 'This seat has already been filled.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.credit_ledger_entries
    where member_id = current_member_id_value
      and reason = 'event_waitlist_replacement_refund'
      and source_type = 'event_invitation'
      and source_id = invitation_record.id::text
  ) then
    raise exception 'The cancellation credit has already been returned.' using errcode = '22023';
  end if;

  select * into event_record
  from public.events where id = invitation_record.event_id for update;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'This event is not open for restoration.' using errcode = '22023';
  end if;

  reason := public.event_seat_waitlist_reason(
    event_record.id, current_member_id_value, invitation_record.id
  );
  if reason is not null then
    raise exception 'This seat has already been filled.' using errcode = '22023';
  end if;

  update public.event_invitations
  set response_status = 'accepted',
      seat_status = 'confirmed',
      waitlist_reason = null,
      cancelled_at = null,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  insert into public.event_attendees (
    event_id, member_id, invitation_id, status, is_host, created_at, updated_at
  ) values (
    event_record.id, current_member_id_value, invitation_record.id,
    'confirmed', false, now(), now()
  ) on conflict (event_id, member_id) do update
  set invitation_id = excluded.invitation_id,
      status = 'confirmed',
      updated_at = now();

  update public.event_replacements
  set status = 'restored', updated_at = now()
  where cancelled_invitation_id = invitation_record.id;

  delivery_id := public.queue_event_email_delivery(
    event_record.id, invitation_record.id, current_member_id_value,
    null, current_member_id_value, null,
    'seat_confirmed',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('seatStatus', 'confirmed', 'restored', true),
    'member-seat-restored-' || invitation_record.id::text
  );

  return jsonb_build_object(
    'ok', true, 'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'responseStatus', invitation_record.response_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'priorityAt', invitation_record.priority_at,
    'deliveryId', delivery_id
  );
end;
$$;

revoke all on function public.confirm_event_invitation(uuid)
  from public, anon, authenticated;
revoke all on function public.join_event_waitlist(uuid)
  from public, anon, authenticated;
revoke all on function public.decline_event_invitation(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.cancel_event_confirmation(uuid)
  from public, anon, authenticated;
revoke all on function public.restore_cancelled_event_confirmation(uuid)
  from public, anon, authenticated;

grant execute on function public.confirm_event_invitation(uuid) to authenticated;
grant execute on function public.join_event_waitlist(uuid) to authenticated;
grant execute on function public.decline_event_invitation(uuid, text, text) to authenticated;
grant execute on function public.cancel_event_confirmation(uuid) to authenticated;
grant execute on function public.restore_cancelled_event_confirmation(uuid) to authenticated;

-- Pending-member bearer tokens are hashed at rest. Raw values only cross the
-- service-role RPC boundary long enough to enter an email or HttpOnly cookie.
create or replace function public.create_event_invitation_access_token(
  p_invitation_id uuid,
  p_action_id uuid,
  p_ttl_minutes integer default 10080
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.event_invitations%rowtype;
  generated_token text;
  token_id uuid;
  token_expires_at timestamptz;
  ttl_minutes integer := greatest(5, least(coalesce(p_ttl_minutes, 10080), 43200));
begin
  select * into invitation_record
  from public.event_invitations
  where id = p_invitation_id;

  if invitation_record.id is null
    or invitation_record.member_status_at_invite <> 'pending' then
    raise exception 'A pending-member invitation is required.' using errcode = '22023';
  end if;

  if p_action_id is not null and not exists (
    select 1 from public.event_action_runs where id = p_action_id
  ) then
    raise exception 'The triggering action was not found.' using errcode = 'P0002';
  end if;

  generated_token := public.generate_payment_resume_secret();
  token_expires_at := now() + make_interval(mins => ttl_minutes);

  insert into public.event_invitation_access_tokens (
    invitation_id, action_id, token_hash, expires_at
  ) values (
    invitation_record.id,
    p_action_id,
    public.hash_payment_resume_secret(generated_token),
    token_expires_at
  ) returning id into token_id;

  return jsonb_build_object(
    'ok', true,
    'tokenId', token_id,
    'token', generated_token,
    'expiresAt', token_expires_at
  );
end;
$$;

create or replace function public.claim_event_invitation_access_token(
  p_token text,
  p_session_ttl_minutes integer default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.event_invitation_access_tokens%rowtype;
  invitation_record public.event_invitations%rowtype;
  generated_session text;
  session_expires_at timestamptz;
  ttl_minutes integer := greatest(5, least(coalesce(p_session_ttl_minutes, 1440), 10080));
begin
  if nullif(btrim(p_token), '') is null then
    return jsonb_build_object('ok', false);
  end if;

  select * into token_record
  from public.event_invitation_access_tokens
  where token_hash = public.hash_payment_resume_secret(p_token)
  for update;

  if token_record.id is null
    or token_record.used_at is not null
    or token_record.expires_at <= now() then
    return jsonb_build_object('ok', false);
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = token_record.invitation_id
  for update;

  if invitation_record.id is null
    or invitation_record.member_status_at_invite <> 'pending' then
    return jsonb_build_object('ok', false);
  end if;

  generated_session := public.generate_payment_resume_secret();
  session_expires_at := least(
    token_record.expires_at,
    now() + make_interval(mins => ttl_minutes)
  );

  update public.event_invitation_access_tokens
  set used_at = now()
  where id = token_record.id;

  insert into public.event_invitation_sessions (
    invitation_id, event_id, member_id, token_id, session_hash, expires_at
  ) values (
    invitation_record.id,
    invitation_record.event_id,
    invitation_record.member_id,
    token_record.id,
    public.hash_payment_resume_secret(generated_session),
    session_expires_at
  );

  return jsonb_build_object(
    'ok', true,
    'sessionToken', generated_session,
    'maxAgeSeconds', greatest(1, floor(extract(epoch from session_expires_at - now()))::integer),
    'expiresAt', session_expires_at
  );
end;
$$;

create or replace function public.resolve_event_invitation_session(
  p_session_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_record public.event_invitation_sessions%rowtype;
  invitation_record public.event_invitations%rowtype;
  member_record public.members%rowtype;
begin
  if nullif(btrim(p_session_token), '') is null then
    return jsonb_build_object('ok', false);
  end if;

  select * into session_record
  from public.event_invitation_sessions
  where session_hash = public.hash_payment_resume_secret(p_session_token)
    and expires_at > now();

  if session_record.id is null then
    return jsonb_build_object('ok', false);
  end if;

  select * into invitation_record
  from public.event_invitations where id = session_record.invitation_id;
  select * into member_record
  from public.members where id = session_record.member_id;

  if invitation_record.id is null or member_record.id is null then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessionId', session_record.id,
    'eventId', session_record.event_id,
    'invitationId', session_record.invitation_id,
    'memberId', session_record.member_id,
    'email', member_record.email,
    'locale', public.effective_member_locale(member_record.id),
    'membershipStatus', member_record.membership_status,
    'responseStatus', invitation_record.response_status,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'priorityAt', invitation_record.priority_at,
    'expiresAt', session_record.expires_at
  );
end;
$$;

create or replace function public.begin_event_invitation_payment(
  p_session_token text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.event_invitation_sessions%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  member_record public.members%rowtype;
  hold_record public.event_seat_holds%rowtype;
  attempt_record public.event_invitation_payment_attempts%rowtype;
  reason text;
  clean_key text := nullif(btrim(p_idempotency_key), '');
begin
  if clean_key is null or length(clean_key) > 100 then
    raise exception 'A payment idempotency key between 1 and 100 characters is required.'
      using errcode = '22023';
  end if;

  select * into session_record
  from public.event_invitation_sessions
  where session_hash = public.hash_payment_resume_secret(p_session_token)
    and expires_at > now();

  if session_record.id is null then
    raise exception 'The invitation session is invalid or expired.' using errcode = '28000';
  end if;

  -- Every seat mutation locks invitation before event.
  select * into invitation_record
  from public.event_invitations
  where id = session_record.invitation_id
    and member_id = session_record.member_id
  for update;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  select * into member_record
  from public.members
  where id = invitation_record.member_id
  for update;

  if invitation_record.id is null or event_record.id is null or member_record.id is null then
    raise exception 'The invitation is no longer available.' using errcode = 'P0002';
  end if;

  if invitation_record.seat_status = 'confirmed' then
    return jsonb_build_object(
      'ok', true, 'status', 'confirmed', 'paymentAttemptId', null,
      'eventId', event_record.id, 'invitationId', invitation_record.id,
      'memberId', member_record.id, 'email', member_record.email,
      'locale', public.effective_member_locale(member_record.id),
      'holdId', null, 'holdExpiresAt', null,
      'priorityAt', invitation_record.priority_at
    );
  end if;

  if member_record.membership_status = 'cancelled'
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    update public.event_invitations
    set response_status = case when response_status = 'invited' then 'expired' else response_status end,
        payment_status = case when payment_status = 'pending' then 'expired' else payment_status end,
        seat_status = case when seat_status = 'held' then 'none' else seat_status end,
        updated_at = now()
    where id = invitation_record.id;

    return jsonb_build_object(
      'ok', true, 'status', 'closed', 'paymentAttemptId', null,
      'eventId', event_record.id, 'invitationId', invitation_record.id,
      'memberId', member_record.id, 'email', member_record.email,
      'locale', public.effective_member_locale(member_record.id),
      'holdId', null, 'holdExpiresAt', null,
      'priorityAt', invitation_record.priority_at
    );
  end if;

  update public.event_seat_holds
  set status = 'expired', released_at = coalesce(released_at, now()), updated_at = now()
  where invitation_id = invitation_record.id
    and status = 'active'
    and expires_at <= now();

  select * into attempt_record
  from public.event_invitation_payment_attempts
  where idempotency_key = clean_key
  for update;

  if attempt_record.id is not null then
    if attempt_record.invitation_id <> invitation_record.id then
      raise exception 'The payment idempotency key belongs to another invitation.'
        using errcode = '23505';
    end if;

    select * into hold_record from public.event_seat_holds
    where id = attempt_record.hold_id;

    return jsonb_build_object(
      'ok', true,
      'status', case
        when invitation_record.seat_status = 'confirmed' then 'confirmed'
        when invitation_record.seat_status = 'waitlisted' then 'waitlisted'
        else 'checkout_required'
      end,
      'paymentAttemptId', attempt_record.id,
      'eventId', event_record.id,
      'invitationId', invitation_record.id,
      'memberId', member_record.id,
      'email', member_record.email,
      'locale', public.effective_member_locale(member_record.id),
      'holdId', hold_record.id,
      'holdExpiresAt', hold_record.expires_at,
      'priorityAt', invitation_record.priority_at
    );
  end if;

  if member_record.membership_status = 'active' then
    reason := public.event_seat_waitlist_reason(
      event_record.id, member_record.id, invitation_record.id
    );
    update public.event_invitations
    set response_status = 'accepted',
        seat_status = case when reason is null then 'confirmed' else 'waitlisted' end,
        payment_status = 'paid',
        waitlist_reason = reason,
        priority_at = coalesce(priority_at, now()),
        responded_at = coalesce(responded_at, now()),
        confirmed_at = case when reason is null then coalesce(confirmed_at, now()) else confirmed_at end,
        waitlisted_at = case when reason is not null then coalesce(waitlisted_at, now()) else waitlisted_at end,
        updated_at = now()
    where id = invitation_record.id;

    return jsonb_build_object(
      'ok', true, 'status', case when reason is null then 'confirmed' else 'waitlisted' end,
      'paymentAttemptId', null, 'eventId', event_record.id,
      'invitationId', invitation_record.id, 'memberId', member_record.id,
      'email', member_record.email,
      'locale', public.effective_member_locale(member_record.id),
      'holdId', null, 'holdExpiresAt', null,
      'priorityAt', coalesce(invitation_record.priority_at, now())
    );
  end if;

  if member_record.membership_status <> 'pending' then
    raise exception 'Pending membership is required.' using errcode = '22023';
  end if;

  reason := public.event_seat_waitlist_reason(
    event_record.id, member_record.id, invitation_record.id
  );

  update public.event_invitations
  set response_status = 'accepted',
      seat_status = case when reason is null then 'held' else 'waitlisted' end,
      payment_status = 'pending',
      waitlist_reason = reason,
      priority_at = coalesce(priority_at, now()),
      responded_at = coalesce(responded_at, now()),
      held_at = case when reason is null then now() else held_at end,
      waitlisted_at = case when reason is not null then coalesce(waitlisted_at, now()) else waitlisted_at end,
      updated_at = now()
  where id = invitation_record.id
  returning * into invitation_record;

  if reason is null then
    select * into hold_record
    from public.event_seat_holds
    where invitation_id = invitation_record.id
      and status = 'active'
      and expires_at > now()
    for update;

    if hold_record.id is null then
      insert into public.event_seat_holds (
        event_id, invitation_id, member_id, priority_at, expires_at
      ) values (
        event_record.id, invitation_record.id, member_record.id,
        invitation_record.priority_at, now() + interval '10 minutes'
      ) returning * into hold_record;
    end if;
  end if;

  insert into public.event_invitation_payment_attempts (
    event_id, invitation_id, hold_id, member_id, idempotency_key
  ) values (
    event_record.id, invitation_record.id, hold_record.id,
    member_record.id, clean_key
  ) returning * into attempt_record;

  return jsonb_build_object(
    'ok', true, 'status', 'checkout_required',
    'paymentAttemptId', attempt_record.id,
    'eventId', event_record.id, 'invitationId', invitation_record.id,
    'memberId', member_record.id, 'email', member_record.email,
    'locale', public.effective_member_locale(member_record.id),
    'holdId', hold_record.id, 'holdExpiresAt', hold_record.expires_at,
    'priorityAt', invitation_record.priority_at
  );
end;
$$;

create or replace function public.attach_event_checkout_session(
  p_payment_attempt_id uuid,
  p_checkout_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_record public.event_invitation_payment_attempts%rowtype;
  clean_session_id text := nullif(btrim(p_checkout_session_id), '');
begin
  if clean_session_id is null then
    raise exception 'A checkout session ID is required.' using errcode = '22023';
  end if;

  select * into attempt_record
  from public.event_invitation_payment_attempts
  where id = p_payment_attempt_id
  for update;

  if attempt_record.id is null then
    raise exception 'The payment attempt was not found.' using errcode = 'P0002';
  end if;
  if attempt_record.stripe_checkout_session_id is not null
    and attempt_record.stripe_checkout_session_id <> clean_session_id then
    raise exception 'The payment attempt is already attached to another checkout.'
      using errcode = '23505';
  end if;

  update public.event_invitation_payment_attempts
  set stripe_checkout_session_id = clean_session_id,
      status = case when status = 'created' then 'checkout_created' else status end,
      checkout_created_at = coalesce(checkout_created_at, now()),
      updated_at = now()
  where id = attempt_record.id;

  return jsonb_build_object(
    'ok', true,
    'paymentAttemptId', attempt_record.id,
    'checkoutSessionId', clean_session_id,
    'status', 'checkout_created'
  );
end;
$$;

create or replace function public.decline_pending_event_invitation(
  p_session_token text,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.event_invitation_sessions%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  normalized_reason text := lower(btrim(coalesce(p_reason, '')));
  normalized_details text := nullif(btrim(coalesce(p_details, '')), '');
  delivery_id uuid;
begin
  if normalized_reason not in (
    'weekend_unavailable', 'prefers_sunday_brunch', 'event_fit',
    'other_commitment', 'prefer_not_to_say'
  ) or char_length(normalized_details) > 500 then
    raise exception 'A valid decline reason is required.' using errcode = '22023';
  end if;

  select * into session_record
  from public.event_invitation_sessions
  where session_hash = public.hash_payment_resume_secret(p_session_token)
    and expires_at > now();
  if session_record.id is null then
    raise exception 'The invitation session is invalid or expired.' using errcode = '28000';
  end if;

  select * into invitation_record from public.event_invitations
  where id = session_record.invitation_id and member_id = session_record.member_id
  for update;
  select * into event_record from public.events
  where id = invitation_record.event_id for update;

  if invitation_record.member_status_at_invite <> 'pending'
    or invitation_record.seat_status in ('confirmed', 'cancelled', 'replaced')
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'This invitation can no longer be declined.' using errcode = '22023';
  end if;

  update public.event_seat_holds
  set status = 'released', released_at = coalesce(released_at, now()), updated_at = now()
  where invitation_id = invitation_record.id and status = 'active';
  update public.event_invitation_payment_attempts
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
  where invitation_id = invitation_record.id and status in ('created', 'checkout_created');
  update public.event_invitations
  set response_status = 'declined', seat_status = 'none',
      payment_status = case when payment_status = 'pending' then 'expired' else payment_status end,
      waitlist_reason = null, responded_at = coalesce(responded_at, now()),
      updated_at = now()
  where id = invitation_record.id returning * into invitation_record;

  if not exists (
    select 1 from public.event_invitation_declines
    where invitation_id = invitation_record.id
  ) then
    insert into public.event_invitation_declines (
      invitation_id, event_id, member_id, reason, details
    ) values (
      invitation_record.id, invitation_record.event_id,
      invitation_record.member_id, normalized_reason, normalized_details
    );
  end if;

  delivery_id := public.queue_event_email_delivery(
    event_record.id, invitation_record.id, invitation_record.member_id,
    null, invitation_record.member_id, null, 'cancellation_received',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('responseStatus', 'declined'),
    'pending-member-decline-' || invitation_record.id::text
  );

  return jsonb_build_object(
    'ok', true, 'eventId', event_record.id,
    'responseStatus', 'declined', 'seatStatus', 'none',
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', null, 'deliveryId', delivery_id
  );
end;
$$;

create or replace function public.complete_event_invitation_payment(
  p_payment_attempt_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_stripe_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_snapshot public.event_invitation_payment_attempts%rowtype;
  attempt_record public.event_invitation_payment_attempts%rowtype;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  member_record public.members%rowtype;
  hold_record public.event_seat_holds%rowtype;
  existing_receipt public.stripe_event_receipts%rowtype;
  clean_checkout_id text := nullif(btrim(p_checkout_session_id), '');
  clean_event_id text := nullif(btrim(p_stripe_event_id), '');
  waitlist_reason_value text;
  hold_was_expired boolean := false;
  credit_balance integer;
  result_value jsonb;
  delivery_id uuid;
begin
  if clean_checkout_id is null or clean_event_id is null then
    raise exception 'Checkout session and Stripe event IDs are required.'
      using errcode = '22023';
  end if;

  -- Read identifiers without a row lock, then take every seat lock in the
  -- global invitation -> event order before locking payment state.
  select * into attempt_snapshot
  from public.event_invitation_payment_attempts
  where id = p_payment_attempt_id;

  if attempt_snapshot.id is null then
    raise exception 'The payment attempt was not found.' using errcode = 'P0002';
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = attempt_snapshot.invitation_id
  for update;

  select * into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  select * into attempt_record
  from public.event_invitation_payment_attempts
  where id = attempt_snapshot.id
  for update;

  select * into member_record
  from public.members
  where id = invitation_record.member_id
  for update;

  select * into existing_receipt
  from public.stripe_event_receipts
  where stripe_event_id = clean_event_id;

  if existing_receipt.stripe_event_id is not null then
    if existing_receipt.payment_attempt_id <> attempt_record.id then
      raise exception 'The Stripe event belongs to another payment attempt.'
        using errcode = '23505';
    end if;
    return existing_receipt.result;
  end if;

  if attempt_record.stripe_checkout_session_id is not null
    and attempt_record.stripe_checkout_session_id <> clean_checkout_id then
    raise exception 'The checkout session does not match the payment attempt.'
      using errcode = '22023';
  end if;

  if attempt_record.status = 'paid' then
    select coalesce(sum(delta), 0)::integer into credit_balance
    from public.credit_ledger_entries where member_id = member_record.id;

    result_value := jsonb_build_object(
      'ok', true, 'eventId', event_record.id,
      'invitationId', invitation_record.id, 'memberId', member_record.id,
      'membershipStatus', member_record.membership_status,
      'status', case when invitation_record.seat_status = 'confirmed' then 'confirmed' else 'waitlisted' end,
      'seatStatus', invitation_record.seat_status,
      'paymentStatus', invitation_record.payment_status,
      'waitlistReason', invitation_record.waitlist_reason,
      'creditAvailable', credit_balance > 0
    );
    insert into public.stripe_event_receipts (
      stripe_event_id, payment_attempt_id, event_type, result
    ) values (clean_event_id, attempt_record.id, 'checkout.session.completed', result_value);
    return result_value;
  end if;

  perform public.mark_member_active(member_record.id, 'event_stripe_checkout', now());
  perform public.grant_member_credit(
    member_record.id,
    1,
    'membership_join_credit',
    'event_payment_attempt',
    attempt_record.id::text,
    null,
    'Granted by event-linked membership checkout.',
    now()
  );
  perform public.ensure_referral_code_for_member(member_record.id, now());

  select * into hold_record
  from public.event_seat_holds
  where id = attempt_record.hold_id
  for update;

  hold_was_expired := hold_record.id is not null
    and (hold_record.status <> 'active' or hold_record.expires_at <= now());

  if hold_record.id is not null and hold_record.status = 'active'
    and hold_record.expires_at <= now() then
    update public.event_seat_holds
    set status = 'expired', released_at = coalesce(released_at, now()), updated_at = now()
    where id = hold_record.id;
  end if;

  waitlist_reason_value := public.event_seat_waitlist_reason(
    event_record.id, member_record.id, invitation_record.id
  );

  if waitlist_reason_value is null then
    perform public.grant_member_credit(
      member_record.id,
      -event_record.credit_cost,
      'event_confirmation',
      'event_invitation',
      invitation_record.id::text,
      null,
      'Spent for an event seat after membership checkout.',
      now()
    );

    update public.event_invitations
    set response_status = 'accepted',
        seat_status = 'confirmed',
        payment_status = 'paid',
        waitlist_reason = null,
        priority_at = coalesce(priority_at, hold_record.priority_at, now()),
        responded_at = coalesce(responded_at, now()),
        confirmed_at = coalesce(confirmed_at, now()),
        payment_completed_at = coalesce(payment_completed_at, now()),
        updated_at = now()
    where id = invitation_record.id
    returning * into invitation_record;

    if hold_record.id is not null then
      update public.event_seat_holds
      set status = 'converted', converted_at = coalesce(converted_at, now()), updated_at = now()
      where id = hold_record.id;
    end if;

    insert into public.event_attendees (
      event_id, member_id, invitation_id, status, is_host, created_at, updated_at
    ) values (
      event_record.id, member_record.id, invitation_record.id,
      'confirmed', false, now(), now()
    ) on conflict (event_id, member_id) do update
    set invitation_id = excluded.invitation_id,
        status = 'confirmed',
        updated_at = now();

    delivery_id := public.queue_event_email_delivery(
      event_record.id, invitation_record.id, member_record.id,
      null, member_record.id, null, 'seat_confirmed',
      public.event_frozen_payload(event_record.id, invitation_record.id)
        || jsonb_build_object('seatStatus', 'confirmed', 'paymentCompleted', true),
      'pending-payment-seat-confirmed-' || invitation_record.id::text
    );
  else
    update public.event_invitations
    set response_status = 'accepted',
        seat_status = 'waitlisted',
        payment_status = 'paid',
        waitlist_reason = case
          when hold_was_expired then 'payment_hold_expired'
          else waitlist_reason_value
        end,
        priority_at = coalesce(priority_at, hold_record.priority_at, now()),
        responded_at = coalesce(responded_at, now()),
        waitlisted_at = coalesce(waitlisted_at, now()),
        payment_completed_at = coalesce(payment_completed_at, now()),
        updated_at = now()
    where id = invitation_record.id
    returning * into invitation_record;

    if hold_record.id is not null and hold_record.status = 'active' then
      update public.event_seat_holds
      set status = 'released', released_at = coalesce(released_at, now()), updated_at = now()
      where id = hold_record.id;
    end if;

    delivery_id := public.queue_event_email_delivery(
      event_record.id, invitation_record.id, member_record.id,
      null, member_record.id, null,
      case when waitlist_reason_value = 'balance' then 'waitlist_balance' else 'waitlist_capacity' end,
      public.event_frozen_payload(event_record.id, invitation_record.id)
        || jsonb_build_object(
          'seatStatus', 'waitlisted',
          'waitlistReason', invitation_record.waitlist_reason,
          'creditAvailable', true
        ),
      'pending-payment-waitlisted-' || invitation_record.id::text
    );
  end if;

  update public.event_invitation_payment_attempts
  set stripe_checkout_session_id = clean_checkout_id,
      stripe_payment_intent_id = nullif(btrim(p_payment_intent_id), ''),
      status = 'paid',
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
  where id = attempt_record.id;

  select coalesce(sum(delta), 0)::integer into credit_balance
  from public.credit_ledger_entries where member_id = member_record.id;

  result_value := jsonb_build_object(
    'ok', true,
    'eventId', event_record.id,
    'invitationId', invitation_record.id,
    'memberId', member_record.id,
    'membershipStatus', 'active',
    'status', case when invitation_record.seat_status = 'confirmed' then 'confirmed' else 'waitlisted' end,
    'seatStatus', invitation_record.seat_status,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'creditAvailable', credit_balance > 0,
    'deliveryId', delivery_id
  );

  insert into public.stripe_event_receipts (
    stripe_event_id, payment_attempt_id, event_type, result
  ) values (clean_event_id, attempt_record.id, 'checkout.session.completed', result_value);

  return result_value;
end;
$$;

create or replace function public.get_event_invitation_payment_result(
  p_session_token text,
  p_checkout_session_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_record public.event_invitation_sessions%rowtype;
  invitation_record public.event_invitations%rowtype;
  attempt_record public.event_invitation_payment_attempts%rowtype;
  credit_balance integer;
  public_status text;
begin
  select * into session_record
  from public.event_invitation_sessions
  where session_hash = public.hash_payment_resume_secret(p_session_token)
    and expires_at > now();

  if session_record.id is null then
    return jsonb_build_object(
      'ok', false, 'status', 'failed', 'eventId', null,
      'seatStatus', 'none', 'paymentStatus', 'failed',
      'waitlistReason', null, 'creditAvailable', false, 'loginNext', '/login'
    );
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = session_record.invitation_id;

  select * into attempt_record
  from public.event_invitation_payment_attempts
  where invitation_id = invitation_record.id
    and stripe_checkout_session_id = nullif(btrim(p_checkout_session_id), '')
  order by created_at desc
  limit 1;

  select coalesce(sum(delta), 0)::integer into credit_balance
  from public.credit_ledger_entries where member_id = session_record.member_id;

  public_status := case
    when invitation_record.seat_status = 'confirmed' then 'confirmed'
    when invitation_record.seat_status = 'waitlisted' and invitation_record.payment_status = 'paid' then 'waitlisted'
    when attempt_record.status in ('created', 'checkout_created') then 'payment_pending'
    else 'failed'
  end;

  return jsonb_build_object(
    'ok', public_status <> 'failed',
    'status', public_status,
    'eventId', invitation_record.event_id,
    'seatStatus', case
      when invitation_record.seat_status in ('confirmed', 'waitlisted', 'held')
        then invitation_record.seat_status
      else 'none'
    end,
    'paymentStatus', invitation_record.payment_status,
    'waitlistReason', invitation_record.waitlist_reason,
    'creditAvailable', credit_balance > 0,
    'loginNext', '/events/' || invitation_record.event_id::text
  );
end;
$$;

revoke all on function public.create_event_invitation_access_token(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.claim_event_invitation_access_token(text, integer)
  from public, anon, authenticated;
revoke all on function public.resolve_event_invitation_session(text)
  from public, anon, authenticated;
revoke all on function public.begin_event_invitation_payment(text, text)
  from public, anon, authenticated;
revoke all on function public.attach_event_checkout_session(uuid, text)
  from public, anon, authenticated;
revoke all on function public.decline_pending_event_invitation(text, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_event_invitation_payment(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_event_invitation_payment_result(text, text)
  from public, anon, authenticated;

grant execute on function public.create_event_invitation_access_token(uuid, uuid, integer)
  to service_role;
grant execute on function public.claim_event_invitation_access_token(text, integer)
  to service_role;
grant execute on function public.resolve_event_invitation_session(text)
  to service_role;
grant execute on function public.begin_event_invitation_payment(text, text)
  to service_role;
grant execute on function public.attach_event_checkout_session(uuid, text)
  to service_role;
grant execute on function public.decline_pending_event_invitation(text, text, text)
  to service_role;
grant execute on function public.complete_event_invitation_payment(uuid, text, text, text)
  to service_role;
grant execute on function public.get_event_invitation_payment_result(text, text)
  to service_role;

create or replace function public.refresh_event_summary_snapshot(
  p_event_id uuid,
  p_stage text,
  p_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  age_min_value integer;
  age_max_value integer;
  source_count_value integer;
  top_intention text;
  top_intention_count integer := 0;
  majority_value text;
begin
  if p_stage not in ('proposed', 'confirmed') then
    raise exception 'Unknown event summary stage.' using errcode = '22023';
  end if;

  select * into event_record from public.events where id = p_event_id;
  if event_record.id is null then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;

  with source as (
    select latest.profile_json
    from public.event_invitations as invitations
    join public.members as members on members.id = invitations.member_id
    left join lateral (
      select registrations.profile_json
      from public.profile_registrations as registrations
      where registrations.contact_email_norm = members.email_norm
        and registrations.status = 'submitted'
      order by registrations.updated_at desc
      limit 1
    ) as latest on true
    where invitations.event_id = p_event_id
      and (p_stage = 'proposed' or invitations.seat_status = 'confirmed')
  )
  select
    min(case when profile_json ->> 'profile.age' ~ '^[0-9]{2,3}$'
      then (profile_json ->> 'profile.age')::integer end),
    max(case when profile_json ->> 'profile.age' ~ '^[0-9]{2,3}$'
      then (profile_json ->> 'profile.age')::integer end),
    count(*)::integer
  into age_min_value, age_max_value, source_count_value
  from source;

  with intentions as (
    select nullif(btrim(latest.profile_json ->> 'profile.available_relationships'), '') as intention
    from public.event_invitations as invitations
    join public.members as members on members.id = invitations.member_id
    left join lateral (
      select registrations.profile_json
      from public.profile_registrations as registrations
      where registrations.contact_email_norm = members.email_norm
        and registrations.status = 'submitted'
      order by registrations.updated_at desc
      limit 1
    ) as latest on true
    where invitations.event_id = p_event_id
      and (p_stage = 'proposed' or invitations.seat_status = 'confirmed')
  )
  select intention, count(*)::integer
  into top_intention, top_intention_count
  from intentions
  where intention is not null
  group by intention
  order by count(*) desc, intention
  limit 1;

  top_intention_count := coalesce(top_intention_count, 0);

  majority_value := case
    when top_intention_count >= 4
      and top_intention_count * 2 > source_count_value
      then top_intention
    else null
  end;

  -- Founder-entered aggregate wording is authoritative for the public event
  -- summary. Fall back to the calculated majority when no override was set.
  majority_value := coalesce(
    nullif(btrim(
      event_record.localized_content
        -> coalesce(nullif(event_record.language_code, ''), 'en')
        ->> 'majority_intention_override'
    ), ''),
    majority_value
  );

  insert into public.event_summary_snapshots (
    event_id, stage, age_min, age_max, primary_language,
    additional_languages, majority_intention, majority_source_count,
    source_count, calculated_at, created_action_id
  ) values (
    event_record.id, p_stage, age_min_value, age_max_value,
    event_record.language_code, '[]'::jsonb, majority_value,
    top_intention_count, source_count_value, now(), p_action_id
  ) on conflict (event_id, stage) do update
  set age_min = excluded.age_min,
      age_max = excluded.age_max,
      primary_language = excluded.primary_language,
      additional_languages = excluded.additional_languages,
      majority_intention = excluded.majority_intention,
      majority_source_count = excluded.majority_source_count,
      source_count = excluded.source_count,
      calculated_at = excluded.calculated_at,
      created_action_id = excluded.created_action_id;

  return jsonb_build_object(
    'ageMin', age_min_value,
    'ageMax', age_max_value,
    'primaryLanguage', event_record.language_code,
    'additionalLanguages', '[]'::jsonb,
    'majorityIntention', majority_value,
    'sourceCount', source_count_value
  );
end;
$$;

create or replace function public.prepare_event_from_matching_group(
  p_matching_group_id uuid,
  p_title text,
  p_description text,
  p_localized_content jsonb,
  p_event_format text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_city text,
  p_language_code text,
  p_capacity integer,
  p_invitation_limit integer,
  p_invitation_send_at timestamptz,
  p_rsvp_deadline_at timestamptz,
  p_minimum_confirmed_count integer,
  p_minimum_run_count integer,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_record ops.matching_groups%rowtype;
  existing_action public.event_action_runs%rowtype;
  action_id uuid;
  event_id_value uuid;
  invitation_count_value integer;
  cancelled_count integer;
  summary_value jsonb;
  result_value jsonb;
  clean_key text := nullif(btrim(p_idempotency_key), '');
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  if clean_key is null or length(clean_key) > 100 then
    raise exception 'A valid idempotency key is required.' using errcode = '22023';
  end if;

  select * into existing_action
  from public.event_action_runs
  where idempotency_key = clean_key
  for update;

  if existing_action.id is not null then
    if existing_action.action_type <> 'prepare_event_from_matching_group'
      or existing_action.actor_admin_id <> p_admin_id
      or existing_action.parameters ->> 'matchingGroupId' <> p_matching_group_id::text then
      raise exception 'The idempotency key is already used by another event action.'
        using errcode = '23505';
    end if;
    if existing_action.status = 'succeeded' then
      return existing_action.result;
    end if;
    action_id := existing_action.id;
  else
    insert into public.event_action_runs (
      event_id, action_type, idempotency_key, actor_admin_id, parameters
    ) values (
      null, 'prepare_event_from_matching_group', clean_key, p_admin_id,
      jsonb_build_object('matchingGroupId', p_matching_group_id)
    ) returning id into action_id;
  end if;

  select * into group_record
  from ops.matching_groups
  where id = p_matching_group_id
  for update;

  if group_record.id is null then
    raise exception 'Matching group was not found.' using errcode = 'P0002';
  end if;
  if group_record.status <> 'fixed' then
    raise exception 'Only a fixed matching group can prepare an event.' using errcode = '22023';
  end if;

  if group_record.event_id is not null then
    select count(*)::integer into invitation_count_value
    from public.event_invitations where event_id = group_record.event_id;
    select jsonb_build_object(
      'ageMin', age_min, 'ageMax', age_max,
      'primaryLanguage', primary_language,
      'additionalLanguages', additional_languages,
      'majorityIntention', majority_intention,
      'sourceCount', source_count
    ) into summary_value
    from public.event_summary_snapshots
    where event_id = group_record.event_id and stage = 'proposed';

    result_value := jsonb_build_object(
      'ok', true, 'actionId', action_id, 'eventId', group_record.event_id,
      'matchingGroupId', group_record.id, 'status', 'draft',
      'created', false, 'invitationCount', invitation_count_value,
      'summary', coalesce(summary_value, '{}'::jsonb)
    );
    update public.event_action_runs
    set event_id = group_record.event_id where id = action_id;
    return public.finish_event_action(action_id, result_value);
  end if;

  if p_event_format not in ('dinner', 'brunch', 'other')
    or p_language_code not in ('en', 'es')
    or p_starts_at is null
    or p_ends_at is not null and p_ends_at <= p_starts_at
    or p_rsvp_deadline_at is null or p_rsvp_deadline_at >= p_starts_at
    or p_capacity <= 0
    or p_invitation_limit < p_capacity
    or p_minimum_run_count <= 0
    or p_minimum_confirmed_count < p_minimum_run_count
    or p_minimum_confirmed_count > p_capacity then
    raise exception 'Event timing, language, format, or operating limits are invalid.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'A valid IANA timezone is required.' using errcode = '22023';
  end if;

  select count(*)::integer,
    count(*) filter (where members.membership_status = 'cancelled')::integer
  into invitation_count_value, cancelled_count
  from ops.matching_group_members as group_members
  join public.members as members on members.id = group_members.member_id
  where group_members.group_id = group_record.id;

  if invitation_count_value = 0 or invitation_count_value > p_invitation_limit then
    raise exception 'The fixed group is empty or exceeds the invitation limit.'
      using errcode = '23514';
  end if;
  if cancelled_count > 0 then
    raise exception 'Cancelled members cannot be included in event preparation.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from ops.matching_group_members as group_members
    join public.members as members on members.id = group_members.member_id
    where group_members.group_id = group_record.id
      and members.membership_status not in ('active', 'pending')
  ) then
    raise exception 'Every group member must be active or pending.' using errcode = '23514';
  end if;

  insert into public.events (
    matching_group_id, title, description, localized_content,
    event_format, status, starts_at, ends_at, timezone, city,
    capacity, invitation_limit, invitation_send_at, rsvp_deadline_at,
    minimum_confirmed_count, minimum_run_count, language_code,
    prepared_at, created_at, updated_at
  ) values (
    group_record.id, nullif(btrim(p_title), ''), p_description,
    coalesce(p_localized_content, '{}'::jsonb), p_event_format, 'draft',
    p_starts_at, p_ends_at, p_timezone, p_city,
    p_capacity, p_invitation_limit, p_invitation_send_at, p_rsvp_deadline_at,
    p_minimum_confirmed_count, p_minimum_run_count, p_language_code,
    now(), now(), now()
  ) returning id into event_id_value;

  insert into public.event_invitations (
    event_id, member_id, status, response_status, seat_status,
    payment_status, waitlist_reason, member_status_at_invite,
    invited_at, created_at, updated_at
  )
  select
    event_id_value, members.id, 'invited', 'invited', 'none',
    case when members.membership_status = 'pending' then 'pending' else 'not_required' end,
    null, members.membership_status, now(), now(), now()
  from ops.matching_group_members as group_members
  join public.members as members on members.id = group_members.member_id
  where group_members.group_id = group_record.id
  order by group_members.display_order;

  update ops.matching_groups
  set event_id = event_id_value,
      updated_by = p_admin_id,
      updated_at = now()
  where id = group_record.id;

  update public.event_action_runs
  set event_id = event_id_value, updated_at = now()
  where id = action_id;

  summary_value := public.refresh_event_summary_snapshot(
    event_id_value, 'proposed', action_id
  );

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_id_value,
    'matchingGroupId', group_record.id, 'status', 'draft',
    'created', true, 'invitationCount', invitation_count_value,
    'summary', summary_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.open_event_invitations(
  p_event_id uuid,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_info jsonb;
  action_id uuid;
  event_record public.events%rowtype;
  invitation_record public.event_invitations%rowtype;
  transitioned_value boolean := false;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'open_event_invitations', p_admin_id, null,
    p_idempotency_key, '{}'::jsonb
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status <> 'draft' then
    raise exception 'Only a draft event can open invitations.' using errcode = '22023';
  end if;

  update public.events
  set status = 'inviting',
      invitation_send_at = now(),
      invitations_opened_at = now(),
      updated_at = now()
  where id = event_record.id
  returning * into event_record;
  transitioned_value := true;

  for invitation_record in
    select * from public.event_invitations
    where event_id = event_record.id
    order by created_at, id
  loop
    perform public.queue_event_email_delivery(
      event_record.id, invitation_record.id, invitation_record.member_id,
      p_admin_id, null, action_id,
      case when invitation_record.member_status_at_invite = 'pending'
        then 'invitation_pending' else 'invitation_member' end,
      public.event_frozen_payload(event_record.id, invitation_record.id)
        || jsonb_build_object('memberStatusAtInvite', invitation_record.member_status_at_invite),
      'event-open-' || event_record.id::text || '-' || invitation_record.id::text
    );
    delivery_count_value := delivery_count_value + 1;
  end loop;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'status', 'inviting', 'transitioned', transitioned_value,
    'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.set_event_capacity(
  p_event_id uuid,
  p_capacity integer,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_info jsonb;
  action_id uuid;
  event_record public.events%rowtype;
  invitation_record public.event_invitations%rowtype;
  previous_capacity integer;
  promoted_count integer := 0;
  delivery_count_value integer := 0;
  reason text;
  balance integer;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'set_event_capacity', p_admin_id, null, p_idempotency_key,
    jsonb_build_object('capacity', p_capacity)
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  perform 1 from public.event_invitations
  where event_id = p_event_id
  order by id
  for update;
  select * into event_record from public.events where id = p_event_id for update;

  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    raise exception 'Capacity can only increase while RSVP is open.' using errcode = '22023';
  end if;
  if p_capacity <= event_record.capacity or p_capacity > event_record.invitation_limit then
    raise exception 'Capacity must increase without exceeding the invitation limit.' using errcode = '22023';
  end if;

  previous_capacity := event_record.capacity;
  update public.events set capacity = p_capacity, updated_at = now()
  where id = event_record.id returning * into event_record;

  for invitation_record in
    select * from public.event_invitations
    where event_id = event_record.id
      and seat_status = 'waitlisted'
    order by priority_at asc nulls last, created_at, id
  loop
    reason := public.event_seat_waitlist_reason(
      event_record.id, invitation_record.member_id, invitation_record.id
    );
    select coalesce(sum(delta), 0)::integer into balance
    from public.credit_ledger_entries
    where member_id = invitation_record.member_id;

    if reason is null and balance >= event_record.credit_cost then
      perform public.grant_member_credit(
        invitation_record.member_id, -event_record.credit_cost,
        'event_confirmation', 'event_invitation', invitation_record.id::text,
        null, 'Spent when promoted after a founder capacity increase.', now()
      );
      update public.event_invitations
      set response_status = 'accepted', seat_status = 'confirmed',
          waitlist_reason = null, confirmed_at = coalesce(confirmed_at, now()),
          updated_at = now()
      where id = invitation_record.id;
      insert into public.event_attendees (
        event_id, member_id, invitation_id, status, is_host, created_at, updated_at
      ) values (
        event_record.id, invitation_record.member_id, invitation_record.id,
        'confirmed', false, now(), now()
      ) on conflict (event_id, member_id) do update
      set invitation_id = excluded.invitation_id,
          status = 'confirmed', updated_at = now();
      perform public.queue_event_email_delivery(
        event_record.id, invitation_record.id, invitation_record.member_id,
        p_admin_id, null, action_id, 'seat_confirmed',
        public.event_frozen_payload(event_record.id, invitation_record.id)
          || jsonb_build_object('promotedAfterCapacityIncrease', true),
        'capacity-promotion-' || action_id::text || '-' || invitation_record.id::text
      );
      promoted_count := promoted_count + 1;
      delivery_count_value := delivery_count_value + 1;
    end if;
  end loop;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'capacity', event_record.capacity, 'previousCapacity', previous_capacity,
    'promotedCount', promoted_count, 'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.confirm_event_and_release_details(
  p_event_id uuid,
  p_venue_name text,
  p_venue_address text,
  p_restaurant_image_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_event_instructions text,
  p_member_notes text,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_info jsonb;
  action_id uuid;
  event_record public.events%rowtype;
  invitation_record public.event_invitations%rowtype;
  confirmed_count_value integer;
  transitioned_value boolean := false;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'confirm_event_and_release_details', p_admin_id, null,
    p_idempotency_key,
    jsonb_build_object(
      'startsAt', p_starts_at, 'endsAt', p_ends_at,
      'hasVenue', nullif(btrim(p_venue_name), '') is not null,
      'hasAddress', nullif(btrim(p_venue_address), '') is not null
    )
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  perform 1 from public.event_invitations
  where event_id = p_event_id order by id for update;
  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status <> 'inviting' then
    raise exception 'Only an inviting event can release confirmation.' using errcode = '22023';
  end if;
  if nullif(btrim(p_venue_name), '') is null
    or nullif(btrim(p_venue_address), '') is null
    or p_starts_at is null
    or p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Final event time and venue details are required.' using errcode = '22023';
  end if;

  select count(*)::integer into confirmed_count_value
  from public.event_invitations
  where event_id = event_record.id and seat_status = 'confirmed';
  if confirmed_count_value < event_record.minimum_confirmed_count then
    raise exception 'The event has not reached its minimum confirmed count.' using errcode = '23514';
  end if;

  update public.events
  set status = 'confirmed', venue_name = btrim(p_venue_name),
      venue_address = btrim(p_venue_address),
      restaurant_image_url = nullif(btrim(p_restaurant_image_url), ''),
      starts_at = p_starts_at, ends_at = p_ends_at,
      event_instructions = nullif(btrim(p_event_instructions), ''),
      member_notes = nullif(btrim(p_member_notes), ''),
      venue_confirmed_at = now(), confirmation_released_at = now(),
      updated_at = now()
  where id = event_record.id returning * into event_record;
  transitioned_value := true;

  perform public.refresh_event_summary_snapshot(event_record.id, 'confirmed', action_id);

  for invitation_record in
    select * from public.event_invitations
    where event_id = event_record.id and seat_status = 'confirmed'
    order by created_at, id
  loop
    perform public.queue_event_email_delivery(
      event_record.id, invitation_record.id, invitation_record.member_id,
      p_admin_id, null, action_id, 'event_confirmed',
      public.event_frozen_payload(event_record.id, invitation_record.id),
      'event-confirmed-' || event_record.id::text || '-' || invitation_record.id::text
    );
    delivery_count_value := delivery_count_value + 1;
  end loop;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'status', 'confirmed', 'transitioned', transitioned_value,
    'confirmedCount', confirmed_count_value,
    'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.cancel_event(
  p_event_id uuid,
  p_reason text,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_info jsonb;
  action_id uuid;
  event_record public.events%rowtype;
  invitation_record public.event_invitations%rowtype;
  transitioned_value boolean := false;
  affected_count integer := 0;
  refunded_count integer := 0;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A cancellation reason is required.' using errcode = '22023';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'cancel_event', p_admin_id, null, p_idempotency_key,
    jsonb_build_object('reason', btrim(p_reason))
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  perform 1 from public.event_invitations
  where event_id = p_event_id order by id for update;
  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status not in ('draft', 'inviting', 'confirmed') then
    raise exception 'Completed events cannot be cancelled.' using errcode = '22023';
  end if;

  update public.events
  set status = 'cancelled', cancellation_reason = btrim(p_reason),
      cancelled_at = now(), updated_at = now()
  where id = event_record.id returning * into event_record;
  transitioned_value := true;

  update public.event_seat_holds
  set status = 'released', released_at = coalesce(released_at, now()), updated_at = now()
  where event_id = event_record.id and status = 'active';

  for invitation_record in
    select * from public.event_invitations
    where event_id = event_record.id
    order by created_at, id
  loop
    if invitation_record.seat_status = 'confirmed' then
      affected_count := affected_count + 1;
      if exists (
        select 1 from public.credit_ledger_entries
        where member_id = invitation_record.member_id
          and reason = 'event_confirmation'
          and source_type = 'event_invitation'
          and source_id = invitation_record.id::text
      ) then
        perform public.grant_member_credit(
          invitation_record.member_id, event_record.credit_cost,
          'event_cancelled_refund', 'event_invitation', invitation_record.id::text,
          null, 'Returned because the founders cancelled the event.', now()
        );
        refunded_count := refunded_count + 1;
      end if;
    end if;

    update public.event_invitations
    set seat_status = case
          when seat_status in ('confirmed', 'held', 'waitlisted') then 'cancelled'
          else seat_status
        end,
        payment_status = case when payment_status = 'pending' then 'expired' else payment_status end,
        waitlist_reason = null,
        cancelled_at = case
          when seat_status in ('confirmed', 'held', 'waitlisted') then coalesce(cancelled_at, now())
          else cancelled_at
        end,
        updated_at = now()
    where id = invitation_record.id;

    if event_record.invitations_opened_at is not null then
      perform public.queue_event_email_delivery(
        event_record.id, invitation_record.id, invitation_record.member_id,
        p_admin_id, null, action_id, 'event_cancelled',
        public.event_frozen_payload(event_record.id, invitation_record.id)
          || jsonb_build_object('cancellationReason', event_record.cancellation_reason),
        'event-cancelled-' || event_record.id::text || '-' || invitation_record.id::text
      );
      delivery_count_value := delivery_count_value + 1;
    end if;
  end loop;

  update public.event_attendees
  set status = 'cancelled', is_host = false, updated_at = now()
  where event_id = event_record.id;
  delete from public.event_hosts where event_id = event_record.id;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'status', 'cancelled', 'transitioned', transitioned_value,
    'affectedSeatCount', affected_count,
    'refundedCreditCount', refunded_count,
    'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.assign_event_host(
  p_event_id uuid,
  p_member_id uuid,
  p_public_intro text,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_info jsonb;
  action_id uuid;
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  host_record public.event_hosts%rowtype;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'assign_event_host', p_admin_id, null, p_idempotency_key,
    jsonb_build_object('memberId', p_member_id)
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into invitation_record
  from public.event_invitations
  where event_id = p_event_id and member_id = p_member_id
  for update;
  select * into event_record from public.events where id = p_event_id for update;

  if invitation_record.id is null or invitation_record.seat_status <> 'confirmed' then
    raise exception 'The host must hold a confirmed, non-cancelled seat.' using errcode = '22023';
  end if;
  if event_record.status not in ('inviting', 'confirmed') then
    raise exception 'A host cannot be assigned in this event state.' using errcode = '22023';
  end if;

  select * into host_record from public.event_hosts where event_id = event_record.id for update;
  if host_record.event_id is not null and host_record.member_id <> p_member_id then
    update public.event_attendees
    set is_host = false, status = 'confirmed', updated_at = now()
    where event_id = event_record.id and member_id = host_record.member_id;
  end if;

  insert into public.event_hosts (
    event_id, member_id, invitation_id, public_intro,
    assigned_by_admin_id, assigned_action_id, assigned_at, updated_at
  ) values (
    event_record.id, p_member_id, invitation_record.id,
    nullif(btrim(p_public_intro), ''), p_admin_id, action_id, now(), now()
  ) on conflict (event_id) do update
  set member_id = excluded.member_id,
      invitation_id = excluded.invitation_id,
      public_intro = excluded.public_intro,
      assigned_by_admin_id = excluded.assigned_by_admin_id,
      assigned_action_id = excluded.assigned_action_id,
      assigned_at = excluded.assigned_at,
      updated_at = now()
  returning * into host_record;

  update public.event_attendees
  set is_host = true, status = 'host', updated_at = now()
  where event_id = event_record.id and member_id = p_member_id;

  perform public.queue_event_email_delivery(
    event_record.id, invitation_record.id, invitation_record.member_id,
    p_admin_id, null, action_id, 'host_package',
    public.event_frozen_payload(event_record.id, invitation_record.id)
      || jsonb_build_object('hostPublicIntro', host_record.public_intro),
    'host-package-' || action_id::text || '-' || invitation_record.id::text
  );
  delivery_count_value := 1;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'hostMemberId', host_record.member_id,
    'assignedAt', host_record.assigned_at,
    'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.mark_event_completed(
  p_event_id uuid,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_info jsonb;
  action_id uuid;
  event_record public.events%rowtype;
  transitioned_value boolean := false;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  action_info := public.begin_event_action(
    p_event_id, 'mark_event_completed', p_admin_id, null,
    p_idempotency_key, '{}'::jsonb
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;
  if event_record.status <> 'confirmed' then
    raise exception 'Only a confirmed event can be completed.' using errcode = '22023';
  end if;
  if event_record.starts_at > now() then
    raise exception 'An event cannot be completed before it starts.' using errcode = '22023';
  end if;

  update public.events
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = event_record.id returning * into event_record;
  transitioned_value := true;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'status', 'completed', 'transitioned', transitioned_value,
    'completedAt', event_record.completed_at
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.record_event_replacement(
  p_cancelled_invitation_id uuid,
  p_replacement_invitation_id uuid,
  p_refund_eligible boolean,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled_record public.event_invitations%rowtype;
  replacement_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  replacement_state public.event_replacements%rowtype;
  action_info jsonb;
  action_id uuid;
  credit_refunded boolean := false;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  if p_replacement_invitation_id is not null
    and p_cancelled_invitation_id = p_replacement_invitation_id then
    raise exception 'Replacement invitations must be different.' using errcode = '22023';
  end if;

  -- Deterministic invitation locks preserve the global invitation -> event order.
  perform 1 from public.event_invitations
  where id in (p_cancelled_invitation_id, p_replacement_invitation_id)
  order by id for update;
  select * into cancelled_record from public.event_invitations
  where id = p_cancelled_invitation_id;
  select * into replacement_record from public.event_invitations
  where id = p_replacement_invitation_id;

  if cancelled_record.id is null
    or (p_replacement_invitation_id is not null and (
      replacement_record.id is null
      or cancelled_record.event_id <> replacement_record.event_id
    )) then
    raise exception 'Replacement invitations must belong to the same event.' using errcode = '22023';
  end if;

  action_info := public.begin_event_action(
    cancelled_record.event_id, 'record_event_replacement', p_admin_id, null,
    p_idempotency_key,
    jsonb_build_object(
      'cancelledInvitationId', p_cancelled_invitation_id,
      'replacementInvitationId', p_replacement_invitation_id,
      'refundEligible', coalesce(p_refund_eligible, false)
    )
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;

  select * into event_record from public.events
  where id = cancelled_record.event_id for update;
  if cancelled_record.seat_status <> 'cancelled'
    or cancelled_record.confirmed_at is null
    or (p_replacement_invitation_id is not null
      and replacement_record.seat_status <> 'confirmed') then
    raise exception 'A cancelled seat and, when supplied, a confirmed replacement are required.' using errcode = '22023';
  end if;

  insert into public.event_replacements (
    event_id, cancelled_invitation_id, replacement_invitation_id,
    status, refund_eligible_at, replaced_at,
    actor_admin_id, action_id, created_at, updated_at
  ) values (
    event_record.id, cancelled_record.id, replacement_record.id,
    case when p_replacement_invitation_id is null then 'no_replacement' else 'replaced' end,
    case when p_replacement_invitation_id is not null and p_refund_eligible then now() else null end,
    case when p_replacement_invitation_id is not null then now() else null end,
    p_admin_id, action_id, now(), now()
  ) on conflict (cancelled_invitation_id) do update
  set replacement_invitation_id = excluded.replacement_invitation_id,
      status = excluded.status,
      refund_eligible_at = excluded.refund_eligible_at,
      replaced_at = coalesce(public.event_replacements.replaced_at, excluded.replaced_at),
      actor_admin_id = excluded.actor_admin_id,
      action_id = excluded.action_id,
      updated_at = now()
  returning * into replacement_state;

  if p_replacement_invitation_id is not null then
    update public.event_invitations
    set seat_status = 'replaced', updated_at = now()
    where id = cancelled_record.id;
  end if;

  if p_replacement_invitation_id is not null
    and coalesce(p_refund_eligible, false) and exists (
    select 1 from public.credit_ledger_entries
    where member_id = cancelled_record.member_id
      and reason = 'event_confirmation'
      and source_type = 'event_invitation'
      and source_id = cancelled_record.id::text
  ) then
    perform public.grant_member_credit(
      cancelled_record.member_id, event_record.credit_cost,
      'event_waitlist_replacement_refund', 'event_invitation', cancelled_record.id::text,
      replacement_record.member_id,
      'Returned after a founder recorded the confirmed replacement.', now()
    );
    update public.event_replacements
    set refunded_at = coalesce(refunded_at, now()), updated_at = now()
    where id = replacement_state.id;
    credit_refunded := true;
  end if;

  perform public.queue_event_email_delivery(
    event_record.id, cancelled_record.id, cancelled_record.member_id,
    p_admin_id, null, action_id,
    case when p_replacement_invitation_id is null then 'no_replacement' else 'replacement_refund' end,
    public.event_frozen_payload(event_record.id, cancelled_record.id)
      || jsonb_build_object('creditRefunded', credit_refunded),
    'replacement-result-' || action_id::text || '-' || cancelled_record.id::text
  );
  delivery_count_value := 1;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'replacementId', replacement_state.id,
    'status', replacement_state.status,
    'creditRefunded', credit_refunded,
    'deliveryCount', delivery_count_value
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.prepare_event_email_deliveries(
  p_event_id uuid,
  p_email_type text,
  p_due_at timestamptz,
  p_admin_id uuid,
  p_admin_email text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_info jsonb;
  action_id uuid;
  event_record public.events%rowtype;
  recipient record;
  delivery_id uuid;
  delivery_ids jsonb := '[]'::jsonb;
  delivery_count_value integer := 0;
  result_value jsonb;
begin
  if not public.event_admin_is_authorized(p_admin_id, p_admin_email) then
    raise exception 'Founder authorization is required.' using errcode = '28000';
  end if;
  if p_email_type not in (
    'invitation_member', 'invitation_pending', 'rsvp_reminder',
    'event_confirmed', 'event_cancelled', 'host_package', 'event_reminder',
    'replacement_refund', 'no_replacement', 'late_cancellation_notice',
    'feedback_request', 'credit_offer'
  ) then
    raise exception 'This delivery type is not a founder batch command.' using errcode = '22023';
  end if;

  action_info := public.begin_event_action(
    p_event_id, 'prepare_event_email_deliveries', p_admin_id, null,
    p_idempotency_key,
    jsonb_build_object('emailType', p_email_type, 'dueAt', p_due_at)
  );
  if (action_info ->> 'replay')::boolean then return action_info -> 'result'; end if;
  action_id := (action_info ->> 'actionId')::uuid;
  select * into event_record from public.events where id = p_event_id for update;
  if event_record.id is null then raise exception 'Event was not found.' using errcode = 'P0002'; end if;

  for recipient in
    select invitations.id as invitation_id, invitations.member_id
    from public.event_invitations as invitations
    join public.members as members on members.id = invitations.member_id
    left join public.event_hosts as hosts
      on hosts.event_id = invitations.event_id and hosts.member_id = invitations.member_id
    left join public.event_feedback as feedback
      on feedback.event_id = invitations.event_id and feedback.member_id = invitations.member_id
    left join public.event_replacements as replacements
      on replacements.cancelled_invitation_id = invitations.id
    where invitations.event_id = event_record.id
      and case p_email_type
        when 'invitation_member' then invitations.member_status_at_invite = 'active'
          and invitations.response_status = 'invited'
        when 'invitation_pending' then invitations.member_status_at_invite = 'pending'
          and invitations.response_status = 'invited'
        when 'rsvp_reminder' then event_record.status = 'inviting'
          and invitations.response_status = 'invited'
          and now() < event_record.rsvp_deadline_at
        when 'event_confirmed' then event_record.status = 'confirmed'
          and invitations.seat_status = 'confirmed'
        when 'event_cancelled' then event_record.status = 'cancelled'
        when 'host_package' then hosts.member_id is not null
          and invitations.seat_status = 'confirmed'
        when 'event_reminder' then event_record.status = 'confirmed'
          and invitations.seat_status = 'confirmed'
        when 'replacement_refund' then replacements.refunded_at is not null
        when 'no_replacement' then replacements.status = 'no_replacement'
        when 'late_cancellation_notice' then replacements.status = 'eligible'
        when 'feedback_request' then invitations.seat_status = 'confirmed'
          and feedback.id is null
          and (event_record.status = 'completed' or coalesce(event_record.ends_at, event_record.starts_at) <= now())
        when 'credit_offer' then event_record.status = 'completed'
          and members.marketing_eligible
          and invitations.seat_status = 'confirmed'
          and feedback.id is not null
        else false
      end
    order by invitations.created_at, invitations.id
  loop
    delivery_id := public.queue_event_email_delivery(
      event_record.id, recipient.invitation_id, recipient.member_id,
      p_admin_id, null, action_id, p_email_type,
      public.event_frozen_payload(event_record.id, recipient.invitation_id),
      'founder-email-' || action_id::text || '-' || recipient.invitation_id::text,
      p_due_at
    );
    delivery_ids := delivery_ids || jsonb_build_array(delivery_id);
    delivery_count_value := delivery_count_value + 1;
  end loop;

  result_value := jsonb_build_object(
    'ok', true, 'actionId', action_id, 'eventId', event_record.id,
    'emailType', p_email_type, 'deliveryCount', delivery_count_value,
    'deliveryIds', delivery_ids
  );
  return public.finish_event_action(action_id, result_value);
end;
$$;

create or replace function public.claim_event_email_delivery(
  p_delivery_id uuid,
  p_action_id uuid,
  p_template_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.event_email_deliveries%rowtype;
  recipient_email text;
  token_result jsonb;
  raw_access_token text;
  access_token_id uuid;
  resolved_template_id text := nullif(btrim(p_template_id), '');
begin
  select * into delivery_record
  from public.event_email_deliveries
  where id = p_delivery_id
  for update;

  if delivery_record.id is null then
    raise exception 'Delivery was not found.' using errcode = 'P0002';
  end if;
  if delivery_record.triggering_action_id is distinct from p_action_id
    or (p_action_id is not null and not exists (
      select 1 from public.event_action_runs
      where id = p_action_id and event_id = delivery_record.event_id
    ))
    or (p_action_id is null and delivery_record.triggered_by_member_id is null) then
    raise exception 'The delivery action does not match.' using errcode = '28000';
  end if;
  if resolved_template_id is null then
    raise exception 'The resolved provider template or workflow ID is required.'
      using errcode = '22023';
  end if;
  if delivery_record.status not in ('draft', 'failed') then
    raise exception 'Only draft or failed deliveries can be claimed.' using errcode = '22023';
  end if;

  select email into recipient_email
  from public.members where id = delivery_record.member_id;
  if nullif(btrim(recipient_email), '') is null then
    raise exception 'The delivery recipient has no email address.' using errcode = '22023';
  end if;

  if delivery_record.email_type = 'invitation_pending' then
    update public.event_invitation_access_tokens
    set used_at = coalesce(used_at, now())
    where invitation_id = delivery_record.invitation_id
      and used_at is null;
    token_result := public.create_event_invitation_access_token(
      delivery_record.invitation_id, p_action_id, 10080
    );
    raw_access_token := token_result ->> 'token';
    access_token_id := (token_result ->> 'tokenId')::uuid;
  else
    access_token_id := delivery_record.invitation_access_token_id;
  end if;

  update public.event_email_deliveries
  set status = 'sending',
      template_id = resolved_template_id,
      invitation_access_token_id = access_token_id,
      attempts = attempts + 1,
      claimed_at = now(),
      last_attempt_at = now(),
      last_error = null,
      failed_at = null,
      updated_at = now()
  where id = delivery_record.id
  returning * into delivery_record;

  return jsonb_build_object(
    'ok', true,
    'deliveryId', delivery_record.id,
    'status', 'sending',
    'emailType', delivery_record.email_type,
    'recipientEmail', recipient_email,
    'locale', delivery_record.locale,
    'templateId', delivery_record.template_id,
    'templateVersion', delivery_record.template_version,
    'idempotencyKey', delivery_record.idempotency_key,
    'payload', delivery_record.payload,
    'invitationAccessTokenId', delivery_record.invitation_access_token_id,
    'invitationAccessToken', raw_access_token,
    'attempts', delivery_record.attempts
  );
end;
$$;

create or replace function public.record_event_email_delivery_result(
  p_delivery_id uuid,
  p_action_id uuid,
  p_succeeded boolean,
  p_provider_message_id text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.event_email_deliveries%rowtype;
  next_status text;
begin
  select * into delivery_record
  from public.event_email_deliveries
  where id = p_delivery_id
  for update;

  if delivery_record.id is null then
    raise exception 'Delivery was not found.' using errcode = 'P0002';
  end if;
  if delivery_record.triggering_action_id is distinct from p_action_id then
    raise exception 'The delivery action does not match.' using errcode = '28000';
  end if;
  if delivery_record.status = 'sent' and coalesce(p_succeeded, false) then
    return jsonb_build_object(
      'ok', true, 'deliveryId', delivery_record.id, 'status', 'sent',
      'attempts', delivery_record.attempts, 'retryable', false
    );
  end if;
  if delivery_record.status <> 'sending' then
    raise exception 'Only a sending delivery can record a result.' using errcode = '22023';
  end if;

  next_status := case when coalesce(p_succeeded, false) then 'sent' else 'failed' end;
  update public.event_email_deliveries
  set status = next_status,
      provider_message_id = case when p_succeeded then nullif(btrim(p_provider_message_id), '') else provider_message_id end,
      last_error = case when p_succeeded then null else left(coalesce(nullif(btrim(p_error), ''), 'Unknown delivery failure.'), 2000) end,
      sent_at = case when p_succeeded then now() else sent_at end,
      failed_at = case when p_succeeded then null else now() end,
      updated_at = now()
  where id = delivery_record.id
  returning * into delivery_record;

  return jsonb_build_object(
    'ok', true, 'deliveryId', delivery_record.id,
    'status', delivery_record.status,
    'attempts', delivery_record.attempts,
    'retryable', delivery_record.status = 'failed'
  );
end;
$$;

revoke all on function public.refresh_event_summary_snapshot(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.prepare_event_from_matching_group(uuid, text, text, jsonb, text, timestamptz, timestamptz, text, text, text, integer, integer, timestamptz, timestamptz, integer, integer, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.open_event_invitations(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.set_event_capacity(uuid, integer, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.confirm_event_and_release_details(uuid, text, text, text, timestamptz, timestamptz, text, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.cancel_event(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.assign_event_host(uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_event_completed(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.record_event_replacement(uuid, uuid, boolean, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.prepare_event_email_deliveries(uuid, text, timestamptz, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_event_email_delivery(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.record_event_email_delivery_result(uuid, uuid, boolean, text, text)
  from public, anon, authenticated;

grant execute on function public.prepare_event_from_matching_group(uuid, text, text, jsonb, text, timestamptz, timestamptz, text, text, text, integer, integer, timestamptz, timestamptz, integer, integer, uuid, text, text)
  to service_role;
grant execute on function public.open_event_invitations(uuid, uuid, text, text)
  to service_role;
grant execute on function public.set_event_capacity(uuid, integer, uuid, text, text)
  to service_role;
grant execute on function public.confirm_event_and_release_details(uuid, text, text, text, timestamptz, timestamptz, text, text, uuid, text, text)
  to service_role;
grant execute on function public.cancel_event(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.assign_event_host(uuid, uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.mark_event_completed(uuid, uuid, text, text)
  to service_role;
grant execute on function public.record_event_replacement(uuid, uuid, boolean, uuid, text, text)
  to service_role;
grant execute on function public.prepare_event_email_deliveries(uuid, text, timestamptz, uuid, text, text)
  to service_role;
grant execute on function public.claim_event_email_delivery(uuid, uuid, text)
  to service_role;
grant execute on function public.record_event_email_delivery_result(uuid, uuid, boolean, text, text)
  to service_role;

create or replace function public.member_has_confirmed_event_seat(
  p_member_id uuid,
  p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_invitations
    join public.events on events.id = event_invitations.event_id
    where event_invitations.member_id = p_member_id
      and event_invitations.event_id = p_event_id
      and event_invitations.seat_status = 'confirmed'
      and event_invitations.cancelled_at is null
      and (events.status = 'completed' or coalesce(events.ends_at, events.starts_at) <= now())
  );
$$;

create or replace function public.submit_event_feedback(
  p_event_id uuid,
  p_overall_rating integer,
  p_questions_rating integer,
  p_restaurant_rating integer,
  p_host_rating integer,
  p_hosting_experience_rating integer,
  p_comments text,
  p_one_star_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_id_value uuid := public.current_active_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  feedback_record public.event_feedback%rowtype;
begin
  if member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;

  select * into invitation_record
  from public.event_invitations
  where event_id = p_event_id and member_id = member_id_value
  for update;
  select * into event_record from public.events where id = p_event_id for update;

  if invitation_record.id is null or invitation_record.seat_status <> 'confirmed'
    or invitation_record.cancelled_at is not null then
    raise exception 'Feedback requires a confirmed, non-cancelled seat.' using errcode = '22023';
  end if;
  if event_record.status <> 'completed'
    and coalesce(event_record.ends_at, event_record.starts_at) > now() then
    raise exception 'Feedback opens after the event ends.' using errcode = '22023';
  end if;

  insert into public.event_feedback (
    event_id, member_id, overall_rating, questions_rating,
    restaurant_rating, host_rating, hosting_experience_rating,
    comments, one_star_detail, submitted_at, created_at, updated_at
  ) values (
    event_record.id, member_id_value, p_overall_rating, p_questions_rating,
    p_restaurant_rating, p_host_rating, p_hosting_experience_rating,
    nullif(btrim(p_comments), ''), nullif(btrim(p_one_star_detail), ''),
    now(), now(), now()
  ) on conflict (event_id, member_id) do update
  set overall_rating = excluded.overall_rating,
      questions_rating = excluded.questions_rating,
      restaurant_rating = excluded.restaurant_rating,
      host_rating = excluded.host_rating,
      hosting_experience_rating = excluded.hosting_experience_rating,
      comments = excluded.comments,
      one_star_detail = excluded.one_star_detail,
      submitted_at = now(),
      updated_at = now()
  returning * into feedback_record;

  return jsonb_build_object(
    'ok', true, 'eventId', event_record.id,
    'feedbackId', feedback_record.id,
    'submittedAt', feedback_record.submitted_at
  );
end;
$$;

-- Keep the legacy helper name, but make it represent the new messaging gate:
-- completed/ended event, confirmed seat, and feedback submitted by the sender.
create or replace function public.member_attended_past_event(
  p_member_id uuid,
  p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.member_has_confirmed_event_seat(p_member_id, p_event_id)
    and exists (
      select 1 from public.event_feedback
      where event_id = p_event_id and member_id = p_member_id
    );
$$;

create or replace function public.get_past_event_attendees(p_event_id uuid)
returns table (
  member_id uuid,
  first_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    members.id as member_id,
    coalesce(
      nullif(latest.profile_json ->> 'profile.first_name', ''),
      nullif(split_part(members.email, '@', 1), ''),
      'Member'
    ) as first_name
  from public.event_invitations as invitations
  join public.members as members on members.id = invitations.member_id
  left join lateral (
    select registrations.profile_json
    from public.profile_registrations as registrations
    where registrations.contact_email_norm = members.email_norm
      and registrations.status = 'submitted'
    order by registrations.updated_at desc
    limit 1
  ) as latest on true
  where invitations.event_id = p_event_id
    and invitations.member_id <> public.current_active_member_id()
    and invitations.seat_status = 'confirmed'
    and invitations.cancelled_at is null
    and public.member_attended_past_event(public.current_active_member_id(), p_event_id)
  order by first_name asc;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  clean_body text := nullif(btrim(p_body), '');
  conversation_record public.conversations%rowtype;
  recipient_id uuid;
  message_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;
  if clean_body is null or length(clean_body) > 2000 then
    raise exception 'Write a message between 1 and 2000 characters.' using errcode = '22023';
  end if;

  select * into conversation_record
  from public.conversations
  where id = p_conversation_id
    and exists (
      select 1 from public.conversation_participants
      where conversation_id = conversations.id
        and member_id = current_member_id_value
    )
  for update;
  if conversation_record.id is null then raise exception 'Conversation was not found.' using errcode = 'P0002'; end if;
  if conversation_record.status = 'closed' then raise exception 'This conversation is closed.' using errcode = '22023'; end if;

  if conversation_record.status = 'pending' then
    if conversation_record.initiated_by_member_id = current_member_id_value then
      if exists (
        select 1 from public.messages
        where conversation_id = conversation_record.id
          and sender_member_id = current_member_id_value
          and deleted_at is null
      ) then
        raise exception 'You can send one first message. If they reply, the conversation opens.'
          using errcode = '22023';
      end if;
    else
      update public.conversations set status = 'open', updated_at = now()
      where id = conversation_record.id;
      conversation_record.status := 'open';
    end if;
  end if;

  insert into public.messages (conversation_id, sender_member_id, body, created_at)
  values (conversation_record.id, current_member_id_value, clean_body, now())
  returning id into message_id;
  update public.conversations set updated_at = now() where id = conversation_record.id;

  recipient_id := case
    when conversation_record.initiated_by_member_id = current_member_id_value
      then conversation_record.recipient_member_id
    else conversation_record.initiated_by_member_id
  end;
  insert into public.notifications (
    member_id, type, title, body, href, localized_content, created_at
  ) values (
    recipient_id, 'message', 'New message',
    'Someone from your table wrote to you.',
    '/messages/' || conversation_record.id::text,
    jsonb_build_object('es', jsonb_build_object(
      'title', 'Nuevo mensaje', 'body', 'Alguien de tu mesa te ha escrito.'
    )), now()
  );

  return jsonb_build_object(
    'ok', true, 'conversationId', conversation_record.id,
    'messageId', message_id, 'status', conversation_record.status
  );
end;
$$;

create or replace function public.start_conversation(
  p_event_id uuid,
  p_recipient_member_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  conversation_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;
  if current_member_id_value = p_recipient_member_id then
    raise exception 'You cannot message yourself.' using errcode = '22023';
  end if;
  if not public.member_attended_past_event(current_member_id_value, p_event_id)
    or not public.member_has_confirmed_event_seat(p_recipient_member_id, p_event_id) then
    raise exception 'Messaging opens after your feedback for a shared completed event.'
      using errcode = '22023';
  end if;

  select id into conversation_id
  from public.conversations
  where event_id = p_event_id
    and least(initiated_by_member_id, recipient_member_id) = least(current_member_id_value, p_recipient_member_id)
    and greatest(initiated_by_member_id, recipient_member_id) = greatest(current_member_id_value, p_recipient_member_id)
  limit 1;

  if conversation_id is null then
    insert into public.conversations (
      event_id, initiated_by_member_id, recipient_member_id,
      status, created_at, updated_at
    ) values (
      p_event_id, current_member_id_value, p_recipient_member_id,
      'pending', now(), now()
    ) returning id into conversation_id;
    insert into public.conversation_participants (conversation_id, member_id)
    values (conversation_id, current_member_id_value),
      (conversation_id, p_recipient_member_id);
  end if;

  return public.send_message(conversation_id, p_body);
end;
$$;

revoke all on function public.member_has_confirmed_event_seat(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_event_feedback(uuid, integer, integer, integer, integer, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.member_attended_past_event(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_past_event_attendees(uuid)
  from public, anon, authenticated;
revoke all on function public.send_message(uuid, text)
  from public, anon, authenticated;
revoke all on function public.start_conversation(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.submit_event_feedback(uuid, integer, integer, integer, integer, integer, text, text)
  to authenticated;
grant execute on function public.member_attended_past_event(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.get_past_event_attendees(uuid)
  to authenticated;
grant execute on function public.send_message(uuid, text)
  to authenticated;
grant execute on function public.start_conversation(uuid, uuid, text)
  to authenticated;
