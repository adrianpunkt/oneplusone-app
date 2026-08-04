alter table public.credit_products
  add column if not exists offer_type text not null default 'standard';

alter table public.credit_products
  drop constraint if exists credit_products_offer_type_check;

alter table public.credit_products
  add constraint credit_products_offer_type_check
    check (offer_type in ('standard', 'post_event_48h'));

comment on column public.credit_products.offer_type is
  'Controls whether a product is always available or unlocked for a limited post-event window.';

drop policy if exists "Members can view active credit products"
  on public.credit_products;
create policy "Members can view active credit products"
  on public.credit_products for select to authenticated
  using (
    status = 'active'
    and offer_type = 'standard'
  );

create unique index if not exists credit_products_active_special_offer_type_idx
  on public.credit_products (offer_type)
  where offer_type <> 'standard' and status = 'active';

insert into public.credit_products (
  id,
  name,
  description,
  localized_content,
  credits,
  price_amount_cents,
  currency,
  stripe_price_id,
  status,
  sort_order,
  offer_type
)
values (
  '48303030-0000-4000-8000-000000000003',
  'Event attendee offer',
  'Three credits for event attendees, available for 48 hours after the event.',
  jsonb_build_object(
    'es',
    jsonb_build_object(
      'name', 'Oferta para asistentes al evento',
      'description', 'Tres créditos para asistentes, disponibles durante las 48 horas posteriores al evento.'
    )
  ),
  3,
  3000,
  'eur',
  null,
  'active',
  5,
  'post_event_48h'
)
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    localized_content = excluded.localized_content,
    credits = excluded.credits,
    price_amount_cents = excluded.price_amount_cents,
    currency = excluded.currency,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    sort_order = excluded.sort_order,
    offer_type = excluded.offer_type,
    updated_at = now();

create or replace function public.get_current_post_event_credit_offer()
returns table (
  product_id uuid,
  product_name text,
  product_description text,
  product_localized_content jsonb,
  product_credits integer,
  product_price_amount_cents integer,
  product_currency text,
  product_stripe_price_id text,
  product_status text,
  product_sort_order integer,
  product_offer_type text,
  offer_event_id uuid,
  offer_event_timezone text,
  offer_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    products.id,
    products.name,
    products.description,
    products.localized_content,
    products.credits,
    products.price_amount_cents,
    products.currency,
    products.stripe_price_id,
    products.status,
    products.sort_order,
    products.offer_type,
    events.id,
    events.timezone,
    coalesce(events.ends_at, events.starts_at) + interval '48 hours'
  from public.event_feedback as feedback
  join public.events as events
    on events.id = feedback.event_id
  join public.event_invitations as invitations
    on invitations.event_id = events.id
   and invitations.member_id = feedback.member_id
  cross join public.credit_products as products
  where feedback.member_id = public.current_active_member_id()
    and feedback.attended
    and invitations.seat_status = 'confirmed'
    and invitations.cancelled_at is null
    and events.status <> 'cancelled'
    and coalesce(events.ends_at, events.starts_at) <= now()
    and coalesce(events.ends_at, events.starts_at) + interval '48 hours' > now()
    and products.offer_type = 'post_event_48h'
    and products.status = 'active'
  order by coalesce(events.ends_at, events.starts_at) desc
  limit 1;
$$;

revoke all on function public.get_current_post_event_credit_offer()
  from public, anon, authenticated;
grant execute on function public.get_current_post_event_credit_offer()
  to authenticated, service_role;
