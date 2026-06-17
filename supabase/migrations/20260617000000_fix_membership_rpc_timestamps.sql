create or replace function public.redeem_benefit_code(
  p_code text,
  p_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := public.normalize_benefit_code(p_code);
  cleaned_email text := nullif(btrim(p_email), '');
  current_timestamp_value timestamptz := now();
  code_record public.benefit_codes%rowtype;
  member_id uuid;
  redemption_record public.benefit_code_redemptions%rowtype;
  redemption_id uuid;
begin
  if normalized_code !~ '^[A-Z0-9_-]{3,40}$' then
    raise exception 'Enter a valid code.'
      using errcode = '22023';
  end if;

  select *
    into code_record
  from public.benefit_codes
  where code_norm = normalized_code
  for update;

  if code_record.id is null
    or code_record.status <> 'active'
    or (code_record.starts_at is not null and code_record.starts_at > current_timestamp_value)
    or (code_record.expires_at is not null and code_record.expires_at <= current_timestamp_value) then
    raise exception 'This code is not valid.'
      using errcode = '22023';
  end if;

  member_id := public.ensure_member_for_email(cleaned_email, current_timestamp_value);

  if code_record.type = 'referral' and code_record.owner_member_id = member_id then
    raise exception 'You cannot use your own referral code.'
      using errcode = '22023';
  end if;

  select *
    into redemption_record
  from public.benefit_code_redemptions
  where code_id = code_record.id
    and beneficiary_member_id = member_id
    and status not in ('cancelled', 'reversed')
  order by created_at desc
  limit 1;

  if redemption_record.id is not null then
    if code_record.type = 'free' and redemption_record.status = 'completed' then
      perform public.mark_member_active(member_id, 'free_code', current_timestamp_value);
      perform public.grant_member_credit(
        member_id,
        1,
        'membership_join_credit',
        'benefit_code_redemption',
        redemption_record.id::text,
        null,
        null,
        current_timestamp_value
      );
      perform public.ensure_referral_code_for_member(member_id, current_timestamp_value);
    end if;

    return jsonb_build_object(
      'ok', true,
      'code', code_record.code,
      'codeType', code_record.type,
      'redemptionId', redemption_record.id,
      'message', case
        when code_record.type = 'free'
          then 'Hello friend! Your free membership is ready.'
        else 'Thanks to your friend, you''ll get 1 extra free credit, yay!'
      end,
      'completionPath', case
        when code_record.type = 'free'
          then '/success?benefit=free&redemption_id=' || redemption_record.id::text
        else null
      end
    );
  end if;

  if code_record.max_redemptions is not null and code_record.used_count >= code_record.max_redemptions then
    raise exception 'This code has reached its usage limit.'
      using errcode = '22023';
  end if;

  update public.benefit_codes
    set used_count = used_count + 1,
        updated_at = current_timestamp_value
  where id = code_record.id;

  insert into public.benefit_code_redemptions (
    code_id,
    code,
    code_type,
    beneficiary_member_id,
    beneficiary_email,
    referrer_member_id,
    status,
    metadata_json,
    created_at,
    completed_at,
    updated_at
  )
  values (
    code_record.id,
    code_record.code,
    code_record.type,
    member_id,
    cleaned_email,
    case when code_record.type = 'referral' then code_record.owner_member_id else null end,
    case when code_record.type = 'free' then 'completed' else 'pending_payment' end,
    coalesce(p_metadata, '{}'::jsonb),
    current_timestamp_value,
    case when code_record.type = 'free' then current_timestamp_value else null end,
    current_timestamp_value
  )
  returning id into redemption_id;

  if code_record.type = 'free' then
    perform public.mark_member_active(member_id, 'free_code', current_timestamp_value);
    perform public.grant_member_credit(
      member_id,
      1,
      'membership_join_credit',
      'benefit_code_redemption',
      redemption_id::text,
      null,
      null,
      current_timestamp_value
    );
    perform public.ensure_referral_code_for_member(member_id, current_timestamp_value);
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', code_record.code,
    'codeType', code_record.type,
    'redemptionId', redemption_id,
    'message', case
      when code_record.type = 'free'
        then 'Hello friend! Your free membership is ready.'
      else 'Thanks to your friend, you''ll get 1 extra free credit, yay!'
    end,
    'completionPath', case
      when code_record.type = 'free'
        then '/success?benefit=free&redemption_id=' || redemption_id::text
      else null
    end
  );
end;
$$;

create or replace function public.complete_paid_membership(
  p_email text,
  p_checkout_session_id text,
  p_payment_intent_id text default null,
  p_referral_code text default null,
  p_referral_redemption_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_timestamp_value timestamptz := now();
  member_id uuid;
  normalized_referral_code text := public.normalize_benefit_code(p_referral_code);
  referral_redemption public.benefit_code_redemptions%rowtype;
begin
  if nullif(btrim(p_checkout_session_id), '') is null then
    raise exception 'Missing checkout session id.'
      using errcode = '22023';
  end if;

  member_id := public.ensure_member_for_email(p_email, current_timestamp_value);
  perform public.mark_member_active(member_id, 'stripe_checkout', current_timestamp_value);
  perform public.grant_member_credit(
    member_id,
    1,
    'membership_join_credit',
    'stripe_checkout',
    p_checkout_session_id,
    null,
    null,
    current_timestamp_value
  );
  perform public.ensure_referral_code_for_member(member_id, current_timestamp_value);

  if p_referral_redemption_id is not null then
    select *
      into referral_redemption
    from public.benefit_code_redemptions
    where id = p_referral_redemption_id
      and beneficiary_member_id = member_id
      and code_type = 'referral'
      and status in ('pending_payment', 'completed')
    for update;
  end if;

  if referral_redemption.id is null and normalized_referral_code <> '' then
    select redemptions.*
      into referral_redemption
    from public.benefit_code_redemptions as redemptions
    join public.benefit_codes as codes
      on codes.id = redemptions.code_id
    where redemptions.beneficiary_member_id = member_id
      and redemptions.code_type = 'referral'
      and redemptions.status in ('pending_payment', 'completed')
      and codes.code_norm = normalized_referral_code
    order by redemptions.created_at desc
    limit 1
    for update of redemptions;
  end if;

  if referral_redemption.id is null then
    return jsonb_build_object(
      'ok', true,
      'memberId', member_id,
      'referralApplied', false
    );
  end if;

  update public.benefit_code_redemptions
    set status = 'completed',
        checkout_session_id = p_checkout_session_id,
        payment_intent_id = nullif(btrim(p_payment_intent_id), ''),
        completed_at = coalesce(completed_at, current_timestamp_value),
        updated_at = current_timestamp_value
  where id = referral_redemption.id;

  if referral_redemption.referrer_member_id is not null then
    perform public.grant_member_credit(
      member_id,
      1,
      'referral_new_member_bonus',
      'benefit_code_redemption',
      referral_redemption.id::text,
      referral_redemption.referrer_member_id,
      null,
      current_timestamp_value
    );

    perform public.grant_member_credit(
      referral_redemption.referrer_member_id,
      1,
      'referral_referrer_bonus',
      'benefit_code_redemption',
      referral_redemption.id::text,
      member_id,
      null,
      current_timestamp_value
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'memberId', member_id,
    'referralApplied', true,
    'redemptionId', referral_redemption.id
  );
end;
$$;

create or replace function public.ensure_member_for_submitted_story(
  p_registration_id uuid,
  p_delay_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_record public.profile_registrations%rowtype;
  member_record public.members%rowtype;
  member_id uuid;
  current_timestamp_value timestamptz := now();
begin
  select *
    into registration_record
  from public.profile_registrations
  where id = p_registration_id
    and status = 'submitted';

  if registration_record.id is null then
    raise exception 'Submitted story registration was not found.'
      using errcode = 'P0002';
  end if;

  if registration_record.contact_email_norm is null then
    raise exception 'Submitted story registration does not have a valid email.'
      using errcode = '22023';
  end if;

  member_id := public.ensure_member_for_email(registration_record.contact_email, current_timestamp_value);

  select *
    into member_record
  from public.members
  where id = member_id;

  if member_record.membership_status = 'active' then
    return jsonb_build_object(
      'ok', true,
      'memberId', member_id,
      'registrationId', registration_record.id,
      'email', registration_record.contact_email,
      'locale', registration_record.locale,
      'firstName', nullif(registration_record.profile_json ->> 'profile.first_name', ''),
      'submittedAt', registration_record.submitted_at,
      'membershipStatus', member_record.membership_status,
      'paymentRequired', false
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'memberId', member_id,
    'registrationId', registration_record.id,
    'email', registration_record.contact_email,
    'locale', registration_record.locale,
    'firstName', nullif(registration_record.profile_json ->> 'profile.first_name', ''),
    'submittedAt', registration_record.submitted_at,
    'membershipStatus', member_record.membership_status,
    'paymentRequired', true
  );
end;
$$;

create or replace function public.create_membership_payment_resume_token_for_email(
  p_email text,
  p_token_ttl_minutes integer default 30,
  p_source text default 'manual_request'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_email text := lower(nullif(btrim(p_email), ''));
  registration_record public.profile_registrations%rowtype;
  member_record public.members%rowtype;
  member_id uuid;
  token_id uuid;
  generated_token text;
  token_expires_at timestamptz;
  current_timestamp_value timestamptz := now();
  ttl_minutes integer := greatest(1, least(coalesce(p_token_ttl_minutes, 30), 1440));
  clean_source text := case
    when p_source = 'loops_workflow' then 'loops_workflow'
    else 'manual_request'
  end;
begin
  if cleaned_email is null or cleaned_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false);
  end if;

  select *
    into registration_record
  from public.profile_registrations
  where contact_email_norm = cleaned_email
    and status = 'submitted'
  order by submitted_at desc nulls last, updated_at desc
  limit 1;

  if registration_record.id is null then
    return jsonb_build_object('ok', false);
  end if;

  member_id := public.ensure_member_for_email(registration_record.contact_email, current_timestamp_value);

  select *
    into member_record
  from public.members
  where id = member_id;

  if member_record.membership_status <> 'pending' then
    return jsonb_build_object('ok', false);
  end if;

  generated_token := public.generate_payment_resume_secret();
  token_expires_at := current_timestamp_value + make_interval(mins => ttl_minutes);

  insert into public.membership_payment_resume_tokens (
    token_hash,
    member_id,
    profile_registration_id,
    email,
    locale,
    source,
    expires_at,
    created_at
  )
  values (
    public.hash_payment_resume_secret(generated_token),
    member_id,
    registration_record.id,
    registration_record.contact_email,
    registration_record.locale,
    clean_source,
    token_expires_at,
    current_timestamp_value
  )
  returning id into token_id;

  return jsonb_build_object(
    'ok', true,
    'tokenId', token_id,
    'token', generated_token,
    'expiresAt', token_expires_at,
    'memberId', member_id,
    'registrationId', registration_record.id,
    'email', registration_record.contact_email,
    'locale', registration_record.locale,
    'firstName', nullif(registration_record.profile_json ->> 'profile.first_name', '')
  );
end;
$$;

create or replace function public.claim_membership_payment_resume_token(
  p_token text,
  p_session_ttl_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.membership_payment_resume_tokens%rowtype;
  member_record public.members%rowtype;
  session_token text;
  session_expires_at timestamptz;
  current_timestamp_value timestamptz := now();
  ttl_minutes integer := greatest(1, least(coalesce(p_session_ttl_minutes, 30), 1440));
begin
  if nullif(btrim(p_token), '') is null then
    return jsonb_build_object('ok', false);
  end if;

  select *
    into token_record
  from public.membership_payment_resume_tokens
  where token_hash = public.hash_payment_resume_secret(p_token)
    and used_at is null
    and expires_at > current_timestamp_value
  for update;

  if token_record.id is null then
    return jsonb_build_object('ok', false);
  end if;

  select *
    into member_record
  from public.members
  where id = token_record.member_id;

  update public.membership_payment_resume_tokens
    set used_at = current_timestamp_value
  where id = token_record.id;

  if member_record.id is null or member_record.membership_status <> 'pending' then
    return jsonb_build_object('ok', false);
  end if;

  session_token := public.generate_payment_resume_secret();
  session_expires_at := current_timestamp_value + make_interval(mins => ttl_minutes);

  insert into public.membership_payment_resume_sessions (
    session_hash,
    token_id,
    member_id,
    email,
    locale,
    expires_at,
    created_at
  )
  values (
    public.hash_payment_resume_secret(session_token),
    token_record.id,
    token_record.member_id,
    token_record.email,
    token_record.locale,
    session_expires_at,
    current_timestamp_value
  );

  return jsonb_build_object(
    'ok', true,
    'sessionToken', session_token,
    'maxAgeSeconds', ttl_minutes * 60,
    'memberId', token_record.member_id,
    'email', token_record.email,
    'locale', token_record.locale,
    'expiresAt', session_expires_at
  );
end;
$$;

revoke all on function public.redeem_benefit_code(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_paid_membership(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ensure_member_for_submitted_story(uuid, integer) from public, anon, authenticated;
revoke all on function public.create_membership_payment_resume_token_for_email(text, integer, text) from public, anon, authenticated;
revoke all on function public.claim_membership_payment_resume_token(text, integer) from public, anon, authenticated;

grant execute on function public.redeem_benefit_code(text, text, jsonb) to service_role;
grant execute on function public.complete_paid_membership(text, text, text, text, uuid) to service_role;
grant execute on function public.ensure_member_for_submitted_story(uuid, integer) to service_role;
grant execute on function public.create_membership_payment_resume_token_for_email(text, integer, text) to service_role;
grant execute on function public.claim_membership_payment_resume_token(text, integer) to service_role;
