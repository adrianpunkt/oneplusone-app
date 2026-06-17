alter table public.members
  add column if not exists preferred_locale text;

alter table public.members
  drop constraint if exists members_preferred_locale_check;

alter table public.members
  add constraint members_preferred_locale_check
    check (preferred_locale is null or preferred_locale in ('en', 'es'));

alter table public.credit_products
  add column if not exists localized_content jsonb not null default '{}'::jsonb;

alter table public.events
  add column if not exists localized_content jsonb not null default '{}'::jsonb;

alter table public.notifications
  add column if not exists localized_content jsonb not null default '{}'::jsonb;

update public.credit_products
set
  localized_content = jsonb_build_object(
    'es',
    jsonb_build_object(
      'name', case credits
        when 1 then '1 crédito'
        else credits::text || ' créditos'
      end,
      'description', case credits
        when 1 then 'Una plaza en una cena o brunch.'
        when 3 then 'Tres eventos con un pequeño descuento de pack.'
        when 5 then 'Cinco eventos para miembros que quieren seguir viniendo.'
        else coalesce(description, '')
      end
    )
  ),
  updated_at = now()
where id in (
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555'
);

update public.notifications
set localized_content = jsonb_build_object(
  'es',
  jsonb_build_object(
    'title', 'Nuevo mensaje',
    'body', 'Alguien de tu mesa te ha escrito.'
  )
)
where type = 'message'
  and coalesce(localized_content, '{}'::jsonb) = '{}'::jsonb;

create or replace function public.effective_member_locale(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select members.preferred_locale
      from public.members
      where members.id = p_member_id
        and members.preferred_locale in ('en', 'es')
      limit 1
    ),
    (
      select profile_registrations.locale
      from public.members
      join public.profile_registrations
        on profile_registrations.contact_email_norm = members.email_norm
       and profile_registrations.status = 'submitted'
      where members.id = p_member_id
        and profile_registrations.locale in ('en', 'es')
      order by profile_registrations.submitted_at desc nulls last,
               profile_registrations.updated_at desc
      limit 1
    ),
    'en'
  );
$$;

create or replace function public.set_current_member_locale(p_locale text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  clean_locale text := lower(nullif(btrim(p_locale), ''));
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  if clean_locale not in ('en', 'es') then
    raise exception 'Unsupported locale.'
      using errcode = '22023';
  end if;

  update public.members
    set preferred_locale = clean_locale,
        updated_at = now()
  where id = current_member_id_value;

  return clean_locale;
end;
$$;

create or replace function public.claim_profile_registration_for_current_email()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email_norm text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  target_registration_id uuid;
  target_user_id uuid;
  target_locale text;
begin
  if current_user_id is null or current_email_norm is null then
    raise exception 'Authenticated email is required to claim a story registration.'
      using errcode = '28000';
  end if;

  select id, user_id, locale
    into target_registration_id, target_user_id, target_locale
  from public.profile_registrations
  where contact_email_norm = current_email_norm
    and status = 'submitted'
  order by submitted_at desc nulls last, updated_at desc
  limit 1
  for update;

  if target_registration_id is null then
    raise exception 'No submitted story registration exists for the authenticated email.'
      using errcode = 'P0002';
  end if;

  if target_user_id = current_user_id then
    update public.members
      set preferred_locale = coalesce(preferred_locale, target_locale),
          updated_at = case when preferred_locale is null then now() else updated_at end
    where user_id = current_user_id
      and target_locale in ('en', 'es');

    return target_registration_id;
  end if;

  if exists (
    select 1
    from public.profile_registrations
    where user_id = current_user_id
      and id <> target_registration_id
      and status = 'submitted'
  ) then
    raise exception 'The authenticated user already owns a submitted story registration.'
      using errcode = '23505';
  end if;

  delete from public.profile_registrations
  where user_id = current_user_id
    and status = 'started';

  update public.profile_registrations
    set user_id = current_user_id,
        last_seen_at = now(),
        updated_at = now()
  where id = target_registration_id
  returning id into target_registration_id;

  update public.members
    set preferred_locale = coalesce(preferred_locale, target_locale),
        updated_at = case when preferred_locale is null then now() else updated_at end
  where user_id = current_user_id
    and target_locale in ('en', 'es');

  return target_registration_id;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id_value uuid := public.current_member_id();
  clean_body text := nullif(btrim(p_body), '');
  conversation_record public.conversations%rowtype;
  recipient_id uuid;
  message_id uuid;
begin
  if current_member_id_value is null then
    raise exception 'Member account is required.'
      using errcode = '28000';
  end if;

  if clean_body is null or length(clean_body) > 2000 then
    raise exception 'Write a message between 1 and 2000 characters.'
      using errcode = '22023';
  end if;

  select *
    into conversation_record
  from public.conversations
  where id = p_conversation_id
    and exists (
      select 1
      from public.conversation_participants
      where conversation_participants.conversation_id = conversations.id
        and conversation_participants.member_id = current_member_id_value
    )
  for update;

  if conversation_record.id is null then
    raise exception 'Conversation was not found.'
      using errcode = 'P0002';
  end if;

  if conversation_record.status = 'closed' then
    raise exception 'This conversation is closed.'
      using errcode = '22023';
  end if;

  if conversation_record.status = 'pending' then
    if conversation_record.initiated_by_member_id = current_member_id_value then
      if exists (
        select 1
        from public.messages
        where conversation_id = conversation_record.id
          and sender_member_id = current_member_id_value
          and deleted_at is null
      ) then
        raise exception 'You can send one first message. If they reply, the conversation opens.'
          using errcode = '22023';
      end if;
    else
      update public.conversations
        set status = 'open',
            updated_at = now()
      where id = conversation_record.id;
      conversation_record.status := 'open';
    end if;
  end if;

  insert into public.messages (
    conversation_id,
    sender_member_id,
    body,
    created_at
  )
  values (
    conversation_record.id,
    current_member_id_value,
    clean_body,
    now()
  )
  returning id into message_id;

  update public.conversations
    set updated_at = now()
  where id = conversation_record.id;

  recipient_id := case
    when conversation_record.initiated_by_member_id = current_member_id_value
      then conversation_record.recipient_member_id
    else conversation_record.initiated_by_member_id
  end;

  insert into public.notifications (
    member_id,
    type,
    title,
    body,
    href,
    localized_content,
    created_at
  )
  values (
    recipient_id,
    'message',
    'New message',
    'Someone from your table wrote to you.',
    '/messages/' || conversation_record.id::text,
    jsonb_build_object(
      'es',
      jsonb_build_object(
        'title', 'Nuevo mensaje',
        'body', 'Alguien de tu mesa te ha escrito.'
      )
    ),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'conversationId', conversation_record.id,
    'messageId', message_id,
    'status', conversation_record.status
  );
end;
$$;

revoke all on function public.effective_member_locale(uuid) from public, anon, authenticated;
revoke all on function public.set_current_member_locale(text) from public, anon, authenticated;
revoke all on function public.claim_profile_registration_for_current_email() from public;
revoke all on function public.send_message(uuid, text) from public, anon, authenticated;

grant execute on function public.effective_member_locale(uuid) to authenticated, service_role;
grant execute on function public.set_current_member_locale(text) to authenticated;
grant execute on function public.claim_profile_registration_for_current_email() to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
