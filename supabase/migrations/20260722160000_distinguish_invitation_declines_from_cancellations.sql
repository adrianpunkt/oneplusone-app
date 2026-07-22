-- Keep invitation declines distinct from cancellations made after applying for
-- a seat. The legacy cancellation_received type remains accepted so failed
-- historical deliveries can still be retried during a rolling deployment.

alter table public.event_email_deliveries
  drop constraint if exists event_email_deliveries_type_check;

alter table public.event_email_deliveries
  add constraint event_email_deliveries_type_check check (email_type in (
    'invitation_member', 'invitation_pending', 'seat_confirmed',
    'waitlist_capacity', 'waitlist_balance', 'waitlist_balance_released',
    'invitation_declined', 'cancellation_received',
    'reservation_cancellation_received', 'rsvp_reminder', 'rsvp_last_call',
    'event_confirmed', 'event_cancelled', 'host_package', 'event_reminder',
    'replacement_refund', 'no_replacement', 'feedback_request', 'credit_offer'
  )) not valid;

create or replace function public.normalize_event_email_delivery_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email_type = 'cancellation_received' then
    new.email_type := case
      when coalesce(new.payload, '{}'::jsonb) ? 'cancellationId'
        then 'reservation_cancellation_received'
      else 'invitation_declined'
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_event_email_delivery_type()
  from public, anon, authenticated;

drop trigger if exists normalize_event_email_delivery_type
  on public.event_email_deliveries;

create trigger normalize_event_email_delivery_type
before insert or update of email_type, payload
on public.event_email_deliveries
for each row
execute function public.normalize_event_email_delivery_type();

update public.event_email_deliveries
set email_type = case
      when coalesce(payload, '{}'::jsonb) ? 'cancellationId'
        then 'reservation_cancellation_received'
      else 'invitation_declined'
    end,
    updated_at = now()
where email_type = 'cancellation_received';

alter table public.event_email_deliveries
  validate constraint event_email_deliveries_type_check;

notify pgrst, 'reload schema';
