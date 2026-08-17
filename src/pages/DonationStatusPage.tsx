import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock3, Copy, RefreshCw, XCircle } from "lucide-react";
import { LoadingState } from "../components/States";
import { track } from "../lib/analytics";
import { formatDate, formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Donation, PaymentFailureReason } from "../types/domain";

interface StatusPayload extends Donation { campaign: { title: string; slug: string }; next_charge_at?: string; recurring_status?: string; failure?: { reason: PaymentFailureReason } }

const failureContent: Record<PaymentFailureReason, { eyebrow: string; headline: string; body: string; action: string }> = {
  insufficient_funds: { eyebrow: "Payment declined", headline: "There aren't enough funds on this card.", body: "Your donation was not charged or added to the campaign total. Try another payment method, or add funds and try again.", action: "Try another payment method" },
  card_declined: { eyebrow: "Payment declined", headline: "Your card was declined.", body: "Your donation was not charged or added to the campaign total. Try another payment method or contact your bank if this continues.", action: "Try another payment method" },
  card_unavailable: { eyebrow: "Payment declined", headline: "This card can't be used for this payment.", body: "Your donation was not charged. Try another payment method or contact your bank if you need help with this card. The donation was not added to the campaign total.", action: "Try another payment method" },
  authentication_failed: { eyebrow: "Payment not verified", headline: "We couldn't verify this payment with your bank.", body: "Your donation was not completed or added to the campaign total. Try again and complete your bank's verification step, or use another payment method.", action: "Try again" },
  invalid_cvv: { eyebrow: "Payment not completed", headline: "The card security code wasn't accepted.", body: "Your donation was not charged or added to the campaign total. Check the security code and try again, or use another payment method.", action: "Try again" },
  expired_card: { eyebrow: "Payment not completed", headline: "This card has expired.", body: "Your donation was not charged or added to the campaign total. Use another payment method to complete your donation.", action: "Try another payment method" },
  invalid_card: { eyebrow: "Payment not completed", headline: "The card details weren't accepted.", body: "Your donation was not charged or added to the campaign total. Check the details or use another payment method.", action: "Try again" },
  payment_cancelled: { eyebrow: "Payment cancelled", headline: "Payment cancelled.", body: "Nothing was charged and the donation was not added to the campaign total.", action: "Try again" },
  session_expired: { eyebrow: "Session expired", headline: "Your payment session expired.", body: "Nothing was charged or added to the campaign total. Start the payment again to complete your donation.", action: "Restart payment" },
  technical_error: { eyebrow: "Payment not completed", headline: "We couldn't process this payment right now.", body: "Your donation was not charged or added to the campaign total. Please try again in a moment or use another payment method.", action: "Try again" },
  unknown: { eyebrow: "Payment not completed", headline: "Your donation was not charged.", body: "The attempt was not added to the campaign total. You can safely try again.", action: "Try again" },
};

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
    const content = failureContent[donation.failure?.reason ?? "unknown"];
    return <main className="status-page"><XCircle /><p className="eyebrow">{content.eyebrow}</p><h1>{content.headline}</h1><p>{content.body}</p><div className="status-actions"><Link className="button button--coral" to={`/donate/${donation.campaign_id}`}>{content.action} <ArrowRight size={17} /></Link><Link className="button button--outline" to={`/campaigns/${donation.campaign.slug}`}>Return to campaign</Link></div></main>;
  }

  return <main className="status-page status-page--success"><CheckCircle2 /><p className="eyebrow">Donation confirmed</p><h1>Thank you for showing up.</h1><p>Your {formatMoney(donation.amount_cents)} {donation.frequency === "monthly" ? "monthly " : ""}donation to <strong>{donation.campaign.title}</strong> is confirmed.</p><dl className="confirmation-card"><div><dt>Amount</dt><dd>{formatMoney(donation.amount_cents)}</dd></div><div><dt>Frequency</dt><dd>{donation.frequency === "monthly" ? "Monthly" : "One-time"}</dd></div><div><dt>Reference</dt><dd>{donation.id.slice(0, 8).toUpperCase()} <button onClick={() => void navigator.clipboard.writeText(donation.id)} aria-label="Copy full reference"><Copy size={15} /></button></dd></div>{donation.next_charge_at && <div><dt>Next donation</dt><dd>{formatDate(donation.next_charge_at)}</dd></div>}</dl>{donation.frequency === "monthly" && managementToken && <div className="monthly-active"><CheckCircle2 /><div><strong>Monthly donation active</strong><p>You can cancel future gifts at any time. Previous donations are unaffected.</p></div></div>}<div className="status-actions"><Link className="button button--dark" to={`/campaigns/${donation.campaign.slug}`}>Return to campaign</Link>{managementToken && <Link className="button button--outline" to={`/manage-donation/${managementToken}`}>Manage monthly donation</Link>}</div></main>;
}
