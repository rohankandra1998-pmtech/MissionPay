import { FormEvent, useState } from "react";
import { loadHyper } from "@juspay-tech/hyper-js";
import { HyperElements, PaymentElement, useHyper, useWidgets } from "@juspay-tech/react-hyper-js";
import { AlertCircle, LockKeyhole } from "lucide-react";
import { track } from "../../lib/analytics";
import { checkoutFailureMessage, classifyCheckoutFailure, resultRequiresSdkRedirect } from "../../lib/paymentFailure";
import { supabase } from "../../lib/supabase";

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hyper || !widgets || processing) return;
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
        void supabase.functions.invoke("payment-status", { body: { donation_id: donationId, status_token: statusToken } }).catch(() => undefined);
        return;
      }
      if (resultRequiresSdkRedirect(result)) return;
      (continueToStatus ?? (() => window.location.assign(statusUrl)))();
    } catch {
      const reason = "technical_error" as const;
      setMessage(checkoutFailureMessage({ error: { code: reason } }));
      setProcessing(false);
      track("payment_failed", { donation_id: donationId, failure_reason: reason });
      void supabase.functions.invoke("payment-status", { body: { donation_id: donationId, status_token: statusToken } }).catch(() => undefined);
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
