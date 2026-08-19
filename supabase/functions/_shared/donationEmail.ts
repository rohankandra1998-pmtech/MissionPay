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
  recurringPaymentMethodReady?: boolean;
  nextChargeAt?: string | null;
  managementUrl?: string | null;
  refundUrl: string;
  sandbox: boolean;
};

export type TransactionalEmailMessage = {
  subject: string;
  html: string;
  text: string;
};

export type DonationConfirmationMessage = TransactionalEmailMessage;

export type RefundNotificationData = {
  donationId: string;
  donorName: string;
  campaignTitle: string;
  campaignUrl: string;
  amountCents: number;
  currency: string;
  frequency: "one_time" | "monthly";
  eventAt: string;
  decisionNote?: string | null;
  sandbox: boolean;
};

export type RecurringCancellationData = {
  donorName: string;
  campaignTitle: string;
  campaignUrl: string;
  amountCents: number;
  currency: string;
  cancelledAt: string;
  sandbox: boolean;
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
  message: TransactionalEmailMessage;
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
  const isActiveMonthly = data.frequency === "monthly" && data.recurringStatus === "active" && data.recurringPaymentMethodReady === true;
  const isCancelledMonthly = data.frequency === "monthly" && data.recurringStatus === "cancelled";
  const isIncompleteMonthly = data.frequency === "monthly" && !isCancelledMonthly && data.recurringPaymentMethodReady !== true;
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
    ? `<tr><td style="padding:7px 0;color:#687076">Monthly donation</td><td style="padding:7px 0;text-align:right;font-weight:600">${isActiveMonthly ? "Active" : isCancelledMonthly ? "Cancelled — no future charges" : isIncompleteMonthly ? "Setup incomplete — no future charges scheduled" : "Past due — no future charge scheduled"}</td></tr>`
    : "";
  const managementUrl = data.frequency === "monthly" && data.managementUrl ? escapeHtml(data.managementUrl) : null;
  const managementAction = managementUrl
    ? `<p style="margin:28px 0 0"><a href="${managementUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#d85f49;color:#fff;text-decoration:none">Manage monthly donation</a></p><p style="margin:8px 0;color:#4d5358;font-size:14px">Controls future automatic donations.</p>`
    : "";
  const refundUrl = escapeHtml(data.refundUrl);
  const refundAction = `<p style="margin:16px 0 0"><a href="${refundUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;border:1px solid #17211d;color:#17211d;text-decoration:none">Request a refund</a></p>${data.frequency === "monthly" ? `<p style="margin:8px 0;color:#4d5358;font-size:14px">Requests a refund for this completed charge only. It does not cancel future monthly donations.</p>` : ""}`;
  const subjectPrefix = data.sandbox ? "[MissionPay Sandbox] " : "";
  const subject = safeSubject(`${subjectPrefix}Donation confirmed — ${data.campaignTitle}`);
  const frequency = data.frequency === "monthly" ? "Monthly" : "One-time";

  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;color:#17211d;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:16px;padding:32px"><p style="margin:0 0 24px;font-weight:700;color:#145c46">MissionPay</p><h1 style="margin:0 0 16px;font-size:28px">Donation confirmed</h1><p>Hello ${greeting},</p><p>Thank you for supporting <strong>${title}</strong>.</p>${sandboxNotice}<table style="width:100%;margin:24px 0;border-collapse:collapse"><tr><td style="padding:7px 0;color:#687076">${data.frequency === "monthly" ? "Amount today" : "Amount"}</td><td style="padding:7px 0;text-align:right;font-weight:600">${escapeHtml(amount)} ${escapeHtml(data.currency)}</td></tr><tr><td style="padding:7px 0;color:#687076">Frequency</td><td style="padding:7px 0;text-align:right;font-weight:600">${frequency}</td></tr>${monthlyStatus}${nextDonation}<tr><td style="padding:7px 0;color:#687076">Status</td><td style="padding:7px 0;text-align:right;font-weight:600">Confirmed</td></tr><tr><td style="padding:7px 0;color:#687076">MissionPay reference</td><td style="padding:7px 0;text-align:right;font-family:monospace">${reference}</td></tr><tr><td style="padding:7px 0;color:#687076">Confirmed</td><td style="padding:7px 0;text-align:right">${escapeHtml(formatTimestamp(data.completedAt))}</td></tr></table>${anonymousNotice}<p style="color:#4d5358">Your payment was confirmed securely through MissionPay's payment flow.</p>${managementAction}<p style="margin:16px 0 0"><a href="${campaignUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#17211d;color:#fff;text-decoration:none">View campaign</a></p>${refundAction}</div></div></body></html>`;

  const lines = [
    "MissionPay", "", data.frequency === "monthly" ? "Your monthly donation was confirmed." : "Donation confirmed", "",
    `Hello ${data.donorName.trim() || "Supporter"},`, `Thank you for supporting: ${data.campaignTitle}`, "",
    data.sandbox ? "SANDBOX TRANSACTION: This was a sandbox/test transaction. No real money moved." : "",
    `${data.frequency === "monthly" ? "Amount today" : "Amount"}: ${amount} ${data.currency}`,
    `Frequency: ${frequency}`,
    data.frequency === "monthly" ? `Monthly donation: ${isActiveMonthly ? "Active" : isCancelledMonthly ? "Cancelled — no future charges" : isIncompleteMonthly ? "Setup incomplete — no future charges scheduled" : "Past due — no future charge scheduled"}` : "",
    isActiveMonthly && data.nextChargeAt ? `Next donation: ${formatDate(data.nextChargeAt)}` : "",
    "Status: Confirmed", `MissionPay reference: ${data.donationId}`, `Confirmed: ${formatTimestamp(data.completedAt)}`,
    data.isAnonymous ? "Your donation is shown publicly as Anonymous." : "", "",
    "Your payment was confirmed securely through MissionPay's payment flow.",
    data.frequency === "monthly" && data.managementUrl ? `Manage monthly donation: ${data.managementUrl}` : "",
    data.frequency === "monthly" ? "Manage monthly donation controls future automatic donations." : "",
    `View campaign: ${data.campaignUrl}`,
    `Request a refund: ${data.refundUrl}`,
    data.frequency === "monthly" ? "A refund request applies only to this completed charge. It does not cancel future monthly donations." : "",
  ].filter((line) => line !== "");

  return { subject, html, text: lines.join("\n") };
}

type LifecycleTemplate = {
  heading: string;
  intro: string;
  status: string;
  timestampLabel: string;
  monthlyNotice?: string;
  decisionNote?: string | null;
  subject: string;
};

function sandboxNotice(sandbox: boolean) {
  return sandbox
    ? `<div style="margin:24px 0;padding:14px 16px;border-radius:10px;background:#fff4e8;color:#6b3b12"><strong>Sandbox transaction</strong><br>This was a sandbox/test transaction. No real money moved.</div>`
    : "";
}

function buildRefundLifecycleEmail(data: RefundNotificationData, template: LifecycleTemplate): TransactionalEmailMessage {
  const amount = formatAmount(data.amountCents, data.currency);
  const greeting = escapeHtml(data.donorName.trim() || "Supporter");
  const campaignTitle = escapeHtml(data.campaignTitle);
  const campaignUrl = escapeHtml(data.campaignUrl);
  const reference = escapeHtml(data.donationId);
  const monthlyHtml = data.frequency === "monthly" && template.monthlyNotice
    ? `<p style="color:#4d5358">${escapeHtml(template.monthlyNotice)}</p>`
    : "";
  const note = template.decisionNote?.trim();
  const noteHtml = note
    ? `<div style="margin:20px 0;padding:14px 16px;border-radius:10px;background:#f6f3ee"><strong>Decision note</strong><br>${escapeHtml(note)}</div>`
    : "";
  const subjectPrefix = data.sandbox ? "[MissionPay Sandbox] " : "";
  const subject = safeSubject(`${subjectPrefix}${template.subject} — ${data.campaignTitle}`);
  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;color:#17211d;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:16px;padding:32px"><p style="margin:0 0 24px;font-weight:700;color:#145c46">MissionPay</p><h1 style="margin:0 0 16px;font-size:28px">${escapeHtml(template.heading)}</h1><p>Hello ${greeting},</p><p>${escapeHtml(template.intro)}</p>${sandboxNotice(data.sandbox)}<table style="width:100%;margin:24px 0;border-collapse:collapse"><tr><td style="padding:7px 0;color:#687076">Campaign</td><td style="padding:7px 0;text-align:right;font-weight:600">${campaignTitle}</td></tr><tr><td style="padding:7px 0;color:#687076">Amount</td><td style="padding:7px 0;text-align:right;font-weight:600">${escapeHtml(amount)} ${escapeHtml(data.currency)}</td></tr><tr><td style="padding:7px 0;color:#687076">Status</td><td style="padding:7px 0;text-align:right;font-weight:600">${escapeHtml(template.status)}</td></tr><tr><td style="padding:7px 0;color:#687076">MissionPay reference</td><td style="padding:7px 0;text-align:right;font-family:monospace">${reference}</td></tr><tr><td style="padding:7px 0;color:#687076">${escapeHtml(template.timestampLabel)}</td><td style="padding:7px 0;text-align:right">${escapeHtml(formatTimestamp(data.eventAt))}</td></tr></table>${noteHtml}${monthlyHtml}<p style="margin:24px 0 0"><a href="${campaignUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#17211d;color:#fff;text-decoration:none">View campaign</a></p></div></div></body></html>`;
  const lines = [
    "MissionPay", "", template.heading, "", `Hello ${data.donorName.trim() || "Supporter"},`, template.intro, "",
    data.sandbox ? "SANDBOX TRANSACTION: This was a sandbox/test transaction. No real money moved." : "",
    `Campaign: ${data.campaignTitle}`, `Amount: ${amount} ${data.currency}`, `Status: ${template.status}`,
    `MissionPay reference: ${data.donationId}`, `${template.timestampLabel}: ${formatTimestamp(data.eventAt)}`,
    note ? `Decision note: ${note}` : "",
    data.frequency === "monthly" && template.monthlyNotice ? template.monthlyNotice : "",
    `View campaign: ${data.campaignUrl}`,
  ].filter((line) => line !== "");
  return { subject, html, text: lines.join("\n") };
}

export function buildRefundRequestedEmail(data: RefundNotificationData) {
  return buildRefundLifecycleEmail(data, {
    heading: "Refund request received",
    intro: "MissionPay received your refund request. It is pending review and has not yet been approved.",
    status: "Pending review",
    timestampLabel: "Requested",
    monthlyNotice: "This refund request applies only to this completed charge. Your monthly donation remains active unless you cancel it separately.",
    subject: "Refund request received",
  });
}

export function buildRefundApprovedEmail(data: RefundNotificationData) {
  return buildRefundLifecycleEmail(data, {
    heading: "Refund request approved",
    intro: "Your refund request has been approved. Your refund is being processed.",
    status: "Approved",
    timestampLabel: "Approved",
    monthlyNotice: "This refund does not cancel future monthly donations.",
    decisionNote: data.decisionNote,
    subject: "Refund request approved",
  });
}

export function buildRefundDeclinedEmail(data: RefundNotificationData) {
  return buildRefundLifecycleEmail(data, {
    heading: "Refund request declined",
    intro: "MissionPay reviewed your refund request and it was declined. No refund has been initiated for this request.",
    status: "Declined",
    timestampLabel: "Decided",
    monthlyNotice: "This decision does not change your monthly donation plan.",
    decisionNote: data.decisionNote,
    subject: "Refund request declined",
  });
}

export function buildRefundCompletedEmail(data: RefundNotificationData) {
  const intro = data.sandbox
    ? "MissionPay completed this sandbox refund record. This was a test; no real money moved."
    : "The payment provider has completed your refund. Your bank or card may need additional time to display the credit.";
  return buildRefundLifecycleEmail(data, {
    heading: "Refund completed",
    intro,
    status: "Refund completed",
    timestampLabel: "Completed",
    monthlyNotice: "This refunded only this charge. Future monthly donations remain scheduled unless you cancel the monthly donation separately.",
    subject: "Refund completed",
  });
}

export function buildRecurringCancellationEmail(data: RecurringCancellationData): TransactionalEmailMessage {
  const amount = formatAmount(data.amountCents, data.currency);
  const greeting = escapeHtml(data.donorName.trim() || "Supporter");
  const title = escapeHtml(data.campaignTitle);
  const campaignUrl = escapeHtml(data.campaignUrl);
  const subjectPrefix = data.sandbox ? "[MissionPay Sandbox] " : "";
  const subject = safeSubject(`${subjectPrefix}Monthly donation cancelled — ${data.campaignTitle}`);
  const distinction = "Cancelling your monthly donation stops future automatic charges. It does not refund donations that were already completed.";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;color:#17211d;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:16px;padding:32px"><p style="margin:0 0 24px;font-weight:700;color:#145c46">MissionPay</p><h1 style="margin:0 0 16px;font-size:28px">Monthly donation cancelled</h1><p>Hello ${greeting},</p><p>Your monthly donation to <strong>${title}</strong> has been cancelled. No future automatic donations will be scheduled from this recurring plan.</p>${sandboxNotice(data.sandbox)}<table style="width:100%;margin:24px 0;border-collapse:collapse"><tr><td style="padding:7px 0;color:#687076">Monthly amount</td><td style="padding:7px 0;text-align:right;font-weight:600">${escapeHtml(amount)} ${escapeHtml(data.currency)}</td></tr><tr><td style="padding:7px 0;color:#687076">Status</td><td style="padding:7px 0;text-align:right;font-weight:600">Cancelled</td></tr><tr><td style="padding:7px 0;color:#687076">Cancelled</td><td style="padding:7px 0;text-align:right">${escapeHtml(formatTimestamp(data.cancelledAt))}</td></tr></table><p style="color:#4d5358">${escapeHtml(distinction)}</p><p style="margin:24px 0 0"><a href="${campaignUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#17211d;color:#fff;text-decoration:none">View campaign</a></p></div></div></body></html>`;
  const lines = [
    "MissionPay", "", "Monthly donation cancelled", "", `Hello ${data.donorName.trim() || "Supporter"},`,
    `Your monthly donation to ${data.campaignTitle} has been cancelled. No future automatic donations will be scheduled from this recurring plan.`,
    data.sandbox ? "SANDBOX TRANSACTION: This was a sandbox/test plan. No real money moved." : "",
    `Monthly amount: ${amount} ${data.currency}`, "Status: Cancelled", `Cancelled: ${formatTimestamp(data.cancelledAt)}`,
    distinction, `View campaign: ${data.campaignUrl}`,
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

export async function sendTransactionalEmail(
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

export const sendDonationConfirmation = sendTransactionalEmail;

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
