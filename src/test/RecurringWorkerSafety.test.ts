import { describe, expect, it } from "vitest";

describe("recurring worker cancellation safety", () => {
  it("selects only active plans and never overwrites a later cancellation", async () => {
    const source = await import("../../supabase/functions/process-recurring-donations/index.ts?raw");
    expect(source.default).toContain('.eq("status", "active")');
    expect(source.default.match(/\.eq\("status", "active"\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source.default).not.toMatch(/\.update\(\{ status: "active"[\s\S]*?\.eq\("id", plan\.id\);/);
    expect(source.default.indexOf("hasRecurringChargeCredentials(plan)")).toBeLessThan(source.default.indexOf('from("donations").insert'));
    expect(source.default).toContain('status: "missing_payment_method"');
  });

  it("uses only the shared sanitized diagnostic for a thrown MIT request", async () => {
    const source = await import("../../supabase/functions/process-recurring-donations/index.ts?raw");
    expect(source.default).toContain("const diagnostic = hyperswitchErrorDiagnostic(paymentError)");
    expect(source.default).toContain("period: periodStart, diagnostic");
    expect(source.default).not.toContain("paymentError.message");
    expect(source.default).not.toContain("paymentError.stack");
    expect(source.default).not.toMatch(/console\.error\([^\n]*paymentError/);
  });
});
