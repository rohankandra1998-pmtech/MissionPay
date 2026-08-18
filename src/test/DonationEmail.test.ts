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
      access_token_hash: "access_token_SECRET",
      status_token: "status_token_SECRET",
      brevo_key: "BREVO_API_SECRET_DO_NOT_LEAK",
    } as DonationConfirmationData);
    const rendered = `${message.subject}${message.html}${message.text}`;
    for (const secret of [
      "client_secret_TEST_SHOULD_NEVER_APPEAR", "4111111111111111", "CVC_SECRET_123",
      "payment_method_SECRET", "management_token_SECRET", "access_token_SECRET",
      "status_token_SECRET", "BREVO_API_SECRET_DO_NOT_LEAK",
    ]) expect(rendered).not.toContain(secret);
  });
});

describe("Brevo transport", () => {
  const config = {
    apiKey: "BREVO_API_SECRET_DO_NOT_LEAK",
    senderName: "MissionPay",
    senderAddress: "verified-sender@example.com",
    replyTo: "support@example.com",
  };

  const request = {
    to: "donor@example.com",
    toName: "Avery Donor",
    message: buildDonationConfirmationEmail(baseDonation),
    idempotencyKey: "89f9d4c1-5e8a-4c62-9c6e-d46e9b0e7dc2",
  };

  it("uses Brevo's single-email endpoint and official payload shape", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      messageId: "provider-123",
      ignored: "recipient@example.com",
    }), { status: 201 }));
    const result = await sendDonationConfirmation(config, request, fetcher);

    expect(result).toEqual({ providerMessageId: "provider-123" });
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.brevo.com/v3/smtp/email");

    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "api-key": config.apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      sender: { name: "MissionPay", email: "verified-sender@example.com" },
      to: [{ email: "donor@example.com", name: "Avery Donor" }],
      subject: request.message.subject,
      htmlContent: request.message.html,
      textContent: request.message.text,
      headers: { idempotencyKey: "89f9d4c1-5e8a-4c62-9c6e-d46e9b0e7dc2" },
      replyTo: { email: "support@example.com" },
    });
    expect(String(init.body)).not.toContain(config.apiKey);
    expect(request.message.html).not.toContain(config.apiKey);
    expect(request.message.text).not.toContain(config.apiKey);
  });

  it("sends only safe confirmation fields and no payment credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "provider-456" }), { status: 201 }));
    await sendDonationConfirmation(config, request, fetcher);
    const payload = String(fetcher.mock.calls[0][1]?.body);
    for (const secret of [
      "4111111111111111", "CVC_SECRET_123", "client_secret_TEST",
      "payment_method_SECRET", "management_token_SECRET", "status_token_SECRET",
      "access_token_SECRET",
    ]) expect(payload).not.toContain(secret);
  });

  it("fails safely when BREVO_API_KEY is missing", async () => {
    let error: unknown;
    try {
      await sendDonationConfirmation({ ...config, apiKey: "" }, request);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EmailConfigurationError);
    expect(safeDeliveryError(error)).toBe("brevo_api_key_missing");
    expect(failedDeliveryUpdate(1, error, Date.parse("2026-08-17T08:00:00Z"))).toEqual({
      status: "failed",
      attempt_count: 5,
      next_attempt_at: "2026-08-17T08:05:00.000Z",
      last_error: "brevo_api_key_missing",
    });
  });

  it.each([
    [401, false],
    [429, true],
    [503, true],
  ])("classifies HTTP %i safely (retryable: %s)", async (status, retryable) => {
    const sensitiveResponse = "BREVO_API_SECRET_DO_NOT_LEAK 4111111111111111 client_secret_TEST";
    const fetcher = vi.fn().mockResolvedValue(new Response(sensitiveResponse, { status }));
    let error: unknown;
    try {
      await sendDonationConfirmation(config, request, fetcher);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EmailProviderError);
    expect((error as EmailProviderError).retryable).toBe(retryable);
    expect(safeDeliveryError(error)).toBe(`brevo_http_${status}`);
    expect(safeDeliveryError(error)).not.toContain(sensitiveResponse);
    const update = failedDeliveryUpdate(1, error, Date.parse("2026-08-17T08:00:00Z"));
    expect(update.last_error).toBe(`brevo_http_${status}`);
    expect("attempt_count" in update).toBe(!retryable);
  });

  it("sanitizes recipient display-name newlines and rejects configured header injection", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "provider-789" }), { status: 201 }));
    await sendDonationConfirmation(config, { ...request, toName: "Avery\r\nBcc: victim@example.com" }, fetcher);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.to[0].name).toBe("Avery Bcc: victim@example.com");
    await expect(sendDonationConfirmation({ ...config, senderName: "MissionPay\r\nBcc: victim@example.com" }, request, fetcher))
      .rejects.toBeInstanceOf(EmailConfigurationError);
  });
});

describe("worker payment-state isolation", () => {
  it("contains no donation mutation or payment-event dependency", async () => {
    const source = await import("../../supabase/functions/process-donation-emails/index.ts?raw");
    expect(source.default).not.toMatch(/from\(["']donations["']\)\.update/);
    expect(source.default).not.toContain("payment_events");
    expect(source.default).not.toContain("request.json");
    expect(source.default).not.toContain("VITE_BREVO");
    expect(source.default).toContain("idempotencyKey: delivery.id");
  });
});
