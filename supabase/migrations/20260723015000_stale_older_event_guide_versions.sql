update public.event_materials
set stale_at = now(), updated_at = now()
where kind = 'event_guide'
  and coalesce(source_snapshot ->> 'guideVersion', '') <> '1.2.9'
  and stale_at is null;
