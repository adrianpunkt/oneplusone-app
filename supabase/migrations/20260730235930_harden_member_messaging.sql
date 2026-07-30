-- Enforce the post-event messaging contract at the database boundary.
--
-- A member may discover attendees and use messaging only after submitting
-- attended=true feedback for a completed/ended event where they held a
-- confirmed, non-cancelled seat. The recipient may receive one initial
-- notification before submitting feedback, but cannot read or reply to the
-- conversation until they satisfy the same attendance gate.

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
    and public.member_attended_past_event(
      public.current_active_member_id(),
      p_event_id
    )
  order by first_name asc;
$$;

-- Conversation RLS uses this helper. Participant membership alone is not
-- enough: otherwise an initial recipient can read the sender and message before
-- completing their own attended feedback.
create or replace function public.is_conversation_participant(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants as participants
    join public.conversations as conversations
      on conversations.id = participants.conversation_id
    where participants.conversation_id = p_conversation_id
      and participants.member_id = public.current_active_member_id()
      and participants.member_id in (
        conversations.initiated_by_member_id,
        conversations.recipient_member_id
      )
      and public.member_attended_past_event(
        participants.member_id,
        conversations.event_id
      )
  );
$$;

-- The app only updates last_read_at. A table-wide UPDATE grant also allowed a
-- member to change conversation_id and join an unrelated conversation.
revoke update on table public.conversation_participants from authenticated;
grant update (last_read_at)
  on table public.conversation_participants
  to authenticated;

-- There is no member-facing message edit/delete feature. The old UPDATE grant
-- let an initiator set deleted_at and bypass the one-initial-message guard.
revoke update on table public.messages from authenticated;
drop policy if exists "Members can update own messages" on public.messages;

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
  delivery_id uuid;
  pair_member_low uuid;
  pair_member_high uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;
  if clean_body is null or length(clean_body) > 2000 then
    raise exception 'Write a message between 1 and 2000 characters.'
      using errcode = '22023';
  end if;

  -- Resolve and lock the unordered member pair before locking a conversation.
  -- The pair-wide lock prevents concurrent first messages through two
  -- different shared events from bypassing the unanswered-message limit.
  select
    least(initiated_by_member_id, recipient_member_id),
    greatest(initiated_by_member_id, recipient_member_id)
  into pair_member_low, pair_member_high
  from public.conversations
  where id = p_conversation_id
    and current_member_id_value in (
      conversations.initiated_by_member_id,
      conversations.recipient_member_id
    );

  if pair_member_low is null or pair_member_high is null then
    raise exception 'Conversation was not found.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pair_member_low::text || ':' || pair_member_high::text,
      0
    )
  );

  -- The row lock serializes status transitions and messages inside this
  -- conversation after the broader pair lock has been acquired.
  select * into conversation_record
  from public.conversations
  where id = p_conversation_id
    and current_member_id_value in (
      conversations.initiated_by_member_id,
      conversations.recipient_member_id
    )
    and exists (
      select 1
      from public.conversation_participants
      where conversation_id = conversations.id
        and member_id = current_member_id_value
    )
  for update;

  if conversation_record.id is null then
    raise exception 'Conversation was not found.' using errcode = 'P0002';
  end if;
  if conversation_record.status = 'closed' then
    raise exception 'This conversation is closed.' using errcode = '22023';
  end if;
  if not public.member_attended_past_event(
    current_member_id_value,
    conversation_record.event_id
  ) then
    raise exception 'Messaging opens after your attended event feedback.'
      using errcode = '22023';
  end if;

  if conversation_record.status = 'pending' then
    if conversation_record.initiated_by_member_id = current_member_id_value then
      -- Count every unanswered initial message to this recipient across all
      -- shared events, including logically deleted messages. A different
      -- event or a deletion must never restore the one-message allowance.
      if exists (
        select 1
        from public.conversations as pending_conversations
        join public.messages as initial_messages
          on initial_messages.conversation_id = pending_conversations.id
        where pending_conversations.status = 'pending'
          and pending_conversations.initiated_by_member_id
            = current_member_id_value
          and pending_conversations.recipient_member_id
            = conversation_record.recipient_member_id
          and initial_messages.sender_member_id = current_member_id_value
      ) then
        raise exception 'You can send one first message. If they reply, the conversation opens.'
          using errcode = '22023';
      end if;
    else
      update public.conversations
      set status = 'open', updated_at = now()
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

  recipient_id := case
    when conversation_record.initiated_by_member_id = current_member_id_value
      then conversation_record.recipient_member_id
    else conversation_record.initiated_by_member_id
  end;

  insert into public.notifications (
    member_id,
    type,
    title,
    body,
    href,
    localized_content,
    created_at
  )
  values (
    recipient_id,
    'message',
    'New message',
    'Someone from your table wrote to you.',
    '/messages/' || conversation_record.id::text,
    jsonb_build_object(
      'es',
      jsonb_build_object(
        'title', 'Nuevo mensaje',
        'body', 'Alguien de tu mesa te ha escrito.'
      )
    ),
    now()
  );

  insert into public.message_email_deliveries (
    message_id,
    recipient_member_id,
    locale,
    idempotency_key
  )
  values (
    message_id,
    recipient_id,
    public.effective_member_locale(recipient_id),
    'message-email-' || message_id::text
  )
  returning id into delivery_id;

  return jsonb_build_object(
    'ok', true,
    'conversationId', conversation_record.id,
    'messageId', message_id,
    'deliveryId', delivery_id,
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
  current_member_id_value uuid := public.current_active_member_id();
  conversation_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.' using errcode = '28000';
  end if;
  if p_event_id is null or p_recipient_member_id is null then
    raise exception 'Event and recipient are required.' using errcode = '22023';
  end if;
  if current_member_id_value = p_recipient_member_id then
    raise exception 'You cannot message yourself.' using errcode = '22023';
  end if;
  if not public.member_attended_past_event(
    current_member_id_value,
    p_event_id
  ) or not public.member_has_confirmed_event_seat(
    p_recipient_member_id,
    p_event_id
  ) then
    raise exception 'Messaging opens after your feedback for a shared completed event.'
      using errcode = '22023';
  end if;

  -- Serialize the unordered member pair across every shared event. The
  -- event-specific expression unique index remains the final duplicate-
  -- conversation backstop for this particular event.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(current_member_id_value, p_recipient_member_id)::text
        || ':' || greatest(current_member_id_value, p_recipient_member_id)::text,
      0
    )
  );

  select id into conversation_id
  from public.conversations
  where event_id = p_event_id
    and least(initiated_by_member_id, recipient_member_id)
      = least(current_member_id_value, p_recipient_member_id)
    and greatest(initiated_by_member_id, recipient_member_id)
      = greatest(current_member_id_value, p_recipient_member_id)
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

    insert into public.conversation_participants (
      conversation_id,
      member_id
    )
    values
      (conversation_id, current_member_id_value),
      (conversation_id, p_recipient_member_id);
  end if;

  return public.send_message(conversation_id, p_body);
end;
$$;

-- These helpers accept member IDs. They are internal authorization primitives,
-- not public membership/attendance lookup APIs.
revoke all on function public.member_attended_past_event(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.member_attended_past_event(uuid, uuid)
  to service_role;

revoke all on function public.is_conversation_participant(uuid)
  from public, anon, authenticated;
grant execute on function public.is_conversation_participant(uuid)
  to authenticated, service_role;

revoke all on function public.get_past_event_attendees(uuid)
  from public, anon, authenticated;
grant execute on function public.get_past_event_attendees(uuid)
  to authenticated;

revoke all on function public.send_message(uuid, text)
  from public, anon, authenticated;
grant execute on function public.send_message(uuid, text)
  to authenticated;

revoke all on function public.start_conversation(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.start_conversation(uuid, uuid, text)
  to authenticated;
