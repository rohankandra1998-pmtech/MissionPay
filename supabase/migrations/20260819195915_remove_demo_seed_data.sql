-- Remove only the deterministic demo dataset created by the initial migration.
-- Dependent payment and refund records must be removed before their donations
-- because those foreign keys intentionally do not cascade.

delete from public.payment_events as event
where exists (
  select 1
  from public.payment_attempts as attempt
  join public.donations as donation on donation.id = attempt.donation_id
  where attempt.id = event.payment_attempt_id
    and donation.campaign_id in (
      '20000000-0000-4000-8000-000000000001'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      '20000000-0000-4000-8000-000000000003'::uuid,
      '20000000-0000-4000-8000-000000000004'::uuid,
      '20000000-0000-4000-8000-000000000005'::uuid
    )
)
or exists (
  select 1
  from public.refunds as refund
  join public.donations as donation on donation.id = refund.donation_id
  where refund.id = event.refund_id
    and donation.campaign_id in (
      '20000000-0000-4000-8000-000000000001'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      '20000000-0000-4000-8000-000000000003'::uuid,
      '20000000-0000-4000-8000-000000000004'::uuid,
      '20000000-0000-4000-8000-000000000005'::uuid
    )
);

delete from public.refunds as refund
using public.donations as donation
where refund.donation_id = donation.id
  and donation.campaign_id in (
    '20000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000003'::uuid,
    '20000000-0000-4000-8000-000000000004'::uuid,
    '20000000-0000-4000-8000-000000000005'::uuid
  );

delete from public.refund_requests as request
using public.donations as donation
where request.donation_id = donation.id
  and donation.campaign_id in (
    '20000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000003'::uuid,
    '20000000-0000-4000-8000-000000000004'::uuid,
    '20000000-0000-4000-8000-000000000005'::uuid
  );

delete from public.payment_attempts as attempt
using public.donations as donation
where attempt.donation_id = donation.id
  and donation.campaign_id in (
    '20000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000003'::uuid,
    '20000000-0000-4000-8000-000000000004'::uuid,
    '20000000-0000-4000-8000-000000000005'::uuid
  );

delete from public.donation_email_deliveries as delivery
where exists (
  select 1
  from public.donations as donation
  where donation.id = delivery.donation_id
    and donation.campaign_id in (
      '20000000-0000-4000-8000-000000000001'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      '20000000-0000-4000-8000-000000000003'::uuid,
      '20000000-0000-4000-8000-000000000004'::uuid,
      '20000000-0000-4000-8000-000000000005'::uuid
    )
)
or exists (
  select 1
  from public.recurring_donations as recurring
  where recurring.id = delivery.recurring_donation_id
    and recurring.campaign_id in (
      '20000000-0000-4000-8000-000000000001'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      '20000000-0000-4000-8000-000000000003'::uuid,
      '20000000-0000-4000-8000-000000000004'::uuid,
      '20000000-0000-4000-8000-000000000005'::uuid
    )
);

delete from public.google_pay_diagnostic_events as diagnostic
using public.donations as donation
where diagnostic.donation_id = donation.id
  and donation.campaign_id in (
    '20000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000003'::uuid,
    '20000000-0000-4000-8000-000000000004'::uuid,
    '20000000-0000-4000-8000-000000000005'::uuid
  );

delete from public.public_supporter_activity
where campaign_id in (
  '20000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000002'::uuid,
  '20000000-0000-4000-8000-000000000003'::uuid,
  '20000000-0000-4000-8000-000000000004'::uuid,
  '20000000-0000-4000-8000-000000000005'::uuid
);

delete from public.donations
where campaign_id in (
  '20000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000002'::uuid,
  '20000000-0000-4000-8000-000000000003'::uuid,
  '20000000-0000-4000-8000-000000000004'::uuid,
  '20000000-0000-4000-8000-000000000005'::uuid
);

delete from public.recurring_donations
where campaign_id in (
  '20000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000002'::uuid,
  '20000000-0000-4000-8000-000000000003'::uuid,
  '20000000-0000-4000-8000-000000000004'::uuid,
  '20000000-0000-4000-8000-000000000005'::uuid
);

delete from public.campaign_metrics
where campaign_id in (
  '20000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000002'::uuid,
  '20000000-0000-4000-8000-000000000003'::uuid,
  '20000000-0000-4000-8000-000000000004'::uuid,
  '20000000-0000-4000-8000-000000000005'::uuid
);

delete from public.campaigns
where fundraiser_id = '10000000-0000-4000-8000-000000000001'::uuid
  and id in (
    '20000000-0000-4000-8000-000000000001'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000003'::uuid,
    '20000000-0000-4000-8000-000000000004'::uuid,
    '20000000-0000-4000-8000-000000000005'::uuid
  );

-- These are the exact name/email pairs generated by generate_series(1, 213)
-- in the initial migration. Preserve any donor that still has other activity.
delete from public.donors as donor
where (donor.name, donor.email) in (
  select
    'Supporter ' || seed_number,
    'supporter' || seed_number || '@missionpay.demo'
  from generate_series(1, 213) as seed(seed_number)
)
and not exists (
  select 1 from public.donations as donation where donation.donor_id = donor.id
)
and not exists (
  select 1 from public.recurring_donations as recurring where recurring.donor_id = donor.id
);

delete from public.fundraisers
where id = '10000000-0000-4000-8000-000000000001'::uuid
  and user_id is null
  and display_name = 'Maya Okafor'
  and organization_name = 'Waterline Collective';
