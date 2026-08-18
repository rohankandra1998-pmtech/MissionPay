-- Edge Functions use the service_role to perform backend-authoritative payment work.
-- RLS bypass does not replace the underlying table privileges required by PostgREST.
grant usage on schema public to service_role;

grant select on table
  public.fundraisers,
  public.campaigns
to service_role;

grant select, insert, update on table
  public.donors,
  public.donations,
  public.recurring_donations,
  public.payment_attempts,
  public.payment_events
to service_role;
