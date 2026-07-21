create table if not exists public.event_email_click_tokens (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.event_email_deliveries(id) on delete cascade,
  created_action_id uuid references public.event_action_runs(id) on delete set null,
  token_hash text not null unique,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  click_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint event_email_click_tokens_count_check check (click_count >= 0)
);

create index if not exists event_email_click_tokens_delivery_idx
  on public.event_email_click_tokens (delivery_id, created_at desc);

alter table public.event_email_click_tokens enable row level security;

revoke all on table public.event_email_click_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.event_email_click_tokens to service_role;

create or replace function public.create_event_email_click_token(
  p_delivery_id uuid,
  p_action_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.event_email_deliveries%rowtype;
  raw_token text;
begin
  select * into delivery_record
  from public.event_email_deliveries
  where id = p_delivery_id;

  if delivery_record.id is null then
    raise exception 'Delivery was not found.' using errcode = 'P0002';
  end if;

  if delivery_record.triggering_action_id is distinct from p_action_id
    or (p_action_id is not null and not exists (
      select 1
      from public.event_action_runs
      where id = p_action_id
        and event_id = delivery_record.event_id
    ))
    or (p_action_id is null and delivery_record.triggered_by_member_id is null) then
    raise exception 'The delivery action does not match.' using errcode = '28000';
  end if;

  if delivery_record.status not in ('sending', 'sent') then
    raise exception 'Only sending or sent deliveries can create click tracking.'
      using errcode = '22023';
  end if;

  raw_token := public.generate_payment_resume_secret();

  insert into public.event_email_click_tokens (
    delivery_id,
    created_action_id,
    token_hash
  ) values (
    delivery_record.id,
    p_action_id,
    public.hash_payment_resume_secret(raw_token)
  );

  return jsonb_build_object(
    'ok', true,
    'deliveryId', delivery_record.id,
    'token', raw_token
  );
end;
$$;

create or replace function public.record_event_email_click(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clicked_at timestamptz := now();
  click_token_id uuid;
  clicked_delivery_id uuid;
begin
  if nullif(btrim(p_token), '') is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  update public.event_email_click_tokens
  set first_clicked_at = coalesce(first_clicked_at, clicked_at),
      last_clicked_at = clicked_at,
      click_count = click_count + 1
  where token_hash = public.hash_payment_resume_secret(p_token)
  returning id, event_email_click_tokens.delivery_id
  into click_token_id, clicked_delivery_id;

  if click_token_id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'clicked',
    'deliveryId', clicked_delivery_id,
    'clickedAt', clicked_at
  );
end;
$$;

revoke all on function public.create_event_email_click_token(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_event_email_click(text)
  from public, anon, authenticated;

grant execute on function public.create_event_email_click_token(uuid, uuid)
  to service_role;
grant execute on function public.record_event_email_click(text)
  to service_role;
