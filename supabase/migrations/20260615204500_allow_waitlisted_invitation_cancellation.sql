create or replace function public.cancel_event_confirmation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  invitation_record public.event_invitations%rowtype;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
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

  if invitation_record.status not in ('confirmed', 'waitlisted') then
    raise exception 'Only confirmed or waitlisted invitations can be cancelled here.'
      using errcode = '22023';
  end if;

  update public.event_invitations
    set status = case
          when invitation_record.status = 'waitlisted' then 'declined'
          else 'cancelled'
        end,
        responded_at = case
          when invitation_record.status = 'waitlisted' then coalesce(responded_at, now())
          else responded_at
        end,
        cancelled_at = case
          when invitation_record.status = 'confirmed' then now()
          else cancelled_at
        end,
        updated_at = now()
  where id = invitation_record.id;

  if invitation_record.status = 'confirmed' then
    update public.event_attendees
      set status = 'cancelled',
          updated_at = now()
    where event_id = invitation_record.event_id
      and event_attendees.member_id = current_member_id_value;
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'invitationId',
    invitation_record.id,
    'status',
    case
      when invitation_record.status = 'waitlisted' then 'declined'
      else 'cancelled'
    end
  );
end;
$$;

grant execute on function public.cancel_event_confirmation(uuid) to authenticated;
