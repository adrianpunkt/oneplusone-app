-- Keep decline state and its operations follow-up item in one transaction.
create table if not exists public.event_invitation_declines (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  reason text not null,
  details text,
  follow_up_status text not null default 'new',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint event_invitation_declines_reason_check check (
    reason in (
      'schedule',
      'location',
      'event_fit',
      'other_commitment',
      'prefer_not_to_say'
    )
  ),
  constraint event_invitation_declines_details_check check (
    details is null or char_length(details) <= 500
  ),
  constraint event_invitation_declines_follow_up_status_check check (
    follow_up_status in ('new', 'reviewed', 'resolved')
  )
);

comment on table public.event_invitation_declines is
  'Operations follow-up queue for members who cannot attend an invitation.';

create index if not exists event_invitation_declines_follow_up_idx
  on public.event_invitation_declines (follow_up_status, created_at desc);

create index if not exists event_invitation_declines_invitation_idx
  on public.event_invitation_declines (invitation_id, created_at desc);

alter table public.event_invitation_declines enable row level security;

revoke all on table public.event_invitation_declines
  from public, anon, authenticated;
grant all on table public.event_invitation_declines to service_role;

create or replace function public.decline_event_invitation(
  p_invitation_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  invitation_record public.event_invitations%rowtype;
  normalized_reason text := lower(btrim(coalesce(p_reason, '')));
  normalized_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  if normalized_reason not in (
    'schedule',
    'location',
    'event_fit',
    'other_commitment',
    'prefer_not_to_say'
  ) then
    raise exception 'Choose a reason before declining this invitation.'
      using errcode = '22023';
  end if;

  if char_length(normalized_details) > 500 then
    raise exception 'Decline details must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  select *
    into invitation_record
  from public.event_invitations
  where id = p_invitation_id
    and event_invitations.member_id = current_member_id_value
  for update;

  if invitation_record.id is null then
    raise exception 'Invitation was not found.'
      using errcode = 'P0002';
  end if;

  if invitation_record.confirmed_at is not null
    or invitation_record.status not in ('invited', 'waitlisted') then
    raise exception 'This invitation can no longer be declined.'
      using errcode = '22023';
  end if;

  update public.event_invitations
    set cancelled_at = null,
        responded_at = now(),
        status = 'declined',
        updated_at = now()
  where id = invitation_record.id;

  insert into public.event_invitation_declines (
    invitation_id,
    event_id,
    member_id,
    reason,
    details
  )
  values (
    invitation_record.id,
    invitation_record.event_id,
    current_member_id_value,
    normalized_reason,
    normalized_details
  );

  return jsonb_build_object(
    'ok', true,
    'invitationId', invitation_record.id,
    'eventId', invitation_record.event_id,
    'status', 'declined'
  );
end;
$$;

revoke all on function public.decline_event_invitation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.decline_event_invitation(uuid, text, text)
  to authenticated;
