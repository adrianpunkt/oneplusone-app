create table if not exists public.message_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  recipient_member_id uuid not null references public.members(id) on delete cascade,
  locale text not null,
  template_id text,
  idempotency_key text not null unique,
  status text not null default 'draft',
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  claimed_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_email_deliveries_locale_check
    check (locale in ('en', 'es')),
  constraint message_email_deliveries_status_check
    check (status in ('draft', 'sending', 'sent', 'failed')),
  constraint message_email_deliveries_attempts_check
    check (attempts >= 0),
  constraint message_email_deliveries_key_check
    check (length(idempotency_key) between 1 and 100)
);

create index if not exists message_email_deliveries_failed_idx
  on public.message_email_deliveries (failed_at)
  where status = 'failed';

alter table public.message_email_deliveries enable row level security;

revoke all on table public.message_email_deliveries
  from public, anon, authenticated;
grant all on table public.message_email_deliveries to service_role;

create or replace function public.claim_message_email_delivery(
  p_delivery_id uuid,
  p_template_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.message_email_deliveries%rowtype;
  recipient_email text;
  conversation_id_value uuid;
  resolved_template_id text := nullif(btrim(p_template_id), '');
begin
  select * into delivery_record
  from public.message_email_deliveries
  where id = p_delivery_id
  for update;

  if delivery_record.id is null then
    raise exception 'Message email delivery was not found.'
      using errcode = 'P0002';
  end if;
  if delivery_record.status = 'sent' then
    return jsonb_build_object(
      'ok', true,
      'deliveryId', delivery_record.id,
      'status', 'sent',
      'attempts', delivery_record.attempts,
      'skipped', true
    );
  end if;
  if delivery_record.status = 'sending' then
    return jsonb_build_object(
      'ok', true,
      'deliveryId', delivery_record.id,
      'status', 'sending',
      'attempts', delivery_record.attempts,
      'skipped', true
    );
  end if;
  if delivery_record.status not in ('draft', 'failed') then
    raise exception 'Only draft or failed message email deliveries can be claimed.'
      using errcode = '22023';
  end if;
  if resolved_template_id is null then
    raise exception 'The resolved message email template ID is required.'
      using errcode = '22023';
  end if;

  select members.email, messages.conversation_id
    into recipient_email, conversation_id_value
  from public.members
  join public.messages on messages.id = delivery_record.message_id
  where members.id = delivery_record.recipient_member_id;

  if nullif(btrim(recipient_email), '') is null then
    raise exception 'The message email recipient has no email address.'
      using errcode = '22023';
  end if;
  if conversation_id_value is null then
    raise exception 'The message email conversation was not found.'
      using errcode = 'P0002';
  end if;

  update public.message_email_deliveries
  set
    status = 'sending',
    template_id = resolved_template_id,
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
    'messageId', delivery_record.message_id,
    'conversationId', conversation_id_value,
    'recipientEmail', recipient_email,
    'locale', delivery_record.locale,
    'templateId', delivery_record.template_id,
    'idempotencyKey', delivery_record.idempotency_key,
    'status', delivery_record.status,
    'attempts', delivery_record.attempts,
    'skipped', false
  );
end;
$$;

create or replace function public.record_message_email_delivery_result(
  p_delivery_id uuid,
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
  delivery_record public.message_email_deliveries%rowtype;
  next_status text;
begin
  select * into delivery_record
  from public.message_email_deliveries
  where id = p_delivery_id
  for update;

  if delivery_record.id is null then
    raise exception 'Message email delivery was not found.'
      using errcode = 'P0002';
  end if;
  if delivery_record.status = 'sent' and coalesce(p_succeeded, false) then
    return jsonb_build_object(
      'ok', true,
      'deliveryId', delivery_record.id,
      'status', 'sent',
      'attempts', delivery_record.attempts,
      'retryable', false
    );
  end if;
  if delivery_record.status <> 'sending' then
    raise exception 'Only a sending message email delivery can record a result.'
      using errcode = '22023';
  end if;

  next_status := case when coalesce(p_succeeded, false) then 'sent' else 'failed' end;
  update public.message_email_deliveries
  set
    status = next_status,
    provider_message_id = case
      when p_succeeded then nullif(btrim(p_provider_message_id), '')
      else provider_message_id
    end,
    last_error = case
      when p_succeeded then null
      else left(
        coalesce(nullif(btrim(p_error), ''), 'Unknown message email delivery failure.'),
        2000
      )
    end,
    sent_at = case when p_succeeded then now() else sent_at end,
    failed_at = case when p_succeeded then null else now() end,
    updated_at = now()
  where id = delivery_record.id
  returning * into delivery_record;

  return jsonb_build_object(
    'ok', true,
    'deliveryId', delivery_record.id,
    'status', delivery_record.status,
    'attempts', delivery_record.attempts,
    'retryable', delivery_record.status = 'failed'
  );
end;
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
  delivery_id uuid;
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
  if conversation_record.id is null then
    raise exception 'Conversation was not found.' using errcode = 'P0002';
  end if;
  if conversation_record.status = 'closed' then
    raise exception 'This conversation is closed.' using errcode = '22023';
  end if;

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

revoke all on function public.claim_message_email_delivery(uuid, text)
  from public, anon, authenticated;
revoke all on function public.record_message_email_delivery_result(uuid, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.send_message(uuid, text)
  from public, anon, authenticated;

grant execute on function public.claim_message_email_delivery(uuid, text)
  to service_role;
grant execute on function public.record_message_email_delivery_result(uuid, boolean, text, text)
  to service_role;
grant execute on function public.send_message(uuid, text)
  to authenticated;
