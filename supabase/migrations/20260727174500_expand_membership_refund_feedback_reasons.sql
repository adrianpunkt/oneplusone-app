begin;

alter table public.membership_refund_feedback
  drop constraint if exists membership_refund_feedback_reason_check;

alter table public.membership_refund_feedback
  add constraint membership_refund_feedback_reason_check check (
    reason in (
      'not_enough_suitable_events',
      'event_format_or_atmosphere',
      'people_or_connections',
      'location_or_timing',
      'price_or_value',
      'app_or_signup_experience',
      'personal_circumstances',
      'other'
    )
  );

create or replace function public.submit_membership_refund_feedback(
  p_feedback_token_hash text,
  p_reason text,
  p_comments text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.membership_refund_email_deliveries%rowtype;
  clean_comments text := nullif(btrim(p_comments), '');
  response_id uuid;
begin
  if p_reason not in (
    'not_enough_suitable_events',
    'event_format_or_atmosphere',
    'people_or_connections',
    'location_or_timing',
    'price_or_value',
    'app_or_signup_experience',
    'personal_circumstances',
    'other'
  ) then
    raise exception 'Choose a feedback reason.' using errcode = '22023';
  end if;
  if clean_comments is not null and char_length(clean_comments) > 2000 then
    raise exception 'Comments must be 2,000 characters or fewer.' using errcode = '22023';
  end if;
  if p_reason = 'other' and clean_comments is null then
    raise exception 'Please add comments when choosing Other.' using errcode = '22023';
  end if;

  select *
  into delivery_record
  from public.membership_refund_email_deliveries
  where feedback_token_hash = nullif(btrim(p_feedback_token_hash), '')
    and status = 'sent'
    and feedback_expires_at > now()
  for update;

  if delivery_record.id is null then
    raise exception 'This feedback link is invalid or has expired.' using errcode = '22023';
  end if;

  select id
  into response_id
  from public.membership_refund_feedback
  where refund_id = delivery_record.refund_id;

  if response_id is not null then
    return jsonb_build_object(
      'ok', true,
      'alreadySubmitted', true,
      'feedbackId', response_id
    );
  end if;

  insert into public.membership_refund_feedback (
    refund_id,
    delivery_id,
    reason,
    comments
  ) values (
    delivery_record.refund_id,
    delivery_record.id,
    p_reason,
    clean_comments
  )
  returning id into response_id;

  insert into ops.ops_audit_log (
    admin_user_id,
    admin_email,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    metadata_json
  )
  select
    membership_refunds.requested_by_admin_id,
    membership_refunds.requested_by_admin_email,
    'member.membership_refund_feedback_submitted',
    'membership_refund',
    membership_refunds.id::text,
    '{}'::jsonb,
    jsonb_build_object('feedbackId', response_id, 'reason', p_reason),
    jsonb_build_object('memberId', membership_refunds.member_id)
  from public.membership_refunds
  where membership_refunds.id = delivery_record.refund_id;

  return jsonb_build_object(
    'ok', true,
    'alreadySubmitted', false,
    'feedbackId', response_id
  );
end;
$$;

revoke all on function public.submit_membership_refund_feedback(
  text, text, text
) from public, anon, authenticated;

grant execute on function public.submit_membership_refund_feedback(
  text, text, text
) to service_role;

commit;
