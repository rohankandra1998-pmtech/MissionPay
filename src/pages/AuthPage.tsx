import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match. Please enter the same password in both fields.");
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim(), organization_name: organization.trim() || null }, emailRedirectTo: `${window.location.origin}/dashboard` } });
      if (authError) setError(authError.message); else if (!data.session) setNotice("Check your email to confirm your fundraiser account, then return here to sign in."); else navigate("/dashboard");
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError("We couldn’t sign you in with those details. Check your email and password."); else navigate((location.state as { from?: string } | null)?.from ?? "/dashboard");
    }
    setBusy(false);
  };

  return <main className="auth-page"><section className="auth-story"><div><p className="eyebrow eyebrow--light">For fundraisers</p><h1>Turn a clear mission into shared momentum.</h1><ul><li><CheckCircle2 /> Publish a credible campaign</li><li><CheckCircle2 /> See every confirmed donation</li><li><CheckCircle2 /> Understand monthly support</li></ul></div></section><section className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><p className="eyebrow">MissionPay fundraiser</p><h2>{mode === "signup" ? "Start your fundraiser" : "Welcome back"}</h2><p>{mode === "signup" ? "Create a secure workspace for your campaign." : "Sign in to manage campaigns and confirmed support."}</p>{mode === "signup" && <div className="field-grid"><label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Organization <span>(optional)</span><input autoComplete="organization" value={organization} onChange={(event) => setOrganization(event.target.value)} /></label></div>}<label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{mode === "signup" && <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>}{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-notice" role="status">{notice}</p>}<button className="button button--dark button--full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create fundraiser account" : "Sign in"}<ArrowRight size={17} /></button><p className="auth-switch">{mode === "signup" ? "Already fundraising?" : "New to MissionPay?"} <Link to={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Sign in" : "Create an account"}</Link></p></form></section></main>;
}
