-- Let the recipient of an initial message read and continue that conversation
-- before submitting event feedback. Starting a conversation and discovering
-- the other event guests remain gated by attended=true feedback.

create or replace function public.member_can_access_received_conversation(
  p_member_id uuid,
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
    from public.conversations as conversations
    join public.event_invitations as invitations
      on invitations.event_id = conversations.event_id
      and invitations.member_id = p_member_id
    where conversations.id = p_conversation_id
      and conversations.recipient_member_id = p_member_id
      and invitations.seat_status = 'confirmed'
      and invitations.cancelled_at is null
      and exists (
        select 1
        from public.messages as initial_messages
        where initial_messages.conversation_id = conversations.id
          and initial_messages.sender_member_id
            = conversations.initiated_by_member_id
      )
  );
$$;

revoke all on function public.member_can_access_received_conversation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.member_can_access_received_conversation(uuid, uuid)
  to service_role;

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
      and (
        public.member_attended_past_event(
          participants.member_id,
          conversations.event_id
        )
        or public.member_can_access_received_conversation(
          participants.member_id,
          conversations.id
        )
      )
  );
$$;

revoke all on function public.is_conversation_participant(uuid)
  from public, anon, authenticated;
grant execute on function public.is_conversation_participant(uuid)
  to authenticated, service_role;

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
  ) and not public.member_can_access_received_conversation(
    current_member_id_value,
    conversation_record.id
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

revoke all on function public.send_message(uuid, text)
  from public, anon, authenticated;
grant execute on function public.send_message(uuid, text)
  to authenticated;
