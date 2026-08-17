import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react";
import { ErrorState, LoadingState } from "../components/States";
import { HyperswitchCheckout } from "../features/payments/HyperswitchCheckout";
import { track } from "../lib/analytics";
import { validateDonationAmount } from "../lib/donation";
import { formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Campaign, DonationFrequency } from "../types/domain";

type Step = "details" | "review" | "payment";
interface Session { donation_id: string; payment_id: string; client_secret: string; status_token: string; recurring_management_token?: string }

export function DonatePage() {
  const { campaignId = "" } = useParams();
  const location = useLocation();
  const [campaign, setCampaign] = useState<Campaign | null>((location.state as { campaign?: Campaign } | null)?.campaign ?? null);
  const [step, setStep] = useState<Step>("details");
  const [frequency, setFrequency] = useState<DonationFrequency>("one_time");
  const [amount, setAmount] = useState(50);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!campaign);
  const cents = useMemo(() => Math.round((custom ? Number(custom) : amount) * 100), [amount, custom]);

  useEffect(() => {
    if (campaign) return;
    supabase.from("campaigns").select("*, fundraiser:fundraisers(display_name, organization_name, avatar_url, verification_status), metrics:campaign_metrics(*)").eq("id", campaignId).eq("status", "published").single().then(({ data, error: queryError }) => {
      if (queryError || !data) setError("This campaign is not available for donations.");
      else setCampaign(data as unknown as Campaign);
      setLoading(false);
    });
  }, [campaign, campaignId]);

  const validateDetails = (event: FormEvent) => {
    event.preventDefault();
    const amountError = validateDonationAmount(cents);
    if (amountError) return setError(amountError);
    if (name.trim().length < 2) return setError("Enter the donor's full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address for the donation confirmation.");
    setError(null);
    setStep("review");
  };

  const createPayment = async () => {
    if (frequency === "monthly" && !consent) return setError("Please confirm the monthly donation authorization before continuing.");
    setError(null);
    track("checkout_started", { campaign_id: campaignId, frequency, amount_cents: cents });
    const { data, error: invokeError } = await supabase.functions.invoke("create-payment", { body: { campaign_id: campaignId, amount_cents: cents, frequency, donor_name: name.trim(), donor_email: email.trim().toLowerCase(), is_anonymous: anonymous, recurring_consent: consent } });
    if (invokeError || !data?.client_secret) return setError(data?.error ?? "We could not open secure checkout. No charge was made. Please try again.");
    setSession(data as Session);
    setStep("payment");
  };

  if (loading) return <main className="chapter container"><LoadingState label="Preparing donation" /></main>;
  if (!campaign) return <main className="chapter container"><ErrorState message={error ?? "Campaign not found."} /></main>;

  return (
    <main className="checkout-page">
      <div className="checkout-shell">
        <div className="checkout-context"><img src={campaign.cover_image_url} alt="" /><div><p className="eyebrow">You are supporting</p><h1>{campaign.title}</h1><p>{campaign.short_description}</p></div></div>
        <div className="checkout-panel">
          <ol className="checkout-steps" aria-label="Donation progress"><li className={step === "details" ? "active" : "done"}>1 <span>Details</span></li><li className={step === "review" ? "active" : step === "payment" ? "done" : ""}>2 <span>Review</span></li><li className={step === "payment" ? "active" : ""}>3 <span>Payment</span></li></ol>
          {step === "details" && <form onSubmit={validateDetails} className="donation-form"><h2>Choose your support</h2><div className="frequency-switch"><button type="button" className={frequency === "one_time" ? "active" : ""} onClick={() => { setFrequency("one_time"); setConsent(false); track("donation_frequency_selected", { frequency: "one_time" }); }}>One-time</button><button type="button" className={frequency === "monthly" ? "active" : ""} onClick={() => { setFrequency("monthly"); track("donation_frequency_selected", { frequency: "monthly" }); }}>Monthly</button></div><div className="amount-grid">{[25, 50, 100, 250].map((value) => <button type="button" key={value} className={!custom && amount === value ? "active" : ""} onClick={() => { setAmount(value); setCustom(""); track("donation_amount_selected", { amount: value }); }}>${value}</button>)}<label className={custom ? "active" : ""}><span>$</span><input aria-label="Custom donation amount" inputMode="decimal" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Custom" /></label></div>{frequency === "monthly" && <p className="monthly-explainer">You’ll donate {formatMoney(cents || 0)} today and the same amount every month until you cancel.</p>}<div className="field-grid"><label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label></div><label className="check-field"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /><span><strong>Make this donation anonymous</strong>Your contact details remain private either way.</span></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--dark button--full">Review {formatMoney(cents || 0)} donation <ArrowRight size={18} /></button></form>}
          {step === "review" && <div className="review-panel"><button className="back-link" onClick={() => setStep("details")}><ArrowLeft size={16} /> Edit details</button><h2>Review your donation</h2><dl><div><dt>Campaign</dt><dd>{campaign.title}</dd></div><div><dt>Donation</dt><dd>{formatMoney(cents)} {frequency === "monthly" ? "today" : "one-time"}</dd></div>{frequency === "monthly" && <div><dt>Then</dt><dd>{formatMoney(cents)} every month</dd></div>}<div><dt>Donor</dt><dd>{anonymous ? "Anonymous publicly" : name}<small>{email}</small></dd></div></dl>{frequency === "monthly" && <label className="consent-box"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I authorize MissionPay to charge {formatMoney(cents)} today and {formatMoney(cents)} each month until I cancel. I can cancel future charges at any time.</span></label>}{error && <p className="form-error" role="alert">{error}</p>}<button onClick={() => void createPayment()} className="button button--coral button--full" disabled={frequency === "monthly" && !consent}>Continue to secure payment <LockKeyhole size={17} /></button><p className="secure-note">Your donation is not counted until Hyperswitch confirms the payment.</p></div>}
          {step === "payment" && session && <div><div className="payment-heading"><span><Check size={17} /></span><div><h2>Secure payment</h2><p>{formatMoney(cents)} {frequency === "monthly" ? "today, then monthly" : "one-time"}</p></div></div><HyperswitchCheckout clientSecret={session.client_secret} donationId={session.donation_id} statusToken={session.status_token} managementToken={session.recurring_management_token} /></div>}
        </div>
      </div>
    </main>
  );
}
