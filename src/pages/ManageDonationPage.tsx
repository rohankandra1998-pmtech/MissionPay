import { useCallback, useEffect, useRef, useState } from "react";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const load = useCallback(async () => {
    const { data, error: invokeError } = await supabase.functions.invoke("cancel-recurring-donation", { body: { management_token: token, action: "retrieve" } });
    if (invokeError || !data?.id) setLoadError("This management link is invalid or has expired.");
    else setPlan(data as RecurringDonation);
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (confirming) keepButtonRef.current?.focus();
  }, [confirming]);

  const cancel = async () => {
    setBusy(true);
    setActionError(null);
    const { error: invokeError } = await supabase.functions.invoke("cancel-recurring-donation", { body: { management_token: token, action: "cancel" } });
    if (invokeError) {
      setActionError("We could not cancel the monthly donation. Please try again.");
    } else {
      track("monthly_donation_cancelled");
      setPlan((current) => current ? { ...current, status: "cancelled", cancelled_at: new Date().toISOString() } : current);
      setConfirming(false);
    }
    setBusy(false);
  };

  if (loadError) return <main className="status-page"><XCircle /><h1>We can’t open this plan</h1><p>{loadError}</p><Link to="/campaigns" className="button button--dark">Explore campaigns</Link></main>;
  if (!plan) return <main className="chapter container"><LoadingState label="Opening monthly donation" /></main>;
  const chargeable = plan.status === "active" && plan.recurring_payment_method_ready === true && Boolean(plan.next_charge_at);
  const displayStatus = plan.status === "active" && !chargeable ? "setup incomplete" : plan.status.replace("_", " ");
  return <main className="manage-page"><div className="manage-card"><div className="manage-card__header"><ShieldCheck /><div><p className="eyebrow">Monthly donation</p><h1>{plan.campaign?.title}</h1></div><span className={`status-chip status-chip--${chargeable ? "active" : plan.status}`}>{displayStatus}</span></div><dl><div><dt>Monthly amount</dt><dd>{formatMoney(plan.amount_cents)}</dd></div><div><dt>Started</dt><dd>{formatDate(plan.started_at)}</dd></div><div><dt>Next charge</dt><dd>{chargeable ? formatDate(plan.next_charge_at!) : "No future charge"}</dd></div></dl>{plan.status === "cancelled" ? <div className="cancelled-note"><CheckCircle2 /><p><strong>Your monthly donation is cancelled.</strong> You will not be charged again. Previous donations remain part of the campaign.</p></div> : chargeable ? <div className="manage-actions"><div><CalendarDays /><p>Your next gift is scheduled for {formatDate(plan.next_charge_at!)}.</p></div><button className="button button--danger" onClick={() => { setActionError(null); setConfirming(true); }}>Cancel monthly donation</button></div> : <div className="cancelled-note"><XCircle /><p><strong>Future monthly donations are not active.</strong> {plan.recurring_payment_method_ready ? "The plan is not currently chargeable, so no future charge is scheduled." : "Recurring setup was incomplete, so no future charge is scheduled."} Previous donations remain part of the campaign.</p></div>}{confirming && <div className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-dialog-title" aria-describedby="cancel-dialog-description" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setConfirming(false); }}><h2 id="cancel-dialog-title">Cancel your monthly donation?</h2><p id="cancel-dialog-description">Future monthly charges will stop. Previous donations will remain with the campaign.</p>{actionError && <p className="form-error" role="alert">{actionError}</p>}<div className="confirmation-dialog__actions"><button ref={keepButtonRef} className="button button--dark" onClick={() => { setActionError(null); setConfirming(false); }} disabled={busy}>No, keep my monthly donation</button><button className="button button--danger" onClick={() => void cancel()} disabled={busy}>{busy ? "Cancelling…" : "Yes, cancel monthly donation"}</button></div></div>}</div></main>;
}
