alter table public.events
  add column if not exists language_code text;

alter table public.events
  drop constraint if exists events_language_code_check;

alter table public.events
  add constraint events_language_code_check
    check (language_code is null or language_code in ('en', 'es'));

comment on column public.events.language_code is
  'Primary spoken language for the event, stored as a supported two-letter locale code.';

update public.events
set
  language_code = 'en',
  updated_at = now()
where id = 'ee3f49df-bc07-4e47-92f2-90ee4a9c9e10';
