do $$
declare
  code_record record;
  generated_code text;
  rotated boolean;
begin
  for code_record in
    select id
    from public.benefit_codes
    where type = 'referral'
      and code !~ '^[0-9]{3}PLUS[0-9]{3}$'
    order by created_at, id
  loop
    rotated := false;

    for attempt in 1..50 loop
      generated_code := public.generate_referral_code();

      begin
        update public.benefit_codes
          set code = generated_code,
              updated_at = now()
        where id = code_record.id;

        rotated := true;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;

    if not rotated then
      raise exception 'Could not rotate referral code % to the new format.', code_record.id
        using errcode = '23505';
    end if;
  end loop;
end;
$$;

alter table public.benefit_codes
  drop constraint if exists benefit_codes_referral_code_format_check;

alter table public.benefit_codes
  add constraint benefit_codes_referral_code_format_check
  check (type <> 'referral' or code ~ '^[0-9]{3}PLUS[0-9]{3}$');
