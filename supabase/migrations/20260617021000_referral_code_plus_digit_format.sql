create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  left_digits text;
  right_digits text;
begin
  left_digits := lpad(floor(random() * 1000)::integer::text, 3, '0');
  right_digits := lpad(floor(random() * 1000)::integer::text, 3, '0');

  return left_digits || 'PLUS' || right_digits;
end;
$$;

create or replace function public.ensure_referral_code_for_member(
  p_member_id uuid,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_referral_code_id uuid;
  generated_code text;
  generated_code_id uuid;
begin
  select referral_code_id
    into current_referral_code_id
  from public.members
  where id = p_member_id
  for update;

  if current_referral_code_id is not null then
    return current_referral_code_id;
  end if;

  for attempt in 1..50 loop
    generated_code := public.generate_referral_code();

    begin
      insert into public.benefit_codes (
        code,
        type,
        status,
        owner_member_id,
        created_at,
        updated_at
      )
      values (
        generated_code,
        'referral',
        'active',
        p_member_id,
        p_now,
        p_now
      )
      returning id into generated_code_id;

      update public.members
        set referral_code_id = generated_code_id,
            updated_at = p_now
      where id = p_member_id
        and referral_code_id is null;

      return generated_code_id;
    exception
      when unique_violation then
        generated_code_id := null;
    end;
  end loop;

  raise exception 'Could not generate a unique referral code.'
    using errcode = '23505';
end;
$$;

revoke all on function public.generate_referral_code() from public, anon, authenticated;
revoke all on function public.ensure_referral_code_for_member(uuid, timestamptz) from public, anon, authenticated;
