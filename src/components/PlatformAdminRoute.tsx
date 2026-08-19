import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { LoadingState } from "./States";

export function PlatformAdminRoute() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const verify = async () => {
      if (!user) return;
      const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      if (active) setAllowed(Boolean(data));
    };
    void verify();
    return () => { active = false; };
  }, [user?.id]);
  if (allowed === null) return <main className="chapter container"><LoadingState label="Verifying platform admin access" /></main>;
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
