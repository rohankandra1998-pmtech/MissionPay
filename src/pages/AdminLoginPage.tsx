import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { LoadingState } from "../components/States";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

type AccessState = "idle" | "checking" | "denied" | "error";

async function verifyAdmin(userId: string): Promise<"admin" | "denied" | "error"> {
  const { data, error } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) return "error";
  return data ? "admin" : "denied";
}

export function AdminLoginPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const credentialFlow = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [access, setAccess] = useState<AccessState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user || credentialFlow.current) return;
    let active = true;
    setAccess("checking");
    void verifyAdmin(user.id).then((result) => {
      if (!active) return;
      if (result === "admin") navigate("/admin/refunds", { replace: true });
      else setAccess(result);
    });
    return () => { active = false; };
  }, [loading, navigate, user?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    credentialFlow.current = true;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      credentialFlow.current = false;
      setMessage("We couldn’t sign you in with those details. Check your email and password.");
      setBusy(false);
      return;
    }

    const result = await verifyAdmin(data.user.id);
    if (result === "admin") {
      navigate("/admin/refunds", { replace: true });
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    credentialFlow.current = false;
    setMessage(result === "denied"
      ? "This account does not have MissionPay Platform Support Admin access."
      : "We’re unable to verify Platform Support Admin access right now. Please try again.");
    setBusy(false);
  };

  const switchAccount = async () => {
    setBusy(true);
    await signOut();
    setAccess("idle");
    setMessage(null);
    setBusy(false);
  };

  if (loading || (user && (access === "idle" || access === "checking"))) {
    return <main className="admin-login-page"><LoadingState label="Verifying Platform Support Admin access" /></main>;
  }

  if (user && (access === "denied" || access === "error")) {
    return <main className="admin-login-page"><section className="admin-login-card admin-login-card--access"><ShieldCheck /><p className="eyebrow">MissionPay Platform Support</p><h1>Platform Support Admin access required</h1><p>Signed in as <strong>{user.email}</strong></p><p className="form-error" role="alert">{access === "denied" ? "This account does not have MissionPay Platform Support Admin access." : "We’re unable to verify Platform Support Admin access right now. Please try again."}</p><div className="admin-login-actions"><Link className="button button--outline" to="/dashboard">Return to fundraiser dashboard</Link><button className="button button--dark" onClick={() => void switchAccount()} disabled={busy}>Sign out and use a Platform Support Admin account</button></div></section></main>;
  }

  return <main className="admin-login-page"><section className="admin-login-card"><div className="admin-login-mark"><ShieldCheck /><span>Internal access</span></div><p className="eyebrow">MissionPay Platform Support</p><h1>Platform Support Admin sign in</h1><p>Sign in with a provisioned MissionPay platform-support admin account.</p><p>Access refund review and MissionPay platform support operations.</p><form onSubmit={submit}><label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{message && <p className="form-error" role="alert">{message}</p>}<button className="button button--dark button--full" disabled={busy}>{busy ? "Verifying access…" : "Sign in to Platform Support"}<ArrowRight size={17} /></button></form><Link className="admin-back-link" to="/"><ArrowLeft size={16} /> Back to MissionPay</Link></section></main>;
}
