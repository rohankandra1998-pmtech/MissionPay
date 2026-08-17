create index recurring_campaign_idx
  on public.recurring_donations (campaign_id, created_at desc);

create index recurring_donor_idx
  on public.recurring_donations (donor_id, created_at desc);

create policy "Financial events are backend only"
  on public.payment_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

select cron.schedule(
  'missionpay-recurring-billing',
  '15 8 * * *',
  $missionpay$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'missionpay_project_url'
      ) || '/functions/v1/process-recurring-donations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'missionpay_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $missionpay$
);
