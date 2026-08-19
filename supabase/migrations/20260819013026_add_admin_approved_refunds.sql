create type public.refund_request_reason as enum ('incorrect_amount', 'duplicate', 'unauthorized', 'other');
create type public.refund_request_status as enum ('pending', 'approved', 'declined');
create type public.refund_status as enum ('initiating', 'pending', 'review', 'succeeded', 'failed');

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references public.donations(id),
  reason public.refund_request_reason not null,
  details text check (details is null or char_length(details) <= 500),
  status public.refund_request_status not null default 'pending',
  reviewed_by uuid references public.platform_admins(user_id),
  reviewed_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refund_request_review_state check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'declined') and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint refund_other_requires_details check (reason <> 'other' or char_length(trim(coalesce(details, ''))) between 2 and 500)
);

create table public.refunds (
  id uuid primary key,
  refund_request_id uuid not null unique references public.refund_requests(id),
  donation_id uuid not null unique references public.donations(id),
  hyperswitch_refund_id text not null unique check (hyperswitch_refund_id ~ '^ref_[A-Za-z0-9_-]{26,60}$'),
  hyperswitch_payment_id text not null,
  amount_cents bigint not null check (amount_cents between 100 and 1000000),
  currency text not null check (currency = 'USD'),
  provider_reason text not null check (provider_reason in ('duplicate', 'fraudulent', 'requested_by_customer')),
  status public.refund_status not null default 'initiating',
  provider_updated_at timestamptz,
  execution_claimed_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint refund_completion_state check ((status = 'succeeded') = (completed_at is not null))
);

alter table public.payment_events
  add column refund_id uuid references public.refunds(id);

create index refund_requests_status_created_idx on public.refund_requests (status, created_at desc);
create index refunds_status_updated_idx on public.refunds (status, updated_at desc);
create index payment_events_refund_idx on public.payment_events (refund_id, created_at desc) where refund_id is not null;

create trigger set_refund_requests_updated_at before update on public.refund_requests
  for each row execute function private.set_updated_at();
create trigger set_refunds_updated_at before update on public.refunds
  for each row execute function private.set_updated_at();

create or replace function private.validate_refund_integrity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  request_donation_id uuid;
  request_status public.refund_request_status;
  source_donation public.donations%rowtype;
begin
  select donation_id, status into request_donation_id, request_status
  from public.refund_requests
  where id = new.refund_request_id;

  select * into source_donation
  from public.donations
  where id = new.donation_id;

  if request_donation_id is null or source_donation.id is null
     or request_donation_id <> new.donation_id
     or source_donation.amount_cents <> new.amount_cents
     or source_donation.currency <> new.currency
     or source_donation.hyperswitch_payment_id is null
     or source_donation.hyperswitch_payment_id <> new.hyperswitch_payment_id then
    raise exception 'refund_source_mismatch' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and (request_status <> 'approved' or source_donation.status not in ('succeeded', 'refunded')) then
    raise exception 'refund_source_not_approved' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and (
    new.refund_request_id <> old.refund_request_id
    or new.donation_id <> old.donation_id
    or new.hyperswitch_refund_id <> old.hyperswitch_refund_id
    or new.hyperswitch_payment_id <> old.hyperswitch_payment_id
    or new.amount_cents <> old.amount_cents
    or new.currency <> old.currency
    or new.provider_reason <> old.provider_reason
  ) then
    raise exception 'refund_identity_is_immutable' using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function private.validate_refund_integrity() from public, anon, authenticated;
create trigger validate_refund_integrity before insert or update on public.refunds
  for each row execute function private.validate_refund_integrity();

alter table public.platform_admins enable row level security;
alter table public.refund_requests enable row level security;
alter table public.refunds enable row level security;

create policy "users read their own platform admin membership"
  on public.platform_admins for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "platform admins read refund requests"
  on public.refund_requests for select to authenticated
  using (exists (
    select 1 from public.platform_admins a where a.user_id = (select auth.uid())
  ));

create policy "platform admins read refunds"
  on public.refunds for select to authenticated
  using (exists (
    select 1 from public.platform_admins a where a.user_id = (select auth.uid())
  ));

grant select on public.platform_admins, public.refund_requests, public.refunds to authenticated;
revoke insert, update, delete on public.platform_admins, public.refund_requests, public.refunds from anon, authenticated;
