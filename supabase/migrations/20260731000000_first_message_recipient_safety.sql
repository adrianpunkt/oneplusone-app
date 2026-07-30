alter table public.conversation_participants
  add column if not exists first_message_notice_acknowledged_at timestamptz;

comment on column public.conversation_participants.first_message_notice_acknowledged_at is
  'When the recipient acknowledged the safety notice shown for the first incoming message.';

revoke update on table public.conversation_participants from authenticated;
grant update (last_read_at)
  on table public.conversation_participants
  to authenticated;

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  message_id uuid not null
    references public.messages(id) on delete cascade,
  reporter_member_id uuid not null
    references public.members(id) on delete cascade,
  reported_member_id uuid not null
    references public.members(id) on delete cascade,
  support_request_id uuid unique
    references public.support_requests(id) on delete set null,
  details text,
  clicked_at timestamptz not null default now(),
  details_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_reports_members_check
    check (reporter_member_id <> reported_member_id),
  constraint message_reports_details_check
    check (details is null or char_length(details) between 1 and 5000),
  constraint message_reports_message_reporter_key
    unique (message_id, reporter_member_id)
);

create index if not exists message_reports_conversation_created_idx
  on public.message_reports (conversation_id, created_at desc);

create index if not exists message_reports_reported_member_created_idx
  on public.message_reports (reported_member_id, created_at desc);

alter table public.message_reports enable row level security;

revoke all on table public.message_reports
  from public, anon, authenticated;
grant all on table public.message_reports to service_role;

comment on table public.message_reports is
  'Service-only record of member reports initiated from the first incoming message safety notice.';

create or replace function public.acknowledge_first_message_notice(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  conversation_record public.conversations%rowtype;
  first_message_record public.messages%rowtype;
  acknowledged_at_value timestamptz;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.'
      using errcode = '28000';
  end if;

  select *
    into conversation_record
  from public.conversations
  where id = p_conversation_id
  for update;

  if conversation_record.id is null
    or conversation_record.recipient_member_id <> current_member_id_value then
    raise exception 'Conversation was not found.'
      using errcode = 'P0002';
  end if;

  select *
    into first_message_record
  from public.messages
  where conversation_id = conversation_record.id
  order by created_at asc, id asc
  limit 1;

  if first_message_record.id is null
    or first_message_record.sender_member_id <> conversation_record.initiated_by_member_id then
    raise exception 'The first incoming message was not found.'
      using errcode = 'P0002';
  end if;

  update public.conversation_participants
  set first_message_notice_acknowledged_at =
    coalesce(first_message_notice_acknowledged_at, now())
  where conversation_id = conversation_record.id
    and member_id = current_member_id_value
  returning first_message_notice_acknowledged_at
    into acknowledged_at_value;

  if acknowledged_at_value is null then
    raise exception 'Conversation participant was not found.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'conversationId', conversation_record.id,
    'acknowledgedAt', acknowledged_at_value
  );
end;
$$;

create or replace function public.create_first_message_report(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  conversation_record public.conversations%rowtype;
  first_message_record public.messages%rowtype;
  reporter_record public.members%rowtype;
  report_record public.message_reports%rowtype;
  support_request_id_value uuid;
  support_message text;
  was_created boolean := false;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.'
      using errcode = '28000';
  end if;

  select *
    into conversation_record
  from public.conversations
  where id = p_conversation_id
  for update;

  if conversation_record.id is null
    or conversation_record.recipient_member_id <> current_member_id_value then
    raise exception 'Conversation was not found.'
      using errcode = 'P0002';
  end if;

  select *
    into first_message_record
  from public.messages
  where conversation_id = conversation_record.id
  order by created_at asc, id asc
  limit 1;

  if first_message_record.id is null
    or first_message_record.sender_member_id <> conversation_record.initiated_by_member_id then
    raise exception 'The first incoming message was not found.'
      using errcode = 'P0002';
  end if;

  select *
    into reporter_record
  from public.members
  where id = current_member_id_value;

  if nullif(btrim(reporter_record.email), '') is null then
    raise exception 'The reporting member has no email address.'
      using errcode = '22023';
  end if;

  select *
    into report_record
  from public.message_reports
  where message_id = first_message_record.id
    and reporter_member_id = current_member_id_value;

  if report_record.id is null then
    insert into public.message_reports (
      conversation_id,
      message_id,
      reporter_member_id,
      reported_member_id,
      clicked_at,
      created_at,
      updated_at
    )
    values (
      conversation_record.id,
      first_message_record.id,
      current_member_id_value,
      conversation_record.initiated_by_member_id,
      now(),
      now(),
      now()
    )
    returning * into report_record;

    was_created := true;
  end if;

  update public.conversation_participants
  set first_message_notice_acknowledged_at =
    coalesce(first_message_notice_acknowledged_at, now())
  where conversation_id = conversation_record.id
    and member_id = current_member_id_value;

  if report_record.support_request_id is null then
    support_message := concat(
      'A member clicked Report after receiving the first message in a conversation.',
      E'\n\nReport ID: ', report_record.id::text,
      E'\nConversation ID: ', conversation_record.id::text,
      E'\nMessage ID: ', first_message_record.id::text,
      E'\nEvent ID: ', conversation_record.event_id::text,
      E'\nReporter member ID: ', current_member_id_value::text,
      E'\nReported member ID: ', conversation_record.initiated_by_member_id::text,
      E'\n\nOptional details: Not provided yet.'
    );

    insert into public.support_requests (
      category,
      email,
      locale,
      subject,
      message,
      page_url,
      requester_user_id,
      email_to,
      email_delivery_status,
      email_error,
      user_confirmation_delivery_status,
      user_confirmation_error,
      status,
      submitted_at,
      created_at,
      updated_at
    )
    values (
      'member_message_report',
      reporter_record.email,
      public.effective_member_locale(current_member_id_value),
      'Member message report',
      support_message,
      '/messages/' || conversation_record.id::text,
      reporter_record.user_id,
      'hello@oneplusoneclub.com',
      'not_configured',
      'Created directly in the staff support queue.',
      'not_configured',
      'No automatic reporter confirmation is sent for a member report.',
      'open',
      now(),
      now(),
      now()
    )
    returning id into support_request_id_value;

    update public.message_reports
    set
      support_request_id = support_request_id_value,
      updated_at = now()
    where id = report_record.id
    returning * into report_record;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conversationId', conversation_record.id,
    'messageId', first_message_record.id,
    'reportId', report_record.id,
    'supportRequestId', report_record.support_request_id,
    'created', was_created
  );
end;
$$;

create or replace function public.add_first_message_report_details(
  p_report_id uuid,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  clean_details text := nullif(btrim(p_details), '');
  report_record public.message_reports%rowtype;
  conversation_record public.conversations%rowtype;
  support_message text;
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.'
      using errcode = '28000';
  end if;
  if clean_details is null then
    raise exception 'Write report details first.'
      using errcode = '22023';
  end if;
  if char_length(clean_details) > 5000 then
    raise exception 'Report details must be 5000 characters or fewer.'
      using errcode = '22023';
  end if;

  select *
    into report_record
  from public.message_reports
  where id = p_report_id
  for update;

  if report_record.id is null
    or report_record.reporter_member_id <> current_member_id_value then
    raise exception 'Message report was not found.'
      using errcode = 'P0002';
  end if;

  select *
    into conversation_record
  from public.conversations
  where id = report_record.conversation_id;

  if conversation_record.id is null then
    raise exception 'Conversation was not found.'
      using errcode = 'P0002';
  end if;

  update public.message_reports
  set
    details = clean_details,
    details_submitted_at = now(),
    updated_at = now()
  where id = report_record.id
  returning * into report_record;

  support_message := concat(
    'A member clicked Report after receiving the first message in a conversation.',
    E'\n\nReport ID: ', report_record.id::text,
    E'\nConversation ID: ', report_record.conversation_id::text,
    E'\nMessage ID: ', report_record.message_id::text,
    E'\nEvent ID: ', conversation_record.event_id::text,
    E'\nReporter member ID: ', report_record.reporter_member_id::text,
    E'\nReported member ID: ', report_record.reported_member_id::text,
    E'\n\nOptional details:\n', clean_details
  );

  if report_record.support_request_id is not null then
    update public.support_requests
    set
      message = support_message,
      updated_at = now()
    where id = report_record.support_request_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reportId', report_record.id,
    'detailsSubmittedAt', report_record.details_submitted_at
  );
end;
$$;

revoke all on function public.acknowledge_first_message_notice(uuid)
  from public, anon, authenticated;
revoke all on function public.create_first_message_report(uuid)
  from public, anon, authenticated;
revoke all on function public.add_first_message_report_details(uuid, text)
  from public, anon, authenticated;

grant execute on function public.acknowledge_first_message_notice(uuid)
  to authenticated;
grant execute on function public.create_first_message_report(uuid)
  to authenticated;
grant execute on function public.add_first_message_report_details(uuid, text)
  to authenticated;
