-- Tokenized email links update the same event-invitation preference used by
-- the member app. The preceding preference migration cancels queued delivery
-- rows and prevents new invitations while this preference is disabled.

create or replace function public.unsubscribe_pending_event_invitations(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_record public.event_invitation_access_tokens%rowtype;
  invitation_record public.event_invitations%rowtype;
begin
  if nullif(btrim(p_token), '') is null or length(p_token) > 512 then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into token_record
  from public.event_invitation_access_tokens
  where token_hash = public.hash_payment_resume_secret(p_token)
  limit 1;

  if token_record.id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  select * into invitation_record
  from public.event_invitations
  where id = token_record.invitation_id;

  if invitation_record.id is null
    or invitation_record.member_status_at_invite <> 'pending' then
    return jsonb_build_object('ok', false, 'status', 'invalid');
  end if;

  insert into public.member_event_preferences (
    member_id,
    receives_event_invitations,
    updated_at
  ) values (
    invitation_record.member_id,
    false,
    now()
  )
  on conflict (member_id) do update
  set receives_event_invitations = false,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'status', 'unsubscribed',
    'locale', public.effective_member_locale(invitation_record.member_id)
  );
end;
$$;

revoke all on function public.unsubscribe_pending_event_invitations(text)
  from public, anon, authenticated;
grant execute on function public.unsubscribe_pending_event_invitations(text)
  to service_role;
