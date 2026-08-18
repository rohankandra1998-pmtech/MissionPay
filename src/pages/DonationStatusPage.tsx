import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock3, Copy, RefreshCw, XCircle } from "lucide-react";
import { LoadingState } from "../components/States";
import { track } from "../lib/analytics";
import { formatDate, formatMoney } from "../lib/format";
import { paymentFailureContent } from "../lib/paymentFailure";
import { supabase } from "../lib/supabase";
import type { Donation, PaymentFailureReason } from "../types/domain";

interface StatusPayload extends Donation { campaign: { title: string; slug: string }; next_charge_at?: string; recurring_status?: string; recurring_payment_method_ready?: boolean; failure?: { reason: PaymentFailureReason } }

export function DonationStatusPage() {
  const { donationId = "" } = useParams();
  const [donation, setDonation] = useState<StatusPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const token = sessionStorage.getItem(`missionpay:donation:${donationId}`);
  const managementToken = sessionStorage.getItem(`missionpay:management:${donationId}`);

  const refresh = useCallback(async () => {
    if (!token) return setMessage("This confirmation link is missing its secure browser session. Return to the campaign or use the link from your confirmation email.");
    const { data, error } = await supabase.functions.invoke("payment-status", { body: { donation_id: donationId, status_token: token } });
    if (error || !data) return setMessage("We could not confirm the latest payment status. No unconfirmed payment is counted toward the campaign.");
    setDonation(data as StatusPayload);
  }, [donationId, token]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!donation || !["pending", "processing"].includes(donation.status)) return;
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [donation, refresh]);
  useEffect(() => { if (donation?.status === "succeeded") track("payment_succeeded", { donation_id: donation.id }); }, [donation]);

  if (!donation && !message) return <main className="chapter container"><LoadingState label="Confirming your donation with Hyperswitch" /></main>;
  if (!donation) return <main className="status-page"><XCircle /><h1>We can’t open this confirmation</h1><p>{message}</p><Link className="button button--dark" to="/campaigns">Return to campaigns</Link></main>;
  if (["pending", "processing"].includes(donation.status)) return <main className="status-page"><Clock3 className="pulse" /><p className="eyebrow">Payment processing</p><h1>We’re confirming your donation.</h1><p>Please keep this page open. MissionPay will only count your gift after Hyperswitch confirms it.</p><button className="button button--outline" onClick={() => void refresh()}><RefreshCw size={17} /> Check again</button></main>;
  if (donation.status !== "succeeded") {
    const content = paymentFailureContent[donation.failure?.reason ?? "unknown"];
    return <main className="status-page"><XCircle /><p className="eyebrow">{content.eyebrow}</p><h1>{content.headline}</h1><p>{content.body}</p><div className="status-actions"><Link className="button button--coral" to={`/donate/${donation.campaign_id}`}>{content.action} <ArrowRight size={17} /></Link><Link className="button button--outline" to={`/campaigns/${donation.campaign.slug}`}>Return to campaign</Link></div></main>;
  }

  const monthlyChargeable = donation.frequency === "monthly"
    && donation.recurring_status === "active"
    && donation.recurring_payment_method_ready === true;
  return <main className="status-page status-page--success"><CheckCircle2 /><p className="eyebrow">Donation confirmed</p><h1>Thank you for showing up.</h1><p>Your {formatMoney(donation.amount_cents)} {donation.frequency === "monthly" ? "monthly " : ""}donation to <strong>{donation.campaign.title}</strong> is confirmed.</p><dl className="confirmation-card"><div><dt>Amount</dt><dd>{formatMoney(donation.amount_cents)}</dd></div><div><dt>Frequency</dt><dd>{donation.frequency === "monthly" ? "Monthly" : "One-time"}</dd></div><div><dt>Reference</dt><dd>{donation.id.slice(0, 8).toUpperCase()} <button onClick={() => void navigator.clipboard.writeText(donation.id)} aria-label="Copy full reference"><Copy size={15} /></button></dd></div>{monthlyChargeable && donation.next_charge_at && <div><dt>Next donation</dt><dd>{formatDate(donation.next_charge_at)}</dd></div>}</dl>{monthlyChargeable && <div className="monthly-active"><CheckCircle2 /><div><strong>Monthly donation active</strong><p>You can cancel future gifts at any time. Previous donations are unaffected.</p></div></div>}{donation.frequency === "monthly" && !monthlyChargeable && <div className="monthly-setup-incomplete"><XCircle /><div><strong>{donation.recurring_payment_method_ready ? "No future monthly charge is scheduled" : "Future monthly donations were not activated"}</strong><p>{donation.recurring_payment_method_ready ? "Your donation was confirmed, but the monthly plan is not currently chargeable." : "Your donation was confirmed, but recurring setup was incomplete. You will not be charged again automatically."}</p></div></div>}<div className="status-actions"><Link className="button button--dark" to={`/campaigns/${donation.campaign.slug}`}>Return to campaign</Link>{managementToken && <Link className="button button--outline" to={`/manage-donation/${managementToken}`}>Manage monthly donation</Link>}</div></main>;
}
