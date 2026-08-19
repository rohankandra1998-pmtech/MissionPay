alter type public.donation_email_notification_type add value if not exists 'refund_requested';
alter type public.donation_email_notification_type add value if not exists 'refund_approved';
alter type public.donation_email_notification_type add value if not exists 'refund_declined';
alter type public.donation_email_notification_type add value if not exists 'refund_completed';
alter type public.donation_email_notification_type add value if not exists 'recurring_cancelled';

alter table public.donation_email_deliveries
  alter column donation_id drop not null,
  add column recurring_donation_id uuid references public.recurring_donations(id) on delete cascade;

alter table public.donation_email_deliveries
  drop constraint donation_email_deliveries_donation_id_notification_type_key,
  add constraint donation_email_delivery_scope_matches_type check (
    (
      notification_type::text in (
        'donation_confirmation',
        'refund_requested',
        'refund_approved',
        'refund_declined',
        'refund_completed'
      )
      and donation_id is not null
      and recurring_donation_id is null
    )
    or (
      notification_type::text = 'recurring_cancelled'
      and donation_id is null
      and recurring_donation_id is not null
    )
  );

create unique index donation_email_deliveries_donation_type_unique
  on public.donation_email_deliveries (donation_id, notification_type)
  where donation_id is not null and recurring_donation_id is null;

create unique index donation_email_deliveries_recurring_type_unique
  on public.donation_email_deliveries (recurring_donation_id, notification_type)
  where recurring_donation_id is not null and donation_id is null;

create or replace function private.enqueue_donation_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'succeeded'
     and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
    insert into public.donation_email_deliveries (donation_id, notification_type)
    values (new.id, 'donation_confirmation')
    on conflict (donation_id, notification_type)
      where donation_id is not null and recurring_donation_id is null
      do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.enqueue_refund_request_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type public.donation_email_notification_type;
begin
  if tg_op = 'INSERT' then
    target_type := 'refund_requested';
  elsif old.status = 'pending' and new.status = 'approved' then
    target_type := 'refund_approved';
  elsif old.status = 'pending' and new.status = 'declined' then
    target_type := 'refund_declined';
  else
    return new;
  end if;

  insert into public.donation_email_deliveries (donation_id, notification_type)
  values (new.donation_id, target_type)
  on conflict (donation_id, notification_type)
    where donation_id is not null and recurring_donation_id is null
    do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_refund_request_email() from public, anon, authenticated;

create trigger enqueue_refund_request_email_after_change
  after insert or update of status on public.refund_requests
  for each row execute function private.enqueue_refund_request_email();

create or replace function private.enqueue_refund_completed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'succeeded'
     and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
    insert into public.donation_email_deliveries (donation_id, notification_type)
    values (new.donation_id, 'refund_completed')
    on conflict (donation_id, notification_type)
      where donation_id is not null and recurring_donation_id is null
      do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_refund_completed_email() from public, anon, authenticated;

create trigger enqueue_refund_completed_email_after_success
  after insert or update of status on public.refunds
  for each row execute function private.enqueue_refund_completed_email();

create or replace function private.enqueue_recurring_cancelled_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    insert into public.donation_email_deliveries (recurring_donation_id, notification_type)
    values (new.id, 'recurring_cancelled')
    on conflict (recurring_donation_id, notification_type)
      where recurring_donation_id is not null and donation_id is null
      do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_recurring_cancelled_email() from public, anon, authenticated;

create trigger enqueue_recurring_cancelled_email_after_cancellation
  after update of status on public.recurring_donations
  for each row execute function private.enqueue_recurring_cancelled_email();

drop function public.claim_donation_email_deliveries(integer);

create function public.claim_donation_email_deliveries(batch_size integer default 25)
returns table (
  id uuid,
  donation_id uuid,
  recurring_donation_id uuid,
  notification_type public.donation_email_notification_type,
  attempt_count smallint
)
language sql
security definer
set search_path = ''
as $$
  with ready as (
    select delivery.id
    from public.donation_email_deliveries as delivery
    where delivery.attempt_count < 5
      and (
        (delivery.status in ('pending', 'failed') and delivery.next_attempt_at <= now())
        or (delivery.status = 'sending' and delivery.updated_at < now() - interval '10 minutes')
      )
    order by delivery.next_attempt_at, delivery.created_at
    for update skip locked
    limit least(greatest(coalesce(batch_size, 25), 1), 25)
  )
  update public.donation_email_deliveries as delivery
  set status = 'sending',
      attempt_count = delivery.attempt_count + 1,
      last_error = null,
      updated_at = now()
  from ready
  where delivery.id = ready.id
  returning delivery.id, delivery.donation_id, delivery.recurring_donation_id,
            delivery.notification_type, delivery.attempt_count;
$$;

revoke all on function public.claim_donation_email_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_donation_email_deliveries(integer) to service_role;
