import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyCheckoutFailure } from "../lib/paymentFailure";

const { confirmPayment, invoke, paymentElementOptions } = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
  invoke: vi.fn(),
  paymentElementOptions: vi.fn(),
}));

vi.mock("@juspay-tech/hyper-js", () => ({ loadHyper: vi.fn(() => Promise.resolve({})) }));
vi.mock("@juspay-tech/react-hyper-js", () => ({
  HyperElements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: ({ options }: { options: Record<string, unknown> }) => { paymentElementOptions(options); return <div>Secure payment fields</div>; },
  useHyper: () => ({ confirmPayment }),
  useWidgets: () => ({ id: "widgets" }),
}));
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke } } }));

import { CheckoutForm } from "../features/payments/HyperswitchCheckout";

function renderCheckout(continueToStatus = vi.fn(), frequency: "one_time" | "monthly" = "one_time") {
  render(<CheckoutForm donationId="donation-1" statusToken="status-token-which-is-long-and-random" frequency={frequency} continueToStatus={continueToStatus} />);
  return continueToStatus;
}

describe("Hyperswitch checkout confirmation", () => {
  beforeEach(() => {
    confirmPayment.mockReset();
    invoke.mockReset().mockResolvedValue({ data: null, error: null });
    paymentElementOptions.mockReset();
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it("keeps an immediate decline inline, presents only MissionPay copy, and starts background reconciliation", async () => {
    confirmPayment.mockResolvedValue({
      submitSuccessful: true,
      error: { type: "card_error", message: "private issuer explanation", code: "insufficient_funds" },
    });
    const continueToStatus = renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("There aren't enough funds on this card.");
    expect(alert).not.toHaveTextContent("private issuer explanation");
    expect(confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ redirect: "if_required" }));
    expect(invoke).toHaveBeenCalledWith("payment-status", { body: { donation_id: "donation-1", status_token: "status-token-which-is-long-and-random" } });
    expect(continueToStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Complete secure donation" })).toBeEnabled();
  });

  it("replaces a generic immediate decline with a more specific reconciled reason without blocking retry", async () => {
    let finishReconciliation: ((value: unknown) => void) | undefined;
    invoke.mockReturnValue(new Promise((resolve) => { finishReconciliation = resolve; }));
    confirmPayment.mockResolvedValue({
      submitSuccessful: true,
      error: { type: "card_error", message: "private issuer explanation", code: "generic_decline" },
    });
    renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your card was declined.");
    expect(screen.getByRole("button", { name: "Complete secure donation" })).toBeEnabled();
    finishReconciliation?.({ data: { status: "failed", failure: { reason: "lost_card" } }, error: null });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This card has been reported lost."));
    expect(screen.getByRole("alert")).not.toHaveTextContent("private issuer explanation");
    expect(screen.getByRole("button", { name: "Complete secure donation" })).toBeEnabled();
  });

  it("retains the safe fallback when background reconciliation fails", async () => {
    invoke.mockRejectedValue(new Error("network failure with private detail"));
    confirmPayment.mockResolvedValue({ submitSuccessful: true, error: { type: "card_error", message: "private decline", code: "generic_decline" } });
    renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your card was declined.");
    expect(alert).not.toHaveTextContent("private decline");
    expect(screen.getByRole("button", { name: "Complete secure donation" })).toBeEnabled();
  });

  it.each([
    [{ type: "card_error", message: "private decline", code: "generic_decline" }, "Your card was declined."],
    [{ type: "card_error", message: "private unrecognized decline", code: "future_code" }, "Your payment couldn't be completed."],
  ])("uses safe checkout copy for an immediate SDK error", async (error, expectedCopy) => {
    confirmPayment.mockResolvedValue({ submitSuccessful: true, error });
    const continueToStatus = renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expectedCopy);
    expect(alert).not.toHaveTextContent(error.message);
    expect(continueToStatus).not.toHaveBeenCalled();
  });

  it.each(["succeeded", "processing", "failed"])("continues a no-error direct %s result to backend-authoritative status reconciliation", async (status) => {
    confirmPayment.mockResolvedValue({ status });
    const continueToStatus = renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));

    await waitFor(() => expect(continueToStatus).toHaveBeenCalledOnce());
    expect(invoke).not.toHaveBeenCalled();
  });

  it("leaves redirect actions to the SDK and does not start a second navigation", async () => {
    confirmPayment.mockResolvedValue({ status: "requires_customer_action", next_action: { type: "redirect_to_url", redirect_to_url: "https://bank.example" } });
    const continueToStatus = renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));

    await waitFor(() => expect(confirmPayment).toHaveBeenCalledOnce());
    expect(continueToStatus).not.toHaveBeenCalled();
  });

  it("resets after a decline and allows a clean retry", async () => {
    confirmPayment
      .mockResolvedValueOnce({ submitSuccessful: true, error: { type: "card_error", message: "Card declined" } })
      .mockResolvedValueOnce({ status: "succeeded" });
    const continueToStatus = renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));
    await screen.findByText("Your card was declined. Try another payment method or contact your bank if this continues.");
    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));

    await waitFor(() => expect(continueToStatus).toHaveBeenCalledOnce());
    expect(confirmPayment).toHaveBeenCalledTimes(2);
  });

  it("uses safe analytics taxonomy without provider messages", async () => {
    const analytics = vi.fn();
    window.addEventListener("missionpay:analytics", analytics);
    confirmPayment.mockResolvedValue({ submitSuccessful: true, error: { type: "card_error", message: "secret risk rule", error_code: "stolen_card" } });
    renderCheckout();

    fireEvent.click(screen.getByRole("button", { name: "Complete secure donation" }));
    await screen.findByRole("alert");

    const failureEvent = analytics.mock.calls.map(([event]) => (event as CustomEvent).detail).find((detail) => detail.event === "payment_failed");
    expect(failureEvent).toEqual({ event: "payment_failed", properties: { donation_id: "donation-1", failure_reason: "stolen_card" } });
    expect(JSON.stringify(failureEvent)).not.toContain("secret risk rule");
    window.removeEventListener("missionpay:analytics", analytics);
  });

  it("shows and defaults Hyperswitch's saved-payment consent control for monthly donations", () => {
    renderCheckout(vi.fn(), "monthly");
    expect(paymentElementOptions).toHaveBeenCalledWith(expect.objectContaining({
      displaySavedPaymentMethodsCheckbox: true,
      savedPaymentMethodsCheckboxCheckedByDefault: true,
    }));
    expect(screen.getByText(/securely saved by Hyperswitch/i)).toBeInTheDocument();
  });

  it("does not request saved-payment controls for one-time donations", () => {
    renderCheckout();
    const options = paymentElementOptions.mock.calls[0][0] as Record<string, unknown>;
    expect(options).not.toHaveProperty("displaySavedPaymentMethodsCheckbox");
    expect(options).not.toHaveProperty("savedPaymentMethodsCheckboxCheckedByDefault");
    expect(screen.queryByText(/securely saved by Hyperswitch/i)).not.toBeInTheDocument();
  });
});

describe("client payment failure classifier", () => {
  it.each([
    [{ error: { code: "insufficient_funds" } }, "insufficient_funds"],
    [{ error: { decline_code: "do_not_honor" } }, "card_declined"],
    [{ error: { error_code: "lost_card" } }, "lost_card"],
    [{ error: { error_code: "stolen_card" } }, "stolen_card"],
    [{ status: "authentication_failed" }, "authentication_failed"],
    [{ error: { code: "invalid_cvv" } }, "invalid_cvv"],
    [{ error: { code: "expired_card" } }, "expired_card"],
    [{ error_details: { unified_details: { standardised_code: "INVALID_CARD_NUMBER" } } }, "invalid_card"],
    [{ error: { code: "payment_cancelled_by_user" } }, "payment_cancelled"],
    [{ error: { code: "payment_session_timeout" } }, "session_expired"],
    [{ error: { unified_code: "UE_3000" } }, "technical_error"],
    [{ error: { code: "unrecognized", message: "private raw decline" } }, "unknown"],
  ])("normalizes %j to %s", (input, expected) => {
    expect(classifyCheckoutFailure(input)).toBe(expected);
  });

  it("uses only exact documented message labels and leaves ambiguous provider values unknown", () => {
    expect(classifyCheckoutFailure({ error: { message: "Insufficient funds" } })).toBe("insufficient_funds");
    expect(classifyCheckoutFailure({ error: { message: "Payment declined: Lost card" } })).toBe("lost_card");
    expect(classifyCheckoutFailure({ error_message: "Payment declined: Stolen card" })).toBe("stolen_card");
    expect(classifyCheckoutFailure({ unified_message: "Payment declined: Card declined" })).toBe("card_declined");
    expect(classifyCheckoutFailure({ error: { message: "Issuer says insufficient funds after risk review" } })).toBe("unknown");
    expect(classifyCheckoutFailure({ error: { message: "Payment declined: Issuer says card was stolen" } })).toBe("unknown");
    expect(classifyCheckoutFailure({ error: { code: "UE_9000", message: "private detail" } })).toBe("unknown");
    expect(classifyCheckoutFailure({ error: { code: "DC_08", message: "private detail" } })).toBe("unknown");
  });

  it("uses the narrow Fauxpay adapter only when an SDK error exposes the complete fingerprint", () => {
    const error = {
      connector: "fauxpay",
      error_code: "DC_08",
      unified_code: "UE_9000",
      error_details: {
        unified_details: { category: "UE_9000", message: "Something went wrong" },
        connector_details: { code: "DC_08", message: "Payment declined: Internal Server Error from Connector, Please try again later" },
      },
    };

    expect(classifyCheckoutFailure({ error })).toBe("insufficient_funds");
    expect(classifyCheckoutFailure({ error: { ...error, connector: "some_real_processor" } })).toBe("unknown");
    expect(classifyCheckoutFailure({ error: { connector: "fauxpay", error_code: "DC_08", unified_code: "UE_9000" } })).toBe("unknown");
  });
});
