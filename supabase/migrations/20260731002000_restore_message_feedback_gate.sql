-- Keep incoming messages locked until the recipient submits attended=true
-- feedback. The member app now renders an explicit feedback-required state
-- instead of treating this valid, locked conversation as not found.
--
-- The preceding migration introduced this internal exception helper. Replacing
-- it with a constant false restores the feedback gate in both conversation RLS
-- and send_message without reopening attendee discovery or direct table access.

create or replace function public.member_can_access_received_conversation(
  p_member_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

revoke all on function public.member_can_access_received_conversation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.member_can_access_received_conversation(uuid, uuid)
  to service_role;
