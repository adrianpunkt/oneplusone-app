-- Let the recipient privately archive an unanswered first message.
-- Archiving is participant-specific: the sender receives no notification and
-- their conversation state is not changed.

alter table public.conversation_participants
  add column if not exists archived_at timestamptz;

comment on column public.conversation_participants.archived_at is
  'When set, hides this conversation from the member''s active message list.';

create index if not exists conversation_participants_member_archived_idx
  on public.conversation_participants (member_id, archived_at, conversation_id);

create or replace function public.archive_unanswered_conversation(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_active_member_id();
  conversation_record public.conversations%rowtype;
  initial_message_record public.messages%rowtype;
  message_count_value integer;
  archived_at_value timestamptz := now();
begin
  if current_member_id_value is null then
    raise exception 'Active membership is required.'
      using errcode = '28000';
  end if;

  select *
    into conversation_record
  from public.conversations
  where id = p_conversation_id
    and recipient_member_id = current_member_id_value
  for update;

  if conversation_record.id is null then
    raise exception 'Conversation was not found.'
      using errcode = 'P0002';
  end if;
  if conversation_record.status <> 'pending' then
    raise exception 'Only an unanswered first message can be archived.'
      using errcode = '22023';
  end if;
  if not public.member_attended_past_event(
    current_member_id_value,
    conversation_record.event_id
  ) then
    raise exception 'Messaging opens after your attended event feedback.'
      using errcode = '22023';
  end if;

  select count(*)
    into message_count_value
  from public.messages
  where conversation_id = conversation_record.id;

  if message_count_value <> 1 then
    raise exception 'Only an unanswered first message can be archived.'
      using errcode = '22023';
  end if;

  select *
    into initial_message_record
  from public.messages
  where conversation_id = conversation_record.id
    and sender_member_id = conversation_record.initiated_by_member_id;

  if initial_message_record.id is null then
    raise exception 'Only an unanswered first message can be archived.'
      using errcode = '22023';
  end if;

  update public.conversation_participants
  set
    archived_at = coalesce(archived_at, archived_at_value),
    last_read_at = archived_at_value
  where conversation_id = conversation_record.id
    and member_id = current_member_id_value
  returning archived_at into archived_at_value;

  if not found then
    raise exception 'Conversation was not found.'
      using errcode = 'P0002';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, archived_at_value)
  where member_id = current_member_id_value
    and type = 'message'
    and href = '/messages/' || conversation_record.id::text;

  return jsonb_build_object(
    'ok', true,
    'conversationId', conversation_record.id,
    'archivedAt', archived_at_value
  );
end;
$$;

revoke all on function public.archive_unanswered_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.archive_unanswered_conversation(uuid)
  to authenticated;
grant execute on function public.archive_unanswered_conversation(uuid)
  to service_role;

create or replace function public.reject_archived_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.conversation_participants
    where conversation_id = new.conversation_id
      and member_id = new.sender_member_id
      and archived_at is not null
  ) then
    raise exception 'This conversation is archived.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_archived_conversation_message()
  from public, anon, authenticated;
grant execute on function public.reject_archived_conversation_message()
  to service_role;

drop trigger if exists reject_archived_conversation_message
  on public.messages;
create trigger reject_archived_conversation_message
before insert on public.messages
for each row
execute function public.reject_archived_conversation_message();
