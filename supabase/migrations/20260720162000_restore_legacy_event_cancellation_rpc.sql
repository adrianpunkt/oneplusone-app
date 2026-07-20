-- Keep the currently deployed member app compatible while the structured
-- cancellation form rolls out. New clients use the three-argument overload;
-- legacy clients record the generic member-facing reason.

create or replace function public.cancel_event_confirmation(
  p_invitation_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.cancel_event_confirmation(
    p_invitation_id,
    'something_else',
    null::text
  );
$$;

revoke all on function public.cancel_event_confirmation(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_event_confirmation(uuid)
  to authenticated;
