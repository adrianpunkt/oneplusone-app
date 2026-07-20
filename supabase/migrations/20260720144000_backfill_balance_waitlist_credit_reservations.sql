-- Bring any balance-waitlist positions accepted before the rule was deployed
-- onto the same ledger contract. Pending/unpaid and non-balance waitlists are
-- deliberately excluded.

do $backfill$
declare
  invitation_record record;
begin
  for invitation_record in
    select invitations.id,
      invitations.member_id,
      events.credit_cost
    from public.event_invitations as invitations
    join public.events as events on events.id = invitations.event_id
    where invitations.response_status = 'accepted'
      and invitations.seat_status = 'waitlisted'
      and invitations.waitlist_reason = 'balance'
      and invitations.payment_status in ('not_required', 'paid')
      and not public.event_invitation_has_credit_debit(
        invitations.id,
        invitations.member_id
      )
      and not exists (
        select 1
        from public.credit_ledger_entries as refunds
        where refunds.member_id = invitations.member_id
          and refunds.reason = 'event_balance_waitlist_refund'
          and refunds.source_type = 'event_invitation'
          and refunds.source_id = invitations.id::text
      )
    order by invitations.event_id, invitations.priority_at, invitations.id
  loop
    perform public.grant_member_credit(
      invitation_record.member_id,
      -invitation_record.credit_cost,
      'event_confirmation',
      'event_invitation',
      invitation_record.id::text,
      null,
      'Backfilled reservation for an accepted gender-balance waitlist position.',
      now()
    );
  end loop;
end;
$backfill$;
