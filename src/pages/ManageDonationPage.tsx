import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarDays, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { LoadingState } from "../components/States";
import { track } from "../lib/analytics";
import { formatDate, formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { RecurringDonation } from "../types/domain";

export function ManageDonationPage() {
  const { token = "" } = useParams();
  const [plan, setPlan] = useState<RecurringDonation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error: invokeError } = await supabase.functions.invoke("cancel-recurring-donation", { body: { management_token: token, action: "retrieve" } });
    if (invokeError || !data?.id) setError("This management link is invalid or has expired."); else setPlan(data as RecurringDonation);
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const cancel = async () => {
    if (!window.confirm("Cancel this monthly donation? Previous donations will remain part of the campaign.")) return;
    setBusy(true);
    const { error: invokeError } = await supabase.functions.invoke("cancel-recurring-donation", { body: { management_token: token, action: "cancel" } });
    if (invokeError) setError("We could not cancel the monthly donation. Please try again."); else { track("monthly_donation_cancelled", { recurring_id: plan!.id }); await load(); }
    setBusy(false);
  };

  if (error) return <main className="status-page"><XCircle /><h1>We can’t open this plan</h1><p>{error}</p><Link to="/campaigns" className="button button--dark">Explore campaigns</Link></main>;
  if (!plan) return <main className="chapter container"><LoadingState label="Opening monthly donation" /></main>;
  return <main className="manage-page"><div className="manage-card"><div className="manage-card__header"><ShieldCheck /><div><p className="eyebrow">Monthly donation</p><h1>{plan.campaign?.title}</h1></div><span className={`status-chip status-chip--${plan.status}`}>{plan.status.replace("_", " ")}</span></div><dl><div><dt>Monthly amount</dt><dd>{formatMoney(plan.amount_cents)}</dd></div><div><dt>Started</dt><dd>{formatDate(plan.started_at)}</dd></div><div><dt>Next charge</dt><dd>{plan.status === "active" ? formatDate(plan.next_charge_at) : "No future charge"}</dd></div></dl>{plan.status === "cancelled" ? <div className="cancelled-note"><CheckCircle2 /><p><strong>This monthly donation is cancelled.</strong> Previous donations remain part of the campaign, and no future charges will be created.</p></div> : <div className="manage-actions"><div><CalendarDays /><p>Your next gift is scheduled for {formatDate(plan.next_charge_at)}.</p></div><button className="button button--danger" onClick={() => void cancel()} disabled={busy}>{busy ? "Cancelling…" : "Cancel monthly donation"}</button></div>}</div></main>;
}
