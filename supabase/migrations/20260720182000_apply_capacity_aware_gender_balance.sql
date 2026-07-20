-- Let the first three people of each binary gender claim seats independently
-- at an eight-person event, or the first four at a ten/twelve-person event.
-- After that threshold, admit balanced pairs while capacity remains.

comment on column public.events.gender_balance_enabled is
  'When true, admit each binary gender independently up to three people at capacity 8 or four people at capacity 10+, then require balanced pairs.';

create or replace function public.event_gender_balance_requires_waitlist(
  p_member_gender text,
  p_female_count integer,
  p_male_count integer,
  p_event_capacity integer,
  p_eligible_opposite_waiter_exists boolean
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_member_gender = 'female' then
      coalesce(p_female_count, 0) >= case
        when coalesce(p_event_capacity, 8) >= 10 then 4
        else 3
      end
      and (
        coalesce(p_female_count, 0) > coalesce(p_male_count, 0)
        or (
          coalesce(p_female_count, 0) = coalesce(p_male_count, 0)
          and not coalesce(p_eligible_opposite_waiter_exists, false)
        )
      )
    when p_member_gender = 'male' then
      coalesce(p_male_count, 0) >= case
        when coalesce(p_event_capacity, 8) >= 10 then 4
        else 3
      end
      and (
        coalesce(p_male_count, 0) > coalesce(p_female_count, 0)
        or (
          coalesce(p_male_count, 0) = coalesce(p_female_count, 0)
          and not coalesce(p_eligible_opposite_waiter_exists, false)
        )
      )
    else false
  end;
$$;

comment on function public.event_gender_balance_requires_waitlist(text, integer, integer, integer, boolean) is
  'Returns whether an incoming member should be balance-waitlisted from the pre-join counts, event capacity, and eligible opposite-gender waitlist.';

revoke all on function public.event_gender_balance_requires_waitlist(text, integer, integer, integer, boolean)
  from public, anon, authenticated;

create or replace function public.event_seat_waitlist_reason(
  p_event_id uuid,
  p_member_id uuid,
  p_exclude_invitation_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  occupied_count integer;
  female_count integer;
  male_count integer;
  member_gender text;
  eligible_opposite_waiter_exists boolean;
begin
  select * into event_record
  from public.events
  where id = p_event_id;

  if event_record.id is null
    or event_record.status not in ('inviting', 'confirmed')
    or now() >= event_record.rsvp_deadline_at then
    return 'closed';
  end if;

  select
    count(*) filter (where occupant.kind = 'seat')
      + count(*) filter (where occupant.kind = 'hold')
  into occupied_count
  from (
    select invitations.member_id, invitations.id as invitation_id, 'seat'::text as kind
    from public.event_invitations as invitations
    where invitations.event_id = p_event_id
      and invitations.seat_status = 'confirmed'
      and invitations.id is distinct from p_exclude_invitation_id
    union all
    select holds.member_id, holds.invitation_id, 'hold'::text
    from public.event_seat_holds as holds
    where holds.event_id = p_event_id
      and holds.status = 'active'
      and holds.expires_at > now()
      and holds.invitation_id is distinct from p_exclude_invitation_id
  ) as occupant;

  if occupied_count >= event_record.capacity then
    return 'capacity';
  end if;

  if not event_record.gender_balance_enabled then
    return null;
  end if;

  member_gender := public.event_member_binary_gender(p_member_id);
  if member_gender is null or member_gender not in ('female', 'male') then
    return null;
  end if;

  select
    count(*) filter (where public.event_member_binary_gender(occupant.member_id) = 'female'),
    count(*) filter (where public.event_member_binary_gender(occupant.member_id) = 'male')
  into female_count, male_count
  from (
    select invitations.member_id, invitations.id as invitation_id
    from public.event_invitations as invitations
    where invitations.event_id = p_event_id
      and invitations.seat_status = 'confirmed'
      and invitations.id is distinct from p_exclude_invitation_id
    union all
    select holds.member_id, holds.invitation_id
    from public.event_seat_holds as holds
    where holds.event_id = p_event_id
      and holds.status = 'active'
      and holds.expires_at > now()
      and holds.invitation_id is distinct from p_exclude_invitation_id
  ) as occupant;

  select exists (
    select 1
    from public.event_invitations as invitations
    where invitations.event_id = p_event_id
      and invitations.id is distinct from p_exclude_invitation_id
      and invitations.response_status = 'accepted'
      and invitations.seat_status = 'waitlisted'
      and invitations.waitlist_reason = 'balance'
      and invitations.payment_status in ('not_required', 'paid')
      and public.event_member_binary_gender(invitations.member_id) = case
        when member_gender = 'female' then 'male'
        else 'female'
      end
      and public.event_invitation_has_credit_debit(
        invitations.id,
        invitations.member_id
      )
  ) into eligible_opposite_waiter_exists;

  if public.event_gender_balance_requires_waitlist(
    member_gender,
    female_count,
    male_count,
    event_record.capacity,
    eligible_opposite_waiter_exists
  ) then
    return 'balance';
  end if;

  return null;
end;
$$;

revoke all on function public.event_seat_waitlist_reason(uuid, uuid, uuid)
  from public, anon, authenticated;
