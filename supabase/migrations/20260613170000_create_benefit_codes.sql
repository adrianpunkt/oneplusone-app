create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_norm text generated always as (lower(nullif(btrim(email), ''))) stored unique,
  membership_status text not null default 'pending',
  membership_source text,
  membership_granted_at timestamptz,
  referral_code_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_membership_status_check
    check (membership_status in ('pending', 'active', 'cancelled'))
);

create index if not exists members_membership_status_idx
  on public.members (membership_status);

create table if not exists public.benefit_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_norm text generated always as (upper(replace(btrim(code), ' ', ''))) stored unique,
  type text not null,
  status text not null default 'active',
  owner_member_id uuid references public.members(id) on delete cascade,
  max_redemptions integer,
  used_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benefit_codes_type_check
    check (type in ('free', 'referral')),
  constraint benefit_codes_status_check
    check (status in ('active', 'disabled')),
  constraint benefit_codes_max_redemptions_check
    check (max_redemptions is null or max_redemptions >= 0),
  constraint benefit_codes_referral_owner_check
    check (type <> 'referral' or owner_member_id is not null)
);

create index if not exists benefit_codes_type_status_idx
  on public.benefit_codes (type, status);

create index if not exists benefit_codes_owner_member_id_idx
  on public.benefit_codes (owner_member_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_referral_code_id_fkey'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_referral_code_id_fkey
      foreign key (referral_code_id)
      references public.benefit_codes(id)
      on delete set null;
  end if;
end;
$$;

create table if not exists public.benefit_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.benefit_codes(id),
  code text not null,
  code_type text not null,
  beneficiary_member_id uuid not null references public.members(id) on delete cascade,
  beneficiary_email text,
  beneficiary_email_norm text generated always as (lower(nullif(btrim(beneficiary_email), ''))) stored,
  referrer_member_id uuid references public.members(id) on delete set null,
  status text not null,
  checkout_session_id text,
  payment_intent_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint benefit_code_redemptions_code_type_check
    check (code_type in ('free', 'referral')),
  constraint benefit_code_redemptions_status_check
    check (status in ('pending_payment', 'completed', 'cancelled', 'reversed')),
  constraint benefit_code_redemptions_code_member_key
    unique (code_id, beneficiary_member_id)
);

create index if not exists benefit_code_redemptions_code_id_idx
  on public.benefit_code_redemptions (code_id);

create index if not exists benefit_code_redemptions_beneficiary_member_id_idx
  on public.benefit_code_redemptions (beneficiary_member_id);

create index if not exists benefit_code_redemptions_referrer_member_id_idx
  on public.benefit_code_redemptions (referrer_member_id);

create index if not exists benefit_code_redemptions_checkout_session_id_idx
  on public.benefit_code_redemptions (checkout_session_id);

create table if not exists public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  member_email text,
  member_email_norm text generated always as (lower(nullif(btrim(member_email), ''))) stored,
  delta integer not null,
  reason text not null,
  source_type text not null,
  source_id text not null,
  related_member_id uuid references public.members(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint credit_ledger_entries_delta_check
    check (delta <> 0),
  constraint credit_ledger_entries_idempotency_key
    unique (member_id, reason, source_type, source_id)
);

create index if not exists credit_ledger_entries_member_id_idx
  on public.credit_ledger_entries (member_id);

create index if not exists credit_ledger_entries_member_email_norm_idx
  on public.credit_ledger_entries (member_email_norm);

create index if not exists credit_ledger_entries_created_at_idx
  on public.credit_ledger_entries (created_at);

create or replace view public.member_credit_balances as
select
  members.id as member_id,
  members.email,
  members.email_norm,
  coalesce(sum(credit_ledger_entries.delta), 0)::integer as credit_balance
from public.members
left join public.credit_ledger_entries
  on credit_ledger_entries.member_id = members.id
group by members.id;

alter table public.members enable row level security;
alter table public.benefit_codes enable row level security;
alter table public.benefit_code_redemptions enable row level security;
alter table public.credit_ledger_entries enable row level security;

revoke all on table public.members from anon, authenticated;
revoke all on table public.benefit_codes from anon, authenticated;
revoke all on table public.benefit_code_redemptions from anon, authenticated;
revoke all on table public.credit_ledger_entries from anon, authenticated;
revoke all on table public.member_credit_balances from anon, authenticated;

grant all on table public.members to service_role;
grant all on table public.benefit_codes to service_role;
grant all on table public.benefit_code_redemptions to service_role;
grant all on table public.credit_ledger_entries to service_role;
grant select on table public.member_credit_balances to service_role;

create or replace function public.normalize_benefit_code(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'));
$$;

create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated_code text := '';
begin
  for index in 1..8 loop
    generated_code := generated_code || substr(alphabet, floor(random() * length(alphabet))::integer + 1, 1);
  end loop;

  return generated_code;
end;
$$;

create or replace function public.ensure_member_for_email(
  p_email text,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_email text := nullif(btrim(p_email), '');
  member_id uuid;
begin
  if cleaned_email is null or lower(cleaned_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter the email from your story so we can apply the code.'
      using errcode = '22023';
  end if;

  insert into public.members (
    email,
    membership_status,
    created_at,
    updated_at
  )
  values (
    cleaned_email,
    'pending',
    p_now,
    p_now
  )
  on conflict (email_norm) do update
    set email = excluded.email,
        updated_at = excluded.updated_at
  returning id into member_id;

  return member_id;
end;
$$;

create or replace function public.mark_member_active(
  p_member_id uuid,
  p_source text,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members
    set membership_status = 'active',
        membership_source = coalesce(membership_source, p_source),
        membership_granted_at = coalesce(membership_granted_at, p_now),
        updated_at = p_now
  where id = p_member_id;
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

  for attempt in 1..12 loop
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

create or replace function public.grant_member_credit(
  p_member_id uuid,
  p_delta integer,
  p_reason text,
  p_source_type text,
  p_source_id text,
  p_related_member_id uuid default null,
  p_notes text default null,
  p_created_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_email text;
begin
  if p_delta = 0 then
    raise exception 'Credit ledger delta cannot be zero.'
      using errcode = '22023';
  end if;

  select email
    into member_email
  from public.members
  where id = p_member_id;

  insert into public.credit_ledger_entries (
    member_id,
    member_email,
    delta,
    reason,
    source_type,
    source_id,
    related_member_id,
    notes,
    created_at
  )
  values (
    p_member_id,
    member_email,
    p_delta,
    p_reason,
    p_source_type,
    p_source_id,
    p_related_member_id,
    p_notes,
    p_created_at
  )
  on conflict (member_id, reason, source_type, source_id) do nothing;
end;
$$;

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
  current_time timestamptz := now();
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
    or (code_record.starts_at is not null and code_record.starts_at > current_time)
    or (code_record.expires_at is not null and code_record.expires_at <= current_time) then
    raise exception 'This code is not valid.'
      using errcode = '22023';
  end if;

  member_id := public.ensure_member_for_email(cleaned_email, current_time);

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
      perform public.mark_member_active(member_id, 'free_code', current_time);
      perform public.grant_member_credit(
        member_id,
        1,
        'membership_join_credit',
        'benefit_code_redemption',
        redemption_record.id::text,
        null,
        null,
        current_time
      );
      perform public.ensure_referral_code_for_member(member_id, current_time);
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
        updated_at = current_time
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
    current_time,
    case when code_record.type = 'free' then current_time else null end,
    current_time
  )
  returning id into redemption_id;

  if code_record.type = 'free' then
    perform public.mark_member_active(member_id, 'free_code', current_time);
    perform public.grant_member_credit(
      member_id,
      1,
      'membership_join_credit',
      'benefit_code_redemption',
      redemption_id::text,
      null,
      null,
      current_time
    );
    perform public.ensure_referral_code_for_member(member_id, current_time);
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
  current_time timestamptz := now();
  member_id uuid;
  normalized_referral_code text := public.normalize_benefit_code(p_referral_code);
  referral_redemption public.benefit_code_redemptions%rowtype;
begin
  if nullif(btrim(p_checkout_session_id), '') is null then
    raise exception 'Missing checkout session id.'
      using errcode = '22023';
  end if;

  member_id := public.ensure_member_for_email(p_email, current_time);
  perform public.mark_member_active(member_id, 'stripe_checkout', current_time);
  perform public.grant_member_credit(
    member_id,
    1,
    'membership_join_credit',
    'stripe_checkout',
    p_checkout_session_id,
    null,
    null,
    current_time
  );
  perform public.ensure_referral_code_for_member(member_id, current_time);

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
        completed_at = coalesce(completed_at, current_time),
        updated_at = current_time
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
      current_time
    );

    perform public.grant_member_credit(
      referral_redemption.referrer_member_id,
      1,
      'referral_referrer_bonus',
      'benefit_code_redemption',
      referral_redemption.id::text,
      member_id,
      null,
      current_time
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

revoke all on function public.normalize_benefit_code(text) from public, anon, authenticated;
revoke all on function public.generate_referral_code() from public, anon, authenticated;
revoke all on function public.ensure_member_for_email(text, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_member_active(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.ensure_referral_code_for_member(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.grant_member_credit(uuid, integer, text, text, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.redeem_benefit_code(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_paid_membership(text, text, text, text, uuid) from public, anon, authenticated;

grant execute on function public.redeem_benefit_code(text, text, jsonb) to service_role;
grant execute on function public.complete_paid_membership(text, text, text, text, uuid) to service_role;

insert into public.benefit_codes (
  code,
  type,
  status,
  max_redemptions,
  used_count
)
values (
  'ONEFRIEND',
  'free',
  'active',
  null,
  0
)
on conflict (code_norm) do update
  set code = excluded.code,
      type = excluded.type,
      status = excluded.status,
      updated_at = now();
