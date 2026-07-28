create table if not exists public.membership_refunds (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  checkout_session_id text not null,
  payment_intent_id text not null unique,
  stripe_refund_id text unique,
  stripe_idempotency_key text not null unique,
  amount_cents integer not null,
  currency text not null,
  status text not null default 'created',
  reason text not null default 'requested_by_customer',
  pending_reason text,
  failure_reason text,
  request_error text,
  requested_by_admin_id uuid references ops.ops_admin_users(id) on delete set null,
  requested_by_admin_email text not null,
  request_note text not null,
  member_email text not null,
  locale text not null default 'en',
  stripe_created_at timestamptz,
  effects_applied_at timestamptz,
  manual_resolution_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_refunds_amount_check check (amount_cents > 0),
  constraint membership_refunds_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint membership_refunds_status_check check (
    status in (
      'created',
      'request_failed',
      'pending',
      'requires_action',
      'succeeded',
      'failed',
      'canceled'
    )
  ),
  constraint membership_refunds_reason_check check (reason = 'requested_by_customer'),
  constraint membership_refunds_locale_check check (locale in ('en', 'es')),
  constraint membership_refunds_request_note_check check (
    char_length(btrim(request_note)) between 3 and 2000
  )
);

create index if not exists membership_refunds_member_idx
  on public.membership_refunds (member_id, created_at desc);

create index if not exists membership_refunds_status_idx
  on public.membership_refunds (status, updated_at desc);

create table if not exists public.membership_refund_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.membership_refunds(id) on delete cascade,
  locale text not null,
  transactional_id text not null,
  idempotency_key text not null unique,
  delivery_kind text not null default 'initial',
  status text not null default 'pending',
  error text,
  feedback_token_hash text not null unique,
  feedback_expires_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_refund_email_locale_check check (locale in ('en', 'es')),
  constraint membership_refund_email_kind_check check (
    delivery_kind in ('initial', 'resend')
  ),
  constraint membership_refund_email_status_check check (
    status in ('pending', 'sent', 'failed')
  ),
  constraint membership_refund_email_expiry_check check (
    feedback_expires_at > created_at
  )
);

create index if not exists membership_refund_email_refund_idx
  on public.membership_refund_email_deliveries (refund_id, created_at desc);

create unique index if not exists membership_refund_email_initial_idx
  on public.membership_refund_email_deliveries (refund_id)
  where delivery_kind = 'initial';

create table if not exists public.membership_refund_feedback (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null unique references public.membership_refunds(id) on delete cascade,
  delivery_id uuid references public.membership_refund_email_deliveries(id) on delete set null,
  reason text not null,
  comments text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_refund_feedback_reason_check check (
    reason in (
      'not_enough_suitable_events',
      'location_or_timing',
      'price_or_value',
      'app_or_signup_experience',
      'personal_circumstances',
      'other'
    )
  ),
  constraint membership_refund_feedback_comments_check check (
    comments is null or char_length(comments) <= 2000
  ),
  constraint membership_refund_feedback_other_check check (
    reason <> 'other' or nullif(btrim(comments), '') is not null
  )
);

alter table public.membership_refunds enable row level security;
alter table public.membership_refund_email_deliveries enable row level security;
alter table public.membership_refund_feedback enable row level security;

revoke all on table public.membership_refunds from public, anon, authenticated;
revoke all on table public.membership_refund_email_deliveries from public, anon, authenticated;
revoke all on table public.membership_refund_feedback from public, anon, authenticated;

grant all on table public.membership_refunds to service_role;
grant all on table public.membership_refund_email_deliveries to service_role;
grant all on table public.membership_refund_feedback to service_role;

create or replace function public.ops_begin_membership_refund(
  p_member_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer,
  p_currency text,
  p_admin_id uuid,
  p_admin_email text,
  p_note text,
  p_member_email text,
  p_locale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_checkout_session_id text := nullif(btrim(p_checkout_session_id), '');
  clean_payment_intent_id text := nullif(btrim(p_payment_intent_id), '');
  clean_admin_email text := lower(nullif(btrim(p_admin_email), ''));
  clean_member_email text := lower(nullif(btrim(p_member_email), ''));
  clean_note text := nullif(btrim(p_note), '');
  clean_currency text := lower(nullif(btrim(p_currency), ''));
  clean_locale text := case when lower(p_locale) = 'es' then 'es' else 'en' end;
  existing_refund public.membership_refunds%rowtype;
  member_record public.members%rowtype;
  refund_id uuid;
begin
  if clean_checkout_session_id is null or clean_checkout_session_id !~ '^cs_' then
    raise exception 'A valid Stripe checkout session is required.' using errcode = '22023';
  end if;
  if clean_payment_intent_id is null or clean_payment_intent_id !~ '^pi_' then
    raise exception 'A valid Stripe PaymentIntent is required.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'The refundable amount must be positive.' using errcode = '22023';
  end if;
  if clean_currency is null or clean_currency !~ '^[a-z]{3}$' then
    raise exception 'A valid three-letter currency is required.' using errcode = '22023';
  end if;
  if clean_admin_email is null or clean_member_email is null then
    raise exception 'Admin and member emails are required.' using errcode = '22023';
  end if;
  if clean_note is null or char_length(clean_note) < 3 or char_length(clean_note) > 2000 then
    raise exception 'An internal note between 3 and 2,000 characters is required.'
      using errcode = '22023';
  end if;

  select *
  into member_record
  from public.members
  where id = p_member_id
  for update;

  if member_record.id is null then
    raise exception 'Member was not found.' using errcode = 'P0002';
  end if;
  if lower(coalesce(member_record.email, '')) <> clean_member_email then
    raise exception 'The confirmation email does not match the member.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.credit_ledger_entries
    where member_id = p_member_id
      and reason = 'membership_join_credit'
      and source_type = 'stripe_checkout'
      and source_id = clean_checkout_session_id
      and delta = 1
  ) then
    raise exception 'The checkout is not linked to this member joining credit.'
      using errcode = '22023';
  end if;

  select *
  into existing_refund
  from public.membership_refunds
  where payment_intent_id = clean_payment_intent_id;

  if existing_refund.id is not null then
    if existing_refund.member_id <> p_member_id
      or existing_refund.checkout_session_id <> clean_checkout_session_id
      or existing_refund.amount_cents <> p_amount_cents
      or existing_refund.currency <> clean_currency
    then
      raise exception 'The existing refund request does not match this payment.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'id', existing_refund.id,
      'status', existing_refund.status,
      'stripeRefundId', existing_refund.stripe_refund_id,
      'stripeIdempotencyKey', existing_refund.stripe_idempotency_key,
      'existing', true
    );
  end if;

  refund_id := gen_random_uuid();
  insert into public.membership_refunds (
    id,
    member_id,
    checkout_session_id,
    payment_intent_id,
    stripe_idempotency_key,
    amount_cents,
    currency,
    requested_by_admin_id,
    requested_by_admin_email,
    request_note,
    member_email,
    locale
  ) values (
    refund_id,
    p_member_id,
    clean_checkout_session_id,
    clean_payment_intent_id,
    'membership-refund-' || refund_id::text,
    p_amount_cents,
    clean_currency,
    p_admin_id,
    clean_admin_email,
    clean_note,
    clean_member_email,
    clean_locale
  );

  insert into ops.ops_audit_log (
    admin_user_id,
    admin_email,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    metadata_json
  ) values (
    p_admin_id,
    clean_admin_email,
    'member.membership_refund_created',
    'membership_refund',
    refund_id::text,
    '{}'::jsonb,
    jsonb_build_object(
      'memberId', p_member_id,
      'paymentIntentId', clean_payment_intent_id,
      'amountCents', p_amount_cents,
      'currency', clean_currency,
      'status', 'created'
    ),
    jsonb_build_object('checkoutSessionId', clean_checkout_session_id)
  );

  return jsonb_build_object(
    'id', refund_id,
    'status', 'created',
    'stripeRefundId', null,
    'stripeIdempotencyKey', 'membership-refund-' || refund_id::text,
    'existing', false
  );
end;
$$;

create or replace function public.sync_membership_refund(
  p_refund_id uuid,
  p_stripe_refund_id text,
  p_status text,
  p_pending_reason text default null,
  p_failure_reason text default null,
  p_request_error text default null,
  p_stripe_created_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  refund_record public.membership_refunds%rowtype;
  prior_status text;
  accepted_status boolean;
  effects_were_applied boolean;
  status_changed boolean;
  prior_membership_status text;
begin
  if p_status not in (
    'created',
    'request_failed',
    'pending',
    'requires_action',
    'succeeded',
    'failed',
    'canceled'
  ) then
    raise exception 'Unsupported refund status.' using errcode = '22023';
  end if;

  select *
  into refund_record
  from public.membership_refunds
  where id = p_refund_id
  for update;

  if refund_record.id is null then
    raise exception 'Refund record was not found.' using errcode = 'P0002';
  end if;
  if refund_record.stripe_refund_id is not null
    and nullif(btrim(p_stripe_refund_id), '') is not null
    and refund_record.stripe_refund_id <> nullif(btrim(p_stripe_refund_id), '')
  then
    raise exception 'Stripe refund ID does not match the existing record.'
      using errcode = '22023';
  end if;

  if p_status in ('created', 'request_failed')
    and refund_record.status not in ('created', 'request_failed')
  then
    return jsonb_build_object(
      'id', refund_record.id,
      'memberId', refund_record.member_id,
      'status', refund_record.status,
      'effectsApplied', refund_record.effects_applied_at is not null,
      'effectsAppliedNow', false
    );
  end if;

  prior_status := refund_record.status;
  effects_were_applied := refund_record.effects_applied_at is not null;
  status_changed := refund_record.status is distinct from p_status
    or refund_record.stripe_refund_id is distinct from coalesce(
      nullif(btrim(p_stripe_refund_id), ''),
      refund_record.stripe_refund_id
    )
    or refund_record.pending_reason is distinct from nullif(btrim(p_pending_reason), '')
    or refund_record.failure_reason is distinct from nullif(btrim(p_failure_reason), '')
    or refund_record.request_error is distinct from nullif(btrim(p_request_error), '');
  accepted_status := p_status in ('pending', 'requires_action', 'succeeded');

  update public.membership_refunds
  set stripe_refund_id = coalesce(
        nullif(btrim(p_stripe_refund_id), ''),
        stripe_refund_id
      ),
      status = p_status,
      pending_reason = nullif(btrim(p_pending_reason), ''),
      failure_reason = nullif(btrim(p_failure_reason), ''),
      request_error = nullif(btrim(p_request_error), ''),
      stripe_created_at = coalesce(p_stripe_created_at, stripe_created_at),
      manual_resolution_required = case
        when p_status in ('failed', 'canceled') and effects_applied_at is not null then true
        when p_status in ('pending', 'requires_action', 'succeeded') then false
        else manual_resolution_required
      end,
      updated_at = now()
  where id = refund_record.id
  returning * into refund_record;

  if accepted_status and not effects_were_applied then
    select membership_status
    into prior_membership_status
    from public.members
    where id = refund_record.member_id;

    update public.members
    set membership_status = 'cancelled',
        updated_at = now()
    where id = refund_record.member_id;

    perform public.grant_member_credit(
      refund_record.member_id,
      -1,
      'membership_refund_reversal',
      'stripe_refund',
      refund_record.id::text,
      null,
      'Joining credit reversed after the membership refund was accepted by Stripe.',
      now()
    );

    update public.membership_refunds
    set effects_applied_at = now(),
        updated_at = now()
    where id = refund_record.id
    returning * into refund_record;

    insert into ops.ops_audit_log (
      admin_user_id,
      admin_email,
      action,
      entity_type,
      entity_id,
      before_json,
      after_json,
      metadata_json
    ) values
      (
        refund_record.requested_by_admin_id,
        refund_record.requested_by_admin_email,
        'member.membership_refund_membership_cancelled',
        'member',
        refund_record.member_id::text,
        jsonb_build_object('membershipStatus', prior_membership_status),
        jsonb_build_object('membershipStatus', 'cancelled'),
        jsonb_build_object('refundId', refund_record.id)
      ),
      (
        refund_record.requested_by_admin_id,
        refund_record.requested_by_admin_email,
        'member.membership_refund_credit_reversed',
        'member',
        refund_record.member_id::text,
        '{}'::jsonb,
        jsonb_build_object(
          'delta', -1,
          'reason', 'membership_refund_reversal',
          'sourceId', refund_record.id
        ),
        jsonb_build_object('refundId', refund_record.id)
      );
  end if;

  if status_changed then
    insert into ops.ops_audit_log (
      admin_user_id,
      admin_email,
      action,
      entity_type,
      entity_id,
      before_json,
      after_json,
      metadata_json
    ) values (
      refund_record.requested_by_admin_id,
      refund_record.requested_by_admin_email,
      'member.membership_refund_status_synced',
      'membership_refund',
      refund_record.id::text,
      jsonb_build_object('status', prior_status),
      jsonb_build_object(
        'status', refund_record.status,
        'stripeRefundId', refund_record.stripe_refund_id,
        'pendingReason', refund_record.pending_reason,
        'failureReason', refund_record.failure_reason,
        'requestError', refund_record.request_error,
        'effectsAppliedAt', refund_record.effects_applied_at,
        'manualResolutionRequired', refund_record.manual_resolution_required
      ),
      jsonb_build_object('memberId', refund_record.member_id)
    );
  end if;

  return jsonb_build_object(
    'id', refund_record.id,
    'memberId', refund_record.member_id,
    'status', refund_record.status,
    'effectsApplied', refund_record.effects_applied_at is not null,
    'effectsAppliedNow', accepted_status and not effects_were_applied,
    'manualResolutionRequired', refund_record.manual_resolution_required
  );
end;
$$;

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

revoke all on function public.ops_begin_membership_refund(
  uuid, text, text, integer, text, uuid, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.sync_membership_refund(
  uuid, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.submit_membership_refund_feedback(
  text, text, text
) from public, anon, authenticated;

grant execute on function public.ops_begin_membership_refund(
  uuid, text, text, integer, text, uuid, text, text, text, text
) to service_role;
grant execute on function public.sync_membership_refund(
  uuid, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.submit_membership_refund_feedback(
  text, text, text
) to service_role;
