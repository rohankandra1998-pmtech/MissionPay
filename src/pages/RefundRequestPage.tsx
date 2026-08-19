import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, RotateCcw, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { LoadingState } from "../components/States";
import { formatDate, formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { RefundRequestReason, RefundRequestView } from "../types/domain";

const reasonLabels: Record<RefundRequestReason, string> = {
  incorrect_amount: "Incorrect donation amount",
  duplicate: "Duplicate donation",
  unauthorized: "Unauthorized donation",
  other: "Other",
};

export function RefundRequestPage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<RefundRequestView | null>(null);
  const [reason, setReason] = useState<RefundRequestReason>("incorrect_amount");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("refund-request", { body: { action: "preview", capability: token } });
    if (invokeError || !data?.donation) setError("This refund request link is invalid or temporarily unavailable.");
    else setView(data as RefundRequestView);
    setLoading(false);
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("refund-request", { body: { action: "submit", capability: token, reason, details } });
    if (invokeError || !data?.donation) setError(data?.error ?? "We could not submit the request. Please try again.");
    else setView(data as RefundRequestView);
    setSubmitting(false);
  };

  if (loading) return <main className="chapter container"><LoadingState label="Opening your refund request" /></main>;
  if (!view) return <main className="status-page"><XCircle /><h1>We can’t open this refund request.</h1><p>{error}</p><Link className="button button--dark" to="/campaigns">Return to campaigns</Link></main>;
  const monthly = view.donation.frequency === "monthly";
  const request = view.refund_request;
  const refund = view.refund;
  const context = <dl className="confirmation-card"><div><dt>Campaign</dt><dd>{view.donation.campaign.title}</dd></div><div><dt>Amount</dt><dd>{formatMoney(view.donation.amount_cents)}</dd></div><div><dt>Frequency</dt><dd>{monthly ? "Monthly charge" : "One-time"}</dd></div><div><dt>Reference</dt><dd>{view.donation.id.slice(0, 8).toUpperCase()}</dd></div><div><dt>Donation date</dt><dd>{formatDate(view.donation.completed_at ?? view.donation.created_at)}</dd></div></dl>;
  const monthlyNote = monthly && <div className="refund-monthly-note"><strong>This request is for one completed charge.</strong><p>It does not cancel your monthly donation or change future scheduled charges.</p></div>;

  if (view.donation.status === "refunded" || refund?.status === "succeeded") return <main className="status-page status-page--success"><RotateCcw /><p className="eyebrow">Refund complete</p><h1>Donation refunded</h1><p>Your {formatMoney(view.donation.amount_cents)} donation to <strong>{view.donation.campaign.title}</strong> has been refunded to the original payment method.</p>{context}{monthlyNote}<Link className="button button--dark" to={`/campaigns/${view.donation.campaign.slug}`}>View campaign</Link></main>;
  if (request) {
    const declined = request.status === "declined";
    const failed = request.status === "approved" && refund?.status === "failed";
    const processing = request.status === "approved" && !failed;
    return <main className="status-page refund-state-page">{declined || failed ? <XCircle /> : processing ? <Clock3 className="pulse" /> : <CheckCircle2 />}<p className="eyebrow">{declined ? "Request closed" : processing ? "Refund processing" : "Pending admin review"}</p><h1>{declined ? "Refund request declined" : failed ? "Refund needs attention" : processing ? "Your refund was approved." : "Refund request submitted"}</h1><p>{declined ? "MissionPay reviewed and closed this request without issuing a refund." : failed ? "Hyperswitch has not completed the refund. MissionPay can safely reconcile or retry the same refund identity." : processing ? "Hyperswitch is processing the full refund. Your donation remains confirmed until the provider reports success." : "MissionPay will review your request. No refund has been issued yet."}</p>{context}{monthlyNote}{processing && <button className="button button--outline" onClick={() => void load()}>Check latest status</button>}</main>;
  }
  if (view.eligibility !== "eligible") return <main className="status-page"><XCircle /><p className="eyebrow">Refund unavailable</p><h1>This donation isn’t eligible for a refund request.</h1><p>Only provider-confirmed successful donations can be submitted for MissionPay admin review.</p>{context}</main>;

  return <main className="refund-request-page"><section className="refund-request-intro"><p className="eyebrow">Donor support</p><h1>Request a full refund</h1><p>Tell MissionPay why you’re requesting a refund. Submitting this form starts an admin review; it does not issue money automatically.</p>{context}{monthlyNote}</section><form className="refund-form" onSubmit={(event) => void submit(event)}><label>Reason<select value={reason} onChange={(event) => setReason(event.target.value as RefundRequestReason)}>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Short explanation <span>{reason === "other" ? "Required" : "Optional"}</span><textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={500} rows={5} required={reason === "other"} placeholder="Add context that will help MissionPay review this request." /><small>{details.length}/500</small></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--coral" disabled={submitting}>{submitting ? "Submitting…" : "Submit refund request"}</button><p className="refund-form__notice">MissionPay platform admins review every request. The refund, if approved, is always for the original full donation amount.</p></form></main>;
}
