-- TEMPORARY backend-only Google Pay diagnostics for sandbox OR_BIBED_06 investigation.
create table public.google_pay_diagnostic_events (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete cascade,
  event_type text not null check (event_type in ('hook_installed', 'load_payment_data_rejection', 'gpay_message_error', 'hook_unavailable')),
  error_name text check (error_name is null or char_length(error_name) <= 500),
  error_status_code text check (error_status_code is null or char_length(error_status_code) <= 500),
  error_status_message text check (error_status_message is null or char_length(error_status_message) <= 500),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  request_snapshot jsonb check (
    request_snapshot is null
    or (jsonb_typeof(request_snapshot) = 'object' and octet_length(request_snapshot::text) <= 4096)
  ),
  created_at timestamptz not null default now()
);

create index google_pay_diagnostic_events_donation_created_idx
  on public.google_pay_diagnostic_events (donation_id, created_at desc);

alter table public.google_pay_diagnostic_events enable row level security;
revoke all on table public.google_pay_diagnostic_events from public, anon, authenticated;
grant select, insert on table public.google_pay_diagnostic_events to service_role;

create or replace function public.insert_google_pay_diagnostic_event(
  p_donation_id uuid,
  p_event_type text,
  p_error_name text,
  p_error_status_code text,
  p_error_status_message text,
  p_error_message text,
  p_request_snapshot jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Serialize the count and insert for this donation so concurrent reports cannot exceed ten.
  perform pg_advisory_xact_lock(hashtextextended(p_donation_id::text, 0));
  if (select count(*) from public.google_pay_diagnostic_events where donation_id = p_donation_id) >= 10 then
    return false;
  end if;

  insert into public.google_pay_diagnostic_events (
    donation_id, event_type, error_name, error_status_code,
    error_status_message, error_message, request_snapshot
  ) values (
    p_donation_id, p_event_type, p_error_name, p_error_status_code,
    p_error_status_message, p_error_message, p_request_snapshot
  );
  return true;
end;
$$;

revoke all on function public.insert_google_pay_diagnostic_event(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.insert_google_pay_diagnostic_event(uuid, text, text, text, text, text, jsonb) to service_role;
