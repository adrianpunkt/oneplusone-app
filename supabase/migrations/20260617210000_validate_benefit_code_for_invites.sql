create or replace function public.validate_benefit_code(
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := public.normalize_benefit_code(p_code);
  current_timestamp_value timestamptz := now();
  code_record public.benefit_codes%rowtype;
begin
  if normalized_code !~ '^[A-Z0-9_-]{3,40}$' then
    raise exception 'Enter a valid code.'
      using errcode = '22023';
  end if;

  select *
    into code_record
  from public.benefit_codes
  where code_norm = normalized_code;

  if code_record.id is null
    or code_record.status <> 'active'
    or (code_record.starts_at is not null and code_record.starts_at > current_timestamp_value)
    or (code_record.expires_at is not null and code_record.expires_at <= current_timestamp_value) then
    raise exception 'This code is not valid.'
      using errcode = '22023';
  end if;

  if code_record.max_redemptions is not null and code_record.used_count >= code_record.max_redemptions then
    raise exception 'This code has reached its usage limit.'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', code_record.code,
    'codeType', code_record.type,
    'creditsIncluded', case when code_record.type = 'referral' then 2 else 1 end,
    'message', case
      when code_record.type = 'free'
        then 'Invite code applied. Your membership is free.'
      else 'Referral code applied. Your membership includes 2 credits.'
    end
  );
end;
$$;

revoke all on function public.validate_benefit_code(text) from public, anon, authenticated;
grant execute on function public.validate_benefit_code(text) to service_role;
