-- Supabase installs this SECURITY DEFINER function for the ensure_rls event
-- trigger. The trigger does not require browser roles to call it as an RPC.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;
