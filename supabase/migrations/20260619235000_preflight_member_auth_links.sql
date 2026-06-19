create or replace function public.preflight_member_auth_link(
  p_token_hash text,
  p_type text,
  p_otp_ttl_seconds integer default 3600
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_type text := lower(btrim(coalesce(p_type, '')));
  token_record record;
  token_sent_at timestamptz;
  token_type text;
begin
  if nullif(btrim(p_token_hash), '') is null then
    return 'invalid';
  end if;

  if normalized_type not in ('email', 'invite', 'magiclink', 'signup') then
    return 'invalid';
  end if;

  select
    ott.token_type::text as auth_token_type,
    u.confirmation_sent_at,
    u.recovery_sent_at,
    u.banned_until
  into token_record
  from auth.one_time_tokens ott
  join auth.users u on u.id = ott.user_id
  where ott.token_hash = p_token_hash
    and (
      (normalized_type = 'email' and ott.token_type::text in ('confirmation_token', 'recovery_token'))
      or (normalized_type in ('invite', 'signup') and ott.token_type::text = 'confirmation_token')
      or (normalized_type = 'magiclink' and ott.token_type::text = 'recovery_token')
    )
  order by case
    when normalized_type = 'email' and ott.token_type::text = 'recovery_token' then 0
    else 1
  end
  limit 1;

  if not found then
    return 'invalid';
  end if;

  if token_record.banned_until is not null and token_record.banned_until > now() then
    return 'invalid';
  end if;

  token_type := token_record.auth_token_type;
  token_sent_at := case
    when token_type = 'recovery_token' then token_record.recovery_sent_at
    else token_record.confirmation_sent_at
  end;

  if token_sent_at is null then
    return 'invalid';
  end if;

  if now() > token_sent_at + make_interval(secs => greatest(coalesce(p_otp_ttl_seconds, 3600), 1)) then
    return 'invalid';
  end if;

  return 'valid';
exception
  when undefined_table or undefined_column or insufficient_privilege then
    return 'unknown';
end;
$$;

revoke all on function public.preflight_member_auth_link(text, text, integer) from public, anon, authenticated;
grant execute on function public.preflight_member_auth_link(text, text, integer) to service_role;
