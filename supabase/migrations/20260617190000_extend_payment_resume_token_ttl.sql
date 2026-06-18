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
  ttl_minutes integer := greatest(1, least(coalesce(p_token_ttl_minutes, 30), 43200));
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
  ttl_minutes integer := greatest(1, least(coalesce(p_session_ttl_minutes, 30), 43200));
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

revoke all on function public.create_membership_payment_resume_token_for_email(text, integer, text) from public, anon, authenticated;
revoke all on function public.claim_membership_payment_resume_token(text, integer) from public, anon, authenticated;

grant execute on function public.create_membership_payment_resume_token_for_email(text, integer, text) to service_role;
grant execute on function public.claim_membership_payment_resume_token(text, integer) to service_role;
