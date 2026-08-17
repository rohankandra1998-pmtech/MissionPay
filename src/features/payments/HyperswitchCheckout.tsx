import { FormEvent, useState } from "react";
import { loadHyper } from "@juspay-tech/hyper-js";
import { HyperElements, PaymentElement, useHyper, useWidgets } from "@juspay-tech/react-hyper-js";
import { AlertCircle, LockKeyhole } from "lucide-react";
import { track } from "../../lib/analytics";

const hyperPromise = loadHyper(import.meta.env.VITE_HYPERSWITCH_PUBLISHABLE_KEY, {
  customBackendUrl: import.meta.env.VITE_HYPERSWITCH_BASE_URL ?? "https://sandbox.hyperswitch.io",
});

function CheckoutForm({ donationId, statusToken, managementToken }: { donationId: string; statusToken: string; managementToken?: string }) {
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
    const result = await hyper.confirmPayment({
      elements: widgets,
      confirmParams: { return_url: `${window.location.origin}/donation/${donationId}/success` },
      redirect: "always",
    });
    if (result?.error) {
      setMessage(result.error.message ?? "Your payment could not be completed. Check the payment details and try again.");
      setProcessing(false);
      track("payment_failed", { donation_id: donationId });
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
