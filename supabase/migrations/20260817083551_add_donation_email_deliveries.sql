create type public.donation_email_notification_type as enum ('donation_confirmation');
create type public.donation_email_delivery_status as enum ('pending', 'sending', 'sent', 'failed');

create table public.donation_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete cascade,
  notification_type public.donation_email_notification_type not null default 'donation_confirmation',
  status public.donation_email_delivery_status not null default 'pending',
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 255),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (donation_id, notification_type),
  constraint sent_delivery_is_complete check (
    (status = 'sent' and sent_at is not null and provider_message_id is not null)
    or (status <> 'sent' and sent_at is null)
  )
);

create index donation_email_deliveries_ready_idx
  on public.donation_email_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.donation_email_deliveries enable row level security;
revoke all on public.donation_email_deliveries from public, anon, authenticated;
grant select, update on public.donation_email_deliveries to service_role;

create trigger set_donation_email_deliveries_updated_at
  before update on public.donation_email_deliveries
  for each row execute function private.set_updated_at();

create or replace function private.enqueue_donation_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'succeeded'
     and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
    insert into public.donation_email_deliveries (donation_id)
    values (new.id)
    on conflict (donation_id, notification_type) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_donation_confirmation() from public, anon, authenticated;

create trigger enqueue_donation_confirmation_after_success
  after insert or update of status on public.donations
  for each row execute function private.enqueue_donation_confirmation();

create or replace function public.claim_donation_email_deliveries(batch_size integer default 25)
returns table (
  id uuid,
  donation_id uuid,
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
  returning delivery.id, delivery.donation_id, delivery.notification_type, delivery.attempt_count;
$$;

revoke all on function public.claim_donation_email_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_donation_email_deliveries(integer) to service_role;

select cron.schedule(
  'missionpay-donation-confirmation-emails',
  '* * * * *',
  $missionpay$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'missionpay_project_url'
      ) || '/functions/v1/process-donation-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'missionpay_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $missionpay$
);
