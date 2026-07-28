create or replace function public.stale_event_guides_when_host_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.member_id is not distinct from new.member_id then
      return new;
    end if;
  end if;

  update public.event_materials
  set stale_at = now(), updated_at = now()
  where event_id = new.event_id
    and kind = 'event_guide'
    and stale_at is null;

  return new;
end;
$$;

revoke all on function public.stale_event_guides_when_host_changes() from public;

drop trigger if exists stale_event_guides_when_host_changes on public.event_hosts;
create trigger stale_event_guides_when_host_changes
after insert or update of member_id on public.event_hosts
for each row execute function public.stale_event_guides_when_host_changes();
