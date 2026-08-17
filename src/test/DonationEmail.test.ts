import { describe, expect, it, vi } from "vitest";
import {
  buildDonationConfirmationEmail,
  EmailConfigurationError,
  EmailProviderError,
  failedDeliveryUpdate,
  safeDeliveryError,
  sendDonationConfirmation,
  type DonationConfirmationData,
} from "../../supabase/functions/_shared/donationEmail";

const baseDonation: DonationConfirmationData = {
  donationId: "donation-123",
  donorName: "Avery Donor",
  campaignTitle: "Clean Water for Rural Communities",
  campaignUrl: "https://missionpay.example/campaigns/clean-water",
  amountCents: 2500,
  currency: "USD",
  frequency: "one_time",
  isAnonymous: false,
  completedAt: "2026-08-17T08:00:00.000Z",
  sandbox: true,
};

describe("donation confirmation email", () => {
  it("renders one-time campaign, amount, frequency, and MissionPay reference", () => {
    const message = buildDonationConfirmationEmail(baseDonation);
    expect(message.subject).toContain("Donation confirmed");
    expect(message.text).toContain("Clean Water for Rural Communities");
    expect(message.text).toContain("$25.00 USD");
    expect(message.text).toContain("Frequency: One-time");
    expect(message.text).toContain("MissionPay reference: donation-123");
    expect(message.text).toContain("No real money moved");
  });

  it("renders an active monthly occurrence and next charge date", () => {
    const message = buildDonationConfirmationEmail({
      ...baseDonation,
      frequency: "monthly",
      recurringStatus: "active",
      nextChargeAt: "2026-09-17T08:00:00.000Z",
    });
    expect(message.text).toContain("Your monthly donation was confirmed.");
    expect(message.text).toContain("Frequency: Monthly");
    expect(message.text).toContain("Monthly donation: Active");
    expect(message.text).toContain("Next donation: Sep 17, 2026");
  });

  it("keeps anonymous wording private while still producing the donor message", () => {
    const message = buildDonationConfirmationEmail({ ...baseDonation, isAnonymous: true });
    expect(message.text).toContain("Hello Avery Donor");
    expect(message.text).toContain("shown publicly as Anonymous");
  });

  it("escapes dynamic HTML and strips header newlines from the subject", () => {
    const message = buildDonationConfirmationEmail({
      ...baseDonation,
      donorName: `<img src=x onerror="alert(1)">`,
      campaignTitle: `<script>alert("x")</script>\r\nInjected`,
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.subject).not.toMatch(/[\r\n]/);
  });

  it("ignores payment credentials and secret-shaped fields outside the allowed data model", () => {
    const message = buildDonationConfirmationEmail({
      ...baseDonation,
      client_secret: "client_secret_TEST_SHOULD_NEVER_APPEAR",
      pan: "4111111111111111",
      cvc: "CVC_SECRET_123",
      payment_method: "payment_method_SECRET",
      management_token: "management_token_SECRET",
      resend_key: "RESEND_SECRET",
    } as DonationConfirmationData);
    const rendered = `${message.subject}${message.html}${message.text}`;
    for (const secret of [
      "client_secret_TEST_SHOULD_NEVER_APPEAR", "4111111111111111", "CVC_SECRET_123",
      "payment_method_SECRET", "management_token_SECRET", "RESEND_SECRET",
    ]) expect(rendered).not.toContain(secret);
  });
});

describe("Resend transport", () => {
  it("uses the deterministic provider idempotency key and returns only the message id", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-123", ignored: "recipient@example.com" }), { status: 200 }));
    const result = await sendDonationConfirmation({ apiKey: "test-key", from: "MissionPay <donations@example.com>" }, {
      to: "donor@example.com",
      message: buildDonationConfirmationEmail(baseDonation),
      idempotencyKey: "missionpay-donation-confirmation:donation-123",
    }, fetcher);
    expect(result).toEqual({ providerMessageId: "provider-123" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      "Idempotency-Key": "missionpay-donation-confirmation:donation-123",
    });
  });

  it("fails safely when provider configuration is missing", async () => {
    await expect(sendDonationConfirmation({ apiKey: "", from: "" }, {
      to: "donor@example.com",
      message: buildDonationConfirmationEmail(baseDonation),
      idempotencyKey: "delivery-key",
    })).rejects.toBeInstanceOf(EmailConfigurationError);
  });

  it("classifies transient provider failure without exposing the response body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("RESEND_SECRET recipient@example.com", { status: 503 }));
    let error: unknown;
    try {
      await sendDonationConfirmation({ apiKey: "test-key", from: "MissionPay <donations@example.com>" }, {
        to: "donor@example.com",
        message: buildDonationConfirmationEmail(baseDonation),
        idempotencyKey: "delivery-key",
      }, fetcher);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EmailProviderError);
    expect((error as EmailProviderError).retryable).toBe(true);
    expect(safeDeliveryError(error)).toBe("resend_http_503");
    expect(safeDeliveryError(error)).not.toContain("RESEND_SECRET");
    expect(failedDeliveryUpdate(1, error, Date.parse("2026-08-17T08:00:00Z"))).toEqual({
      status: "failed",
      next_attempt_at: "2026-08-17T08:05:00.000Z",
      last_error: "resend_http_503",
    });
  });
});

describe("worker payment-state isolation", () => {
  it("contains no donation mutation or payment-event dependency", async () => {
    const source = await import("../../supabase/functions/process-donation-emails/index.ts?raw");
    expect(source.default).not.toMatch(/from\(["']donations["']\)\.update/);
    expect(source.default).not.toContain("payment_events");
    expect(source.default).not.toContain("request.json");
  });
});
