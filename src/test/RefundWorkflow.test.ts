import { describe, expect, it, vi } from "vitest";
import { authorizePlatformAdmin } from "../../supabase/functions/_shared/platformAdmin";
import { isDuplicateProviderEvent, shouldResumeDuplicateProviderEvent } from "../../supabase/functions/_shared/providerEvents";
import {
  buildLocalRefundIdentity,
  buildRefundPayload,
  providerRefundId,
  refundEligibility,
  refundReconciliationUpdate,
  refundRequestSubmissionDecision,
  sanitizedRefundEventPayload,
  shouldApplyRefundUpdate,
  validateRefundDetails,
} from "../../supabase/functions/_shared/refunds";
import lifecycleEmailMigration from "../../supabase/migrations/20260819040000_add_donor_lifecycle_email_notifications.sql?raw";

const requestId = "20000000-0000-4000-8000-000000000123";

describe("refund request eligibility and idempotency", () => {
  it("allows only succeeded donations with a provider payment", () => {
    expect(refundEligibility({ status: "succeeded", hyperswitch_payment_id: "pay_123" })).toBe("eligible");
    for (const status of ["pending", "processing", "failed", "cancelled"]) {
      expect(refundEligibility({ status, hyperswitch_payment_id: "pay_123" })).toBe("ineligible");
    }
    expect(refundEligibility({ status: "succeeded", hyperswitch_payment_id: null })).toBe("ineligible");
    expect(refundEligibility({ status: "refunded", hyperswitch_payment_id: "pay_123" })).toBe("refunded");
  });

  it("returns an existing request instead of creating a duplicate", () => {
    const donation = { status: "succeeded", hyperswitch_payment_id: "pay_123" };
    expect(refundRequestSubmissionDecision(donation, { id: requestId })).toBe("existing");
    expect(refundRequestSubmissionDecision(donation, null)).toBe("create");
  });

  it("validates server-side explanation limits", () => {
    expect(validateRefundDetails("other", "")).toHaveProperty("error");
    expect(validateRefundDetails("duplicate", "x".repeat(501))).toHaveProperty("error");
    expect(validateRefundDetails("duplicate", " accidental duplicate ")).toEqual({ details: "accidental duplicate" });
  });
});

describe("platform admin authorization", () => {
  it("rejects unauthenticated and normal fundraiser callers", async () => {
    await expect(authorizePlatformAdmin(async () => null, vi.fn())).resolves.toEqual({ ok: false, reason: "unauthenticated" });
    await expect(authorizePlatformAdmin(async () => "fundraiser-1", async () => false)).resolves.toEqual({ ok: false, reason: "forbidden" });
  });

  it("allows a database-backed platform admin", async () => {
    await expect(authorizePlatformAdmin(async () => "admin-1", async (id) => id === "admin-1")).resolves.toEqual({ ok: true, userId: "admin-1" });
  });
});

describe("Hyperswitch full-refund payload", () => {
  it("uses authoritative full amount/payment, instant type, mapped reason, and metadata", () => {
    expect(buildRefundPayload({ donationId: "donation-1", refundRequestId: requestId, paymentId: "pay_authoritative", amountCents: 5000, reason: "unauthorized" })).toEqual({
      payment_id: "pay_authoritative",
      refund_id: providerRefundId(requestId),
      amount: 5000,
      refund_type: "instant",
      reason: "fraudulent",
      metadata: { missionpay_donation_id: "donation-1", missionpay_refund_request_id: requestId },
    });
  });

  it("reuses one stable provider refund identity across retries", () => {
    expect(providerRefundId(requestId)).toBe("ref_20000000000040008000000000000123");
    expect(providerRefundId(requestId)).toBe(providerRefundId(requestId));
  });

  it("reuses one local refund identity across repeated approval execution", () => {
    const input = { donationId: "donation-1", refundRequestId: requestId, paymentId: "pay_authoritative", amountCents: 5000, currency: "USD", reason: "duplicate" as const };
    expect(buildLocalRefundIdentity(input)).toEqual(buildLocalRefundIdentity(input));
    expect(buildLocalRefundIdentity(input)).toMatchObject({ id: requestId, refund_request_id: requestId, donation_id: "donation-1", status: "initiating" });
  });

  it("recognizes duplicate provider events before financial reprocessing", () => {
    expect(isDuplicateProviderEvent({ code: "23505" })).toBe(true);
    expect(isDuplicateProviderEvent({ code: "PGRST116" })).toBe(false);
    expect(shouldResumeDuplicateProviderEvent(null)).toBe(true);
    expect(shouldResumeDuplicateProviderEvent("2026-08-19T01:00:00Z")).toBe(false);
  });

  it("stores only safe refund webhook fields", () => {
    const stored = sanitizedRefundEventPayload({ event_id: "evt_1", type: "refund_failed", timestamp: "2026-08-19T01:00:00Z" }, { refund_id: "ref_1", payment_id: "pay_1", amount: 5000, currency: "USD", status: "failed", error_code: "safe_code", error_message: "sensitive issuer prose", raw_connector_response: "do-not-store" });
    expect(stored).toMatchObject({ event_id: "evt_1", content: { object: { refund_id: "ref_1", error_code: "safe_code" } } });
    expect(JSON.stringify(stored)).not.toContain("sensitive issuer prose");
    expect(JSON.stringify(stored)).not.toContain("do-not-store");
  });
});

describe("refund reconciliation", () => {
  it.each(["pending", "review", "failed"] as const)("keeps donation completion separate for %s", (status) => {
    const update = refundReconciliationUpdate("initiating", { status, updated_at: "2026-08-19T01:00:00.000Z", error_code: "safe_code" });
    expect(update).toMatchObject({ status, completed_at: null });
  });

  it("marks only succeeded refunds complete", () => {
    expect(refundReconciliationUpdate("pending", { status: "succeeded", updated_at: "2026-08-19T02:00:00.000Z" })).toMatchObject({ status: "succeeded", completed_at: "2026-08-19T02:00:00.000Z" });
  });

  it("cannot regress a succeeded refund or apply an older provider update", () => {
    expect(refundReconciliationUpdate("succeeded", { status: "failed" })).toBeNull();
    expect(shouldApplyRefundUpdate("pending", "2026-08-19T03:00:00.000Z", new Date("2026-08-19T02:00:00.000Z"))).toBe(false);
    expect(shouldApplyRefundUpdate("succeeded", null, new Date())).toBe(false);
  });

  it("does not contain any recurring-plan mutation", () => {
    const update = refundReconciliationUpdate("pending", { status: "succeeded", updated_at: "2026-08-19T02:00:00.000Z" });
    expect(update).not.toHaveProperty("recurring_donation_id");
    expect(update).not.toHaveProperty("next_charge_at");
    expect(update).not.toHaveProperty("hyperswitch_payment_method_reference");
  });
});

describe("database-driven donor lifecycle email enqueueing", () => {
  it("adds every notification type while preserving donation confirmation", () => {
    for (const type of [
      "refund_requested", "refund_approved", "refund_declined", "refund_completed", "recurring_cancelled",
    ]) expect(lifecycleEmailMigration).toContain(`add value if not exists '${type}'`);
    expect(lifecycleEmailMigration).toContain("'donation_confirmation'");
  });

  it("queues one request email on insert and decision emails only on pending transitions", () => {
    expect(lifecycleEmailMigration).toContain("if tg_op = 'INSERT' then");
    expect(lifecycleEmailMigration).toContain("target_type := 'refund_requested'");
    expect(lifecycleEmailMigration).toContain("old.status = 'pending' and new.status = 'approved'");
    expect(lifecycleEmailMigration).toContain("target_type := 'refund_approved'");
    expect(lifecycleEmailMigration).toContain("old.status = 'pending' and new.status = 'declined'");
    expect(lifecycleEmailMigration).toContain("target_type := 'refund_declined'");
  });

  it("queues completion only from an authoritative refund succeeded transition", () => {
    expect(lifecycleEmailMigration).toContain("create trigger enqueue_refund_completed_email_after_success");
    expect(lifecycleEmailMigration).toMatch(/new\.status = 'succeeded'[\s\S]*old\.status is distinct from 'succeeded'[\s\S]*'refund_completed'/);
    const requestTrigger = lifecycleEmailMigration.slice(
      lifecycleEmailMigration.indexOf("private.enqueue_refund_request_email"),
      lifecycleEmailMigration.indexOf("private.enqueue_refund_completed_email"),
    );
    expect(requestTrigger).not.toContain("refund_completed");
  });

  it("queues cancellation only on a non-cancelled to cancelled plan transition", () => {
    expect(lifecycleEmailMigration).toContain("old.status is distinct from 'cancelled' and new.status = 'cancelled'");
    expect(lifecycleEmailMigration).toContain("values (new.id, 'recurring_cancelled')");
  });

  it("uses durable per-scope uniqueness and conflict-safe inserts", () => {
    expect(lifecycleEmailMigration).toContain("donation_email_deliveries_donation_type_unique");
    expect(lifecycleEmailMigration).toContain("donation_email_deliveries_recurring_type_unique");
    expect(lifecycleEmailMigration.match(/on conflict \(/g)).toHaveLength(4);
    expect(lifecycleEmailMigration.match(/do nothing;/g)).toHaveLength(4);
    expect(lifecycleEmailMigration).toContain("FOR UPDATE SKIP LOCKED".toLowerCase());
    expect(lifecycleEmailMigration).toContain("delivery.attempt_count < 5");
    expect(lifecycleEmailMigration).toContain("interval '10 minutes'");
  });

  it("enforces donation versus recurring-plan outbox scope", () => {
    expect(lifecycleEmailMigration).toContain("donation_email_delivery_scope_matches_type");
    expect(lifecycleEmailMigration).toContain("donation_id is not null");
    expect(lifecycleEmailMigration).toContain("recurring_donation_id is not null");
    expect(lifecycleEmailMigration).toContain("references public.recurring_donations(id)");
  });
});
