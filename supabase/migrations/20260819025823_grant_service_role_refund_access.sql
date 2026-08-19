-- Refund Edge Functions perform backend-authoritative work through service_role.
-- RLS bypass does not replace the underlying table privileges required by PostgREST.
grant select on table
  public.platform_admins
to service_role;

grant select, insert, update on table
  public.refund_requests,
  public.refunds
to service_role;
