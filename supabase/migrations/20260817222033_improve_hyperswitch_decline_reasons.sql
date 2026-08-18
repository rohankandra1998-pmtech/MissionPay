alter table public.payment_attempts
  drop constraint if exists payment_attempts_failure_reason_check;

alter table public.payment_attempts
  add constraint payment_attempts_failure_reason_check
  check (
    failure_reason is null or failure_reason in (
      'insufficient_funds',
      'card_declined',
      'lost_card',
      'stolen_card',
      'card_unavailable',
      'authentication_failed',
      'invalid_cvv',
      'expired_card',
      'invalid_card',
      'payment_cancelled',
      'session_expired',
      'technical_error',
      'unknown'
    )
  );

alter table public.payment_attempts
  add column failure_enrichment_attempted_at timestamptz;
