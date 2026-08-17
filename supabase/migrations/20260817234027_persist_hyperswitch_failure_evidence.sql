alter table public.payment_attempts
  add column provider_failure_snapshot jsonb,
  add column failure_enrichment_claimed_at timestamptz;

comment on column public.payment_attempts.provider_failure_snapshot is
  'Backend-only allowlisted Hyperswitch failure evidence used for normalization.';

comment on column public.payment_attempts.failure_enrichment_claimed_at is
  'Short-lived lease for one-time terminal failure enrichment; cleared on completion or failure.';

-- RLS protects rows, not columns. Replace the existing table-wide authenticated
-- SELECT grant so the backend-only provider snapshot and provider diagnostics
-- cannot be selected through the Data API.
revoke select on table public.payment_attempts from authenticated;

grant select (
  id,
  donation_id,
  attempt_number,
  status,
  created_at,
  updated_at,
  failure_reason
) on table public.payment_attempts to authenticated;
