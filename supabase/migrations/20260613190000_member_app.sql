alter table public.members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists members_user_id_key
  on public.members (user_id)
  where user_id is not null;

create index if not exists members_user_id_idx
  on public.members (user_id);

grant select on table public.members to authenticated;
grant select on table public.benefit_codes to authenticated;
grant select on table public.benefit_code_redemptions to authenticated;
grant select on table public.credit_ledger_entries to authenticated;
grant select on table public.member_credit_balances to authenticated;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.members
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.link_member_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := nullif(btrim(auth.jwt() ->> 'email'), '');
  member_id uuid;
  member_status text;
begin
  if current_user_id is null or current_email is null then
    raise exception 'Authenticated email is required to link a member.'
      using errcode = '28000';
  end if;

  insert into public.members (
    email,
    user_id,
    membership_status,
    created_at,
    updated_at
  )
  values (
    current_email,
    current_user_id,
    'pending',
    now(),
    now()
  )
  on conflict (email_norm) do update
    set email = excluded.email,
        user_id = case
          when public.members.user_id is null or public.members.user_id = current_user_id
            then current_user_id
          else public.members.user_id
        end,
        updated_at = now()
  where public.members.user_id is null
     or public.members.user_id = current_user_id
  returning id, membership_status into member_id, member_status;

  if member_id is null then
    raise exception 'This member email is already linked to another account.'
      using errcode = '23505';
  end if;

  if member_status = 'active' then
    perform public.ensure_referral_code_for_member(member_id, now());
  end if;

  return member_id;
end;
$$;

revoke all on function public.current_member_id() from public, anon, authenticated;
revoke all on function public.link_member_for_current_user() from public, anon, authenticated;
grant execute on function public.current_member_id() to authenticated, service_role;
grant execute on function public.link_member_for_current_user() to authenticated;
grant execute on function public.grant_member_credit(uuid, integer, text, text, text, uuid, text, timestamptz) to service_role;

drop policy if exists "Members can view own member record" on public.members;
create policy "Members can view own member record"
  on public.members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Members can view own referral code" on public.benefit_codes;
create policy "Members can view own referral code"
  on public.benefit_codes
  for select
  to authenticated
  using (owner_member_id = public.current_member_id());

drop policy if exists "Members can view own code redemptions" on public.benefit_code_redemptions;
create policy "Members can view own code redemptions"
  on public.benefit_code_redemptions
  for select
  to authenticated
  using (
    beneficiary_member_id = public.current_member_id()
    or referrer_member_id = public.current_member_id()
  );

drop policy if exists "Members can view own credit ledger" on public.credit_ledger_entries;
create policy "Members can view own credit ledger"
  on public.credit_ledger_entries
  for select
  to authenticated
  using (member_id = public.current_member_id());

create or replace view public.member_credit_balances
with (security_invoker = true)
as
select
  members.id as member_id,
  members.email,
  members.email_norm,
  coalesce(sum(credit_ledger_entries.delta), 0)::integer as credit_balance
from public.members
left join public.credit_ledger_entries
  on credit_ledger_entries.member_id = members.id
group by members.id;

grant select on table public.member_credit_balances to authenticated, service_role;

create table if not exists public.member_event_preferences (
  member_id uuid primary key references public.members(id) on delete cascade,
  prefers_saturday_dinner boolean not null default true,
  prefers_sunday_brunch boolean not null default true,
  dietary_restrictions text,
  wants_to_host boolean not null default false,
  host_notes text,
  extra_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  credits integer not null,
  price_amount_cents integer not null,
  currency text not null default 'eur',
  stripe_price_id text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_products_credits_check check (credits > 0),
  constraint credit_products_price_check check (price_amount_cents > 0),
  constraint credit_products_status_check check (status in ('active', 'archived'))
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_format text not null default 'dinner',
  status text not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz,
  city text,
  venue_name text,
  venue_address text,
  capacity integer,
  member_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_event_format_check check (event_format in ('dinner', 'brunch', 'other')),
  constraint events_status_check check (status in ('draft', 'inviting', 'confirmed', 'completed', 'cancelled')),
  constraint events_capacity_check check (capacity is null or capacity > 0)
);

create table if not exists public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null default 'invited',
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_invitations_status_check
    check (status in ('invited', 'confirmed', 'waitlisted', 'declined', 'cancelled', 'expired')),
  constraint event_invitations_event_member_key unique (event_id, member_id)
);

create table if not exists public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  invitation_id uuid references public.event_invitations(id) on delete set null,
  status text not null default 'confirmed',
  is_host boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_attendees_status_check
    check (status in ('confirmed', 'attended', 'host', 'no_show', 'cancelled')),
  constraint event_attendees_event_member_key unique (event_id, member_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  initiated_by_member_id uuid not null references public.members(id) on delete cascade,
  recipient_member_id uuid not null references public.members(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_status_check check (status in ('pending', 'open', 'closed')),
  constraint conversations_not_self_check check (initiated_by_member_id <> recipient_member_id)
);

create unique index if not exists conversations_event_pair_key
  on public.conversations (
    event_id,
    least(initiated_by_member_id, recipient_member_id),
    greatest(initiated_by_member_id, recipient_member_id)
  );

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, member_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_member_id uuid not null references public.members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_body_check check (length(btrim(body)) > 0 and length(body) <= 2000)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_invitations_member_status_idx
  on public.event_invitations (member_id, status, invited_at desc);

create index if not exists event_attendees_member_event_idx
  on public.event_attendees (member_id, event_id);

create index if not exists conversation_participants_member_idx
  on public.conversation_participants (member_id, conversation_id);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create index if not exists notifications_member_created_idx
  on public.notifications (member_id, created_at desc);

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_participants.conversation_id = p_conversation_id
      and conversation_participants.member_id = public.current_member_id()
  );
$$;

alter table public.member_event_preferences enable row level security;
alter table public.credit_products enable row level security;
alter table public.events enable row level security;
alter table public.event_invitations enable row level security;
alter table public.event_attendees enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

grant select, insert, update on table public.member_event_preferences to authenticated;
grant select on table public.credit_products to authenticated;
grant select on table public.events to authenticated;
grant select on table public.event_invitations to authenticated;
grant select on table public.event_attendees to authenticated;
grant select on table public.conversations to authenticated;
grant select, update on table public.conversation_participants to authenticated;
grant select, update on table public.messages to authenticated;
grant select, update on table public.notifications to authenticated;

grant all on table public.member_event_preferences to service_role;
grant all on table public.credit_products to service_role;
grant all on table public.events to service_role;
grant all on table public.event_invitations to service_role;
grant all on table public.event_attendees to service_role;
grant all on table public.conversations to service_role;
grant all on table public.conversation_participants to service_role;
grant all on table public.messages to service_role;
grant all on table public.notifications to service_role;

drop policy if exists "Members can manage own event preferences" on public.member_event_preferences;
create policy "Members can manage own event preferences"
  on public.member_event_preferences
  for all
  to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

drop policy if exists "Members can view active credit products" on public.credit_products;
create policy "Members can view active credit products"
  on public.credit_products
  for select
  to authenticated
  using (status = 'active');

drop policy if exists "Members can view their event records" on public.events;
create policy "Members can view their event records"
  on public.events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.event_invitations
      where event_invitations.event_id = events.id
        and event_invitations.member_id = public.current_member_id()
    )
    or exists (
      select 1
      from public.event_attendees
      where event_attendees.event_id = events.id
        and event_attendees.member_id = public.current_member_id()
    )
  );

drop policy if exists "Members can view own invitations" on public.event_invitations;
create policy "Members can view own invitations"
  on public.event_invitations
  for select
  to authenticated
  using (member_id = public.current_member_id());

drop policy if exists "Members can view own attendee records" on public.event_attendees;
create policy "Members can view own attendee records"
  on public.event_attendees
  for select
  to authenticated
  using (member_id = public.current_member_id());

drop policy if exists "Conversation members can view conversations" on public.conversations;
create policy "Conversation members can view conversations"
  on public.conversations
  for select
  to authenticated
  using (public.is_conversation_participant(id));

drop policy if exists "Conversation members can view participants" on public.conversation_participants;
create policy "Conversation members can view participants"
  on public.conversation_participants
  for select
  to authenticated
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "Members can update own participant read state" on public.conversation_participants;
create policy "Members can update own participant read state"
  on public.conversation_participants
  for update
  to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

drop policy if exists "Conversation members can view messages" on public.messages;
create policy "Conversation members can view messages"
  on public.messages
  for select
  to authenticated
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "Members can update own messages" on public.messages;
create policy "Members can update own messages"
  on public.messages
  for update
  to authenticated
  using (sender_member_id = public.current_member_id())
  with check (sender_member_id = public.current_member_id());

drop policy if exists "Members can view own notifications" on public.notifications;
create policy "Members can view own notifications"
  on public.notifications
  for select
  to authenticated
  using (member_id = public.current_member_id());

drop policy if exists "Members can update own notifications" on public.notifications;
create policy "Members can update own notifications"
  on public.notifications
  for update
  to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());

create or replace function public.complete_credit_pack_purchase(
  p_member_id uuid,
  p_credit_product_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_record public.credit_products%rowtype;
begin
  if nullif(btrim(p_checkout_session_id), '') is null then
    raise exception 'Missing checkout session id.'
      using errcode = '22023';
  end if;

  select *
    into product_record
  from public.credit_products
  where id = p_credit_product_id;

  if product_record.id is null then
    raise exception 'Credit product was not found.'
      using errcode = 'P0002';
  end if;

  perform public.grant_member_credit(
    p_member_id,
    product_record.credits,
    'credit_pack_purchase',
    'stripe_checkout',
    p_checkout_session_id,
    null,
    jsonb_build_object(
      'creditProductId', product_record.id,
      'productName', product_record.name,
      'paymentIntentId', nullif(btrim(p_payment_intent_id), '')
    )::text,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'memberId', p_member_id,
    'creditProductId', product_record.id,
    'credits', product_record.credits
  );
end;
$$;

create or replace function public.confirm_event_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  invitation_record public.event_invitations%rowtype;
  event_record public.events%rowtype;
  credit_balance integer;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  select *
    into invitation_record
  from public.event_invitations
  where id = p_invitation_id
    and event_invitations.member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.'
      using errcode = 'P0002';
  end if;

  if invitation_record.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'invitationId', invitation_record.id, 'status', 'confirmed');
  end if;

  if invitation_record.status not in ('invited', 'waitlisted') then
    raise exception 'This invitation cannot be confirmed.'
      using errcode = '22023';
  end if;

  select *
    into event_record
  from public.events
  where id = invitation_record.event_id
  for update;

  if event_record.status not in ('inviting', 'confirmed') then
    raise exception 'This event is not open for confirmation.'
      using errcode = '22023';
  end if;

  select coalesce(sum(delta), 0)::integer
    into credit_balance
  from public.credit_ledger_entries
  where credit_ledger_entries.member_id = current_member_id_value;

  if credit_balance < 1 then
    raise exception 'You need at least 1 credit to confirm this event.'
      using errcode = '22023';
  end if;

  update public.event_invitations
    set status = 'confirmed',
        responded_at = now(),
        confirmed_at = now(),
        updated_at = now()
  where id = invitation_record.id;

  insert into public.event_attendees (
    event_id,
    member_id,
    invitation_id,
    status,
    created_at,
    updated_at
  )
  values (
    invitation_record.event_id,
    current_member_id_value,
    invitation_record.id,
    'confirmed',
    now(),
    now()
  )
  on conflict (event_id, member_id) do update
    set invitation_id = excluded.invitation_id,
        status = 'confirmed',
        updated_at = now();

  perform public.grant_member_credit(
    current_member_id_value,
    -1,
    'event_confirmation',
    'event_invitation',
    invitation_record.id::text,
    null,
    'Credit used to confirm an event seat.',
    now()
  );

  return jsonb_build_object('ok', true, 'invitationId', invitation_record.id, 'status', 'confirmed');
end;
$$;

create or replace function public.cancel_event_confirmation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  invitation_record public.event_invitations%rowtype;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  select *
    into invitation_record
  from public.event_invitations
  where id = p_invitation_id
    and event_invitations.member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.'
      using errcode = 'P0002';
  end if;

  if invitation_record.status <> 'confirmed' then
    raise exception 'Only confirmed invitations can be cancelled here.'
      using errcode = '22023';
  end if;

  update public.event_invitations
    set status = 'cancelled',
        cancelled_at = now(),
        updated_at = now()
  where id = invitation_record.id;

  update public.event_attendees
    set status = 'cancelled',
        updated_at = now()
  where event_id = invitation_record.event_id
    and event_attendees.member_id = current_member_id_value;

  return jsonb_build_object('ok', true, 'invitationId', invitation_record.id, 'status', 'cancelled');
end;
$$;

create or replace function public.refund_cancelled_event_credit(
  p_invitation_id uuid,
  p_replacement_invitation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.event_invitations%rowtype;
begin
  select *
    into invitation_record
  from public.event_invitations
  where id = p_invitation_id;

  if invitation_record.id is null or invitation_record.status <> 'cancelled' then
    raise exception 'Cancelled invitation was not found.'
      using errcode = 'P0002';
  end if;

  perform public.grant_member_credit(
    invitation_record.member_id,
    1,
    'event_waitlist_replacement_refund',
    'event_invitation',
    invitation_record.id::text,
    null,
    case
      when p_replacement_invitation_id is null then 'Credit returned after cancellation replacement.'
      else 'Credit returned after waitlist replacement ' || p_replacement_invitation_id::text || '.'
    end,
    now()
  );

  return jsonb_build_object('ok', true, 'invitationId', invitation_record.id, 'refunded', true);
end;
$$;

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
  select exists (
    select 1
    from public.event_attendees
    join public.events on events.id = event_attendees.event_id
    where event_attendees.member_id = p_member_id
      and event_attendees.event_id = p_event_id
      and event_attendees.status in ('attended', 'host')
      and (events.status = 'completed' or events.starts_at < now())
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
      nullif(profile_registrations.profile_json ->> 'profile.first_name', ''),
      nullif(split_part(members.email, '@', 1), ''),
      'Member'
    ) as first_name
  from public.event_attendees
  join public.members on members.id = event_attendees.member_id
  left join public.profile_registrations
    on profile_registrations.contact_email_norm = members.email_norm
   and profile_registrations.status = 'submitted'
  where event_attendees.event_id = p_event_id
    and event_attendees.member_id <> public.current_member_id()
    and event_attendees.status in ('attended', 'host')
    and public.member_attended_past_event(public.current_member_id(), p_event_id)
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
  current_member_id_value uuid := public.current_member_id();
  clean_body text := nullif(btrim(p_body), '');
  conversation_record public.conversations%rowtype;
  recipient_id uuid;
  message_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  if clean_body is null or length(clean_body) > 2000 then
    raise exception 'Write a message between 1 and 2000 characters.'
      using errcode = '22023';
  end if;

  select *
    into conversation_record
  from public.conversations
  where id = p_conversation_id
    and exists (
      select 1
      from public.conversation_participants
      where conversation_participants.conversation_id = conversations.id
        and conversation_participants.member_id = current_member_id_value
    )
  for update;

  if conversation_record.id is null then
    raise exception 'Conversation was not found.'
      using errcode = 'P0002';
  end if;

  if conversation_record.status = 'closed' then
    raise exception 'This conversation is closed.'
      using errcode = '22023';
  end if;

  if conversation_record.status = 'pending' then
    if conversation_record.initiated_by_member_id = current_member_id_value then
      if exists (
        select 1
        from public.messages
        where conversation_id = conversation_record.id
          and sender_member_id = current_member_id_value
          and deleted_at is null
      ) then
        raise exception 'You can send one first message. If they reply, the conversation opens.'
          using errcode = '22023';
      end if;
    else
      update public.conversations
        set status = 'open',
            updated_at = now()
      where id = conversation_record.id;
      conversation_record.status := 'open';
    end if;
  end if;

  insert into public.messages (
    conversation_id,
    sender_member_id,
    body,
    created_at
  )
  values (
    conversation_record.id,
    current_member_id_value,
    clean_body,
    now()
  )
  returning id into message_id;

  update public.conversations
    set updated_at = now()
  where id = conversation_record.id;

  select member_id
    into recipient_id
  from public.conversation_participants
  where conversation_id = conversation_record.id
    and conversation_participants.member_id <> current_member_id_value
  limit 1;

  recipient_id := case
    when conversation_record.initiated_by_member_id = current_member_id_value then conversation_record.recipient_member_id
    else conversation_record.initiated_by_member_id
  end;

  insert into public.notifications (
    member_id,
    type,
    title,
    body,
    href,
    created_at
  )
  values (
    recipient_id,
    'message',
    'New message',
    'Someone from your table wrote to you.',
    '/messages/' || conversation_record.id::text,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'conversationId', conversation_record.id,
    'messageId', message_id,
    'status', conversation_record.status
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
  current_member_id_value uuid := public.current_member_id();
  conversation_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  if current_member_id_value = p_recipient_member_id then
    raise exception 'You cannot message yourself.'
      using errcode = '22023';
  end if;

  if not public.member_attended_past_event(current_member_id_value, p_event_id)
    or not public.member_attended_past_event(p_recipient_member_id, p_event_id) then
    raise exception 'Messaging is only available after a shared past event.'
      using errcode = '22023';
  end if;

  select id
    into conversation_id
  from public.conversations
  where event_id = p_event_id
    and least(initiated_by_member_id, recipient_member_id) = least(current_member_id_value, p_recipient_member_id)
    and greatest(initiated_by_member_id, recipient_member_id) = greatest(current_member_id_value, p_recipient_member_id)
  limit 1;

  if conversation_id is null then
    insert into public.conversations (
      event_id,
      initiated_by_member_id,
      recipient_member_id,
      status,
      created_at,
      updated_at
    )
    values (
      p_event_id,
      current_member_id_value,
      p_recipient_member_id,
      'pending',
      now(),
      now()
    )
    returning id into conversation_id;

    insert into public.conversation_participants (conversation_id, member_id)
    values
      (conversation_id, current_member_id_value),
      (conversation_id, p_recipient_member_id);
  end if;

  return public.send_message(conversation_id, p_body);
end;
$$;

revoke all on function public.complete_credit_pack_purchase(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.is_conversation_participant(uuid) from public, anon, authenticated;
revoke all on function public.confirm_event_invitation(uuid) from public, anon, authenticated;
revoke all on function public.cancel_event_confirmation(uuid) from public, anon, authenticated;
revoke all on function public.refund_cancelled_event_credit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.member_attended_past_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_past_event_attendees(uuid) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text) from public, anon, authenticated;
revoke all on function public.start_conversation(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.complete_credit_pack_purchase(uuid, uuid, text, text) to service_role;
grant execute on function public.is_conversation_participant(uuid) to authenticated, service_role;
grant execute on function public.confirm_event_invitation(uuid) to authenticated;
grant execute on function public.cancel_event_confirmation(uuid) to authenticated;
grant execute on function public.refund_cancelled_event_credit(uuid, uuid) to service_role;
grant execute on function public.member_attended_past_event(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_past_event_attendees(uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.start_conversation(uuid, uuid, text) to authenticated;

insert into public.credit_products (
  id,
  name,
  description,
  credits,
  price_amount_cents,
  currency,
  status,
  sort_order
)
values
  ('11111111-1111-4111-8111-111111111111', '1 credit', 'One seat at one dinner or brunch.', 1, 1500, 'eur', 'active', 10),
  ('33333333-3333-4333-8333-333333333333', '3 credits', 'Three events with a small bundle discount.', 3, 3900, 'eur', 'active', 20),
  ('55555555-5555-4555-8555-555555555555', '5 credits', 'Five events for members who like savings.', 5, 6000, 'eur', 'active', 30)
on conflict (id) do update
  set name = excluded.name,
      description = excluded.description,
      credits = excluded.credits,
      price_amount_cents = excluded.price_amount_cents,
      currency = excluded.currency,
      status = excluded.status,
      sort_order = excluded.sort_order,
      updated_at = now();

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
