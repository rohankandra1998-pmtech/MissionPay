export type DonationConfirmationData = {
  donationId: string;
  donorName: string;
  campaignTitle: string;
  campaignUrl: string;
  amountCents: number;
  currency: string;
  frequency: "one_time" | "monthly";
  isAnonymous: boolean;
  completedAt: string;
  recurringStatus?: string | null;
  nextChargeAt?: string | null;
  managementUrl?: string | null;
  sandbox: boolean;
};

export type DonationConfirmationMessage = {
  subject: string;
  html: string;
  text: string;
};

type TransactionalEmailConfig = {
  apiKey: string;
  senderName: string;
  senderAddress: string;
  replyTo?: string;
};

type SendRequest = {
  to: string;
  toName: string;
  message: DonationConfirmationMessage;
  idempotencyKey: string;
};

export class EmailConfigurationError extends Error {}

export class EmailProviderError extends Error {
  constructor(public readonly retryable: boolean, public readonly code: string) {
    super(code);
  }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function safeSubject(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 250);
}

function formatAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function buildDonationConfirmationEmail(data: DonationConfirmationData): DonationConfirmationMessage {
  const amount = formatAmount(data.amountCents, data.currency);
  const isActiveMonthly = data.frequency === "monthly" && data.recurringStatus === "active";
  const isCancelledMonthly = data.frequency === "monthly" && data.recurringStatus === "cancelled";
  const title = escapeHtml(data.campaignTitle);
  const greeting = escapeHtml(data.donorName.trim() || "Supporter");
  const reference = escapeHtml(data.donationId);
  const campaignUrl = escapeHtml(data.campaignUrl);
  const sandboxNotice = data.sandbox
    ? `<div style="margin:24px 0;padding:14px 16px;border-radius:10px;background:#fff4e8;color:#6b3b12"><strong>Sandbox transaction</strong><br>This was a sandbox/test transaction. No real money moved.</div>`
    : "";
  const anonymousNotice = data.isAnonymous
    ? `<p style="color:#4d5358">Your donation is shown publicly as Anonymous.</p>`
    : "";
  const nextDonation = isActiveMonthly && data.nextChargeAt
    ? `<tr><td style="padding:7px 0;color:#687076">Next donation</td><td style="padding:7px 0;text-align:right;font-weight:600">${escapeHtml(formatDate(data.nextChargeAt))}</td></tr>`
    : "";
  const monthlyStatus = data.frequency === "monthly"
    ? `<tr><td style="padding:7px 0;color:#687076">Monthly donation</td><td style="padding:7px 0;text-align:right;font-weight:600">${isActiveMonthly ? "Active" : isCancelledMonthly ? "Cancelled — no future charges" : "Past due — no future charge scheduled"}</td></tr>`
    : "";
  const managementUrl = data.frequency === "monthly" && data.managementUrl ? escapeHtml(data.managementUrl) : null;
  const managementAction = managementUrl
    ? `<p style="margin:28px 0 0"><a href="${managementUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#d85f49;color:#fff;text-decoration:none">Manage monthly donation</a></p>`
    : "";
  const subjectPrefix = data.sandbox ? "[MissionPay Sandbox] " : "";
  const subject = safeSubject(`${subjectPrefix}Donation confirmed — ${data.campaignTitle}`);
  const frequency = data.frequency === "monthly" ? "Monthly" : "One-time";

  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;color:#17211d;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:16px;padding:32px"><p style="margin:0 0 24px;font-weight:700;color:#145c46">MissionPay</p><h1 style="margin:0 0 16px;font-size:28px">Donation confirmed</h1><p>Hello ${greeting},</p><p>Thank you for supporting <strong>${title}</strong>.</p>${sandboxNotice}<table style="width:100%;margin:24px 0;border-collapse:collapse"><tr><td style="padding:7px 0;color:#687076">${data.frequency === "monthly" ? "Amount today" : "Amount"}</td><td style="padding:7px 0;text-align:right;font-weight:600">${escapeHtml(amount)} ${escapeHtml(data.currency)}</td></tr><tr><td style="padding:7px 0;color:#687076">Frequency</td><td style="padding:7px 0;text-align:right;font-weight:600">${frequency}</td></tr>${monthlyStatus}${nextDonation}<tr><td style="padding:7px 0;color:#687076">Status</td><td style="padding:7px 0;text-align:right;font-weight:600">Confirmed</td></tr><tr><td style="padding:7px 0;color:#687076">MissionPay reference</td><td style="padding:7px 0;text-align:right;font-family:monospace">${reference}</td></tr><tr><td style="padding:7px 0;color:#687076">Confirmed</td><td style="padding:7px 0;text-align:right">${escapeHtml(formatTimestamp(data.completedAt))}</td></tr></table>${anonymousNotice}<p style="color:#4d5358">Your payment was confirmed securely through MissionPay's payment flow.</p>${managementAction}<p style="margin:16px 0 0"><a href="${campaignUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#17211d;color:#fff;text-decoration:none">View campaign</a></p></div></div></body></html>`;

  const lines = [
    "MissionPay", "", data.frequency === "monthly" ? "Your monthly donation was confirmed." : "Donation confirmed", "",
    `Hello ${data.donorName.trim() || "Supporter"},`, `Thank you for supporting: ${data.campaignTitle}`, "",
    data.sandbox ? "SANDBOX TRANSACTION: This was a sandbox/test transaction. No real money moved." : "",
    `${data.frequency === "monthly" ? "Amount today" : "Amount"}: ${amount} ${data.currency}`,
    `Frequency: ${frequency}`,
    data.frequency === "monthly" ? `Monthly donation: ${isActiveMonthly ? "Active" : isCancelledMonthly ? "Cancelled — no future charges" : "Past due — no future charge scheduled"}` : "",
    isActiveMonthly && data.nextChargeAt ? `Next donation: ${formatDate(data.nextChargeAt)}` : "",
    "Status: Confirmed", `MissionPay reference: ${data.donationId}`, `Confirmed: ${formatTimestamp(data.completedAt)}`,
    data.isAnonymous ? "Your donation is shown publicly as Anonymous." : "", "",
    "Your payment was confirmed securely through MissionPay's payment flow.",
    data.frequency === "monthly" && data.managementUrl ? `Manage monthly donation: ${data.managementUrl}` : "",
    `View campaign: ${data.campaignUrl}`,
  ].filter((line) => line !== "");

  return { subject, html, text: lines.join("\n") };
}

function validateServerHeader(value: string, label: string) {
  if (!value.trim() || /[\r\n]/.test(value)) throw new EmailConfigurationError(`${label}_invalid`);
}

function safeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 250);
}

function validateUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new EmailConfigurationError(`${label}_invalid`);
  }
}

export async function sendDonationConfirmation(
  config: TransactionalEmailConfig,
  request: SendRequest,
  fetcher: typeof fetch = fetch,
) {
  if (!config.apiKey) throw new EmailConfigurationError("brevo_api_key_missing");
  validateServerHeader(config.senderName, "email_from_name");
  validateServerHeader(config.senderAddress, "email_from_address");
  if (config.replyTo) validateServerHeader(config.replyTo, "email_reply_to");
  validateServerHeader(request.to, "email_recipient");
  validateUuid(request.idempotencyKey, "brevo_idempotency_key");

  let response: Response;
  try {
    response = await fetcher("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: config.senderName, email: config.senderAddress },
        to: [{ email: request.to, name: safeHeaderValue(request.toName) }],
        subject: request.message.subject,
        htmlContent: request.message.html,
        textContent: request.message.text,
        headers: { idempotencyKey: request.idempotencyKey },
        ...(config.replyTo ? { replyTo: { email: config.replyTo } } : {}),
      }),
    });
  } catch {
    throw new EmailProviderError(true, "brevo_network_error");
  }

  if (!response.ok) {
    const code = `brevo_http_${response.status}`;
    throw new EmailProviderError(response.status === 408 || response.status === 429 || response.status >= 500, code);
  }
  const payload = await response.json().catch(() => ({})) as { messageId?: unknown };
  if (typeof payload.messageId !== "string" || !payload.messageId) {
    throw new EmailProviderError(true, "brevo_response_invalid");
  }
  return { providerMessageId: payload.messageId };
}

export function safeDeliveryError(error: unknown) {
  if (error instanceof EmailProviderError || error instanceof EmailConfigurationError) return error.message.slice(0, 500);
  return "email_delivery_unavailable";
}

export function failedDeliveryUpdate(attemptCount: number, error: unknown, now = Date.now()) {
  const retryable = error instanceof EmailProviderError ? error.retryable : !(error instanceof EmailConfigurationError);
  const retryMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1) * 5);
  return {
    status: "failed" as const,
    ...(!retryable ? { attempt_count: 5 } : {}),
    next_attempt_at: new Date(now + retryMinutes * 60_000).toISOString(),
    last_error: safeDeliveryError(error),
  };
}
