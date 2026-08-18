alter table public.payment_attempts
  add column failure_reason text
  check (
    failure_reason is null or failure_reason in (
      'insufficient_funds',
      'card_declined',
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
