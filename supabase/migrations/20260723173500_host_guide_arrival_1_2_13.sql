update public.event_materials
set stale_at = now(), updated_at = now()
where kind = 'event_guide'
  and coalesce(source_snapshot ->> 'guideVersion', '') <> '1.2.13'
  and stale_at is null;

create or replace function public.set_host_package_arrival_minutes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email_type = 'host_package' then
    new.payload := jsonb_set(
      coalesce(new.payload, '{}'::jsonb),
      '{arriveEarlyMinutes}',
      '5'::jsonb,
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists set_host_package_arrival_minutes
  on public.event_email_deliveries;

create trigger set_host_package_arrival_minutes
before insert or update of email_type, payload
on public.event_email_deliveries
for each row
execute function public.set_host_package_arrival_minutes();
