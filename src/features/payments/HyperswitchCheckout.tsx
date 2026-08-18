import { FormEvent, useRef, useState } from "react";
import { loadHyper } from "@juspay-tech/hyper-js";
import { HyperElements, PaymentElement, useHyper, useWidgets } from "@juspay-tech/react-hyper-js";
import { AlertCircle, LockKeyhole } from "lucide-react";
import { track } from "../../lib/analytics";
import { checkoutFailureCopy, checkoutFailureMessage, classifyCheckoutFailure, isPaymentFailureReason, resultRequiresSdkRedirect } from "../../lib/paymentFailure";
import { supabase } from "../../lib/supabase";
import type { PaymentFailureReason } from "../../types/domain";

const hyperPromise = loadHyper(import.meta.env.VITE_HYPERSWITCH_PUBLISHABLE_KEY, {
  customBackendUrl: import.meta.env.VITE_HYPERSWITCH_BASE_URL ?? "https://sandbox.hyperswitch.io",
});

interface CheckoutFormProps {
  donationId: string;
  statusToken: string;
  managementToken?: string;
  continueToStatus?: () => void;
}

export function CheckoutForm({ donationId, statusToken, managementToken, continueToStatus }: CheckoutFormProps) {
  const hyper = useHyper();
  const widgets = useWidgets();
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submission = useRef(0);

  const reconcileFailure = (submissionId: number, fallbackReason: PaymentFailureReason) => {
    void supabase.functions.invoke("payment-status", { body: { donation_id: donationId, status_token: statusToken } })
      .then(({ data, error }) => {
        if (error || submission.current !== submissionId || !data || typeof data !== "object") return;
        const failure = "failure" in data && data.failure && typeof data.failure === "object" ? data.failure : null;
        const reason = failure && "reason" in failure ? failure.reason : null;
        const specificity: Record<PaymentFailureReason, number> = {
          unknown: 0,
          technical_error: 1,
          card_declined: 2,
          card_unavailable: 2,
          insufficient_funds: 3,
          lost_card: 3,
          stolen_card: 3,
          authentication_failed: 3,
          invalid_cvv: 3,
          expired_card: 3,
          invalid_card: 3,
          payment_cancelled: 3,
          session_expired: 3,
        };
        if (isPaymentFailureReason(reason) && specificity[reason] > specificity[fallbackReason]) {
          setMessage(checkoutFailureCopy[reason]);
        }
      })
      .catch(() => undefined);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hyper || !widgets || processing) return;
    const submissionId = ++submission.current;
    setProcessing(true);
    setMessage(null);
    sessionStorage.setItem(`missionpay:donation:${donationId}`, statusToken);
    if (managementToken) sessionStorage.setItem(`missionpay:management:${donationId}`, managementToken);
    track("payment_submitted", { donation_id: donationId });
    const statusUrl = `${window.location.origin}/donation/${donationId}/success`;
    try {
      const result = await hyper.confirmPayment({
        elements: widgets,
        confirmParams: { return_url: statusUrl },
        redirect: "if_required",
      });
      if ("error" in result && result.error) {
        const reason = classifyCheckoutFailure(result);
        setMessage(checkoutFailureMessage(result));
        setProcessing(false);
        track("payment_failed", { donation_id: donationId, failure_reason: reason });
        reconcileFailure(submissionId, reason);
        return;
      }
      if (resultRequiresSdkRedirect(result)) return;
      (continueToStatus ?? (() => window.location.assign(statusUrl)))();
    } catch {
      const reason = "technical_error" as const;
      setMessage(checkoutFailureMessage({ error: { code: reason } }));
      setProcessing(false);
      track("payment_failed", { donation_id: donationId, failure_reason: reason });
      reconcileFailure(submissionId, reason);
    }
  };

  return (
    <form onSubmit={submit} className="payment-form">
      <PaymentElement id="missionpay-payment-element" options={{ layout: { type: "accordion", defaultCollapsed: false, radios: true, spacedAccordionItems: false }, branding: "never", paymentMethodsHeaderText: "Choose a secure payment method" }} />
      {message && <div className="inline-error" role="alert"><AlertCircle size={18} /><p>{message}</p></div>}
      <button className="button button--coral button--full" disabled={!hyper || processing}>{processing ? "Processing your donation…" : "Complete secure donation"}</button>
      <p className="secure-note"><LockKeyhole size={15} /> Payment details go directly to Hyperswitch and are never stored by MissionPay.</p>
    </form>
  );
}

export function HyperswitchCheckout({ clientSecret, donationId, statusToken, managementToken }: { clientSecret: string; donationId: string; statusToken: string; managementToken?: string }) {
  const appearance = {
    theme: "flat" as const,
    variables: { colorPrimary: "#d85f49", colorBackground: "#fffdf8", colorText: "#17372f", colorDanger: "#b83a32", fontFamily: "Geist, sans-serif", borderRadius: "10px" },
  };
  return <HyperElements hyper={hyperPromise} options={{ clientSecret, appearance, loader: "auto" }}><CheckoutForm donationId={donationId} statusToken={statusToken} managementToken={managementToken} /></HyperElements>;
}
