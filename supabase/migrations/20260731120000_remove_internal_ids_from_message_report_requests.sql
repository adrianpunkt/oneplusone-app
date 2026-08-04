-- Keep message-report identifiers in the private report record, not in the
-- support request copy shown in the staff support conversation.

create or replace function public.create_conversation_member_report(
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
  reported_message_record public.messages%rowtype;
  reported_member_id_value uuid;
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
    and current_member_id_value in (
      initiated_by_member_id,
      recipient_member_id
    )
  for update;

  if conversation_record.id is null then
    raise exception 'Conversation was not found.'
      using errcode = 'P0002';
  end if;
  if not public.member_attended_past_event(
    current_member_id_value,
    conversation_record.event_id
  ) then
    raise exception 'Messaging opens after your attended event feedback.'
      using errcode = '22023';
  end if;

  reported_member_id_value := case
    when current_member_id_value = conversation_record.initiated_by_member_id
      then conversation_record.recipient_member_id
    else conversation_record.initiated_by_member_id
  end;

  select *
    into reported_message_record
  from public.messages
  where conversation_id = conversation_record.id
    and sender_member_id = reported_member_id_value
  order by created_at desc, id desc
  limit 1;

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
  where conversation_id = conversation_record.id
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
      reported_message_record.id,
      current_member_id_value,
      reported_member_id_value,
      now(),
      now(),
      now()
    )
    returning * into report_record;

    was_created := true;
  end if;

  if report_record.support_request_id is null then
    support_message := concat(
      'A member clicked Report in a conversation.',
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
    'messageId', report_record.message_id,
    'reportId', report_record.id,
    'supportRequestId', report_record.support_request_id,
    'created', was_created
  );
end;
$$;

create or replace function public.add_message_report_details(
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

  update public.message_reports
  set
    details = clean_details,
    details_submitted_at = now(),
    updated_at = now()
  where id = report_record.id
  returning * into report_record;

  support_message := concat(
    'A member clicked Report in a conversation.',
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

-- Keep the superseded first-message report RPCs safe for older clients that
-- may still call them during a deployment transition.
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

  update public.message_reports
  set
    details = clean_details,
    details_submitted_at = now(),
    updated_at = now()
  where id = report_record.id
  returning * into report_record;

  support_message := concat(
    'A member clicked Report after receiving the first message in a conversation.',
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

-- Correct support requests that were generated before the function update.
-- The report table remains the source of truth for every internal identifier.
update public.support_requests as support_request
set
  message = concat(
    case
      when support_request.message like
        'A member clicked Report after receiving the first message in a conversation.%'
        then 'A member clicked Report after receiving the first message in a conversation.'
      else 'A member clicked Report in a conversation.'
    end,
    E'\n\nOptional details:',
    case
      when nullif(btrim(report.details), '') is null
        then ' Not provided yet.'
      else E'\n' || report.details
    end
  ),
  updated_at = now()
from public.message_reports as report
where support_request.id = report.support_request_id
  and support_request.category = 'member_message_report';
