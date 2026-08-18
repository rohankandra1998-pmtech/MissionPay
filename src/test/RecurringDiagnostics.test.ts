import { describe, expect, it } from "vitest";
import { formatDevRecurringResult } from "../lib/devRecurringDiagnostic";
import { HyperswitchError, hyperswitchErrorDiagnostic } from "../../supabase/functions/_shared/hyperswitch";

describe("safe MIT failure diagnostics", () => {
  it("keeps only safe Hyperswitch machine metadata", () => {
    const diagnostic = hyperswitchErrorDiagnostic(new HyperswitchError("provider", "IR_TEST", 400));
    expect(diagnostic).toEqual({ provider: "hyperswitch", kind: "provider", code: "IR_TEST", status: 400 });
    expect(Object.keys(diagnostic).sort()).toEqual(["code", "kind", "provider", "status"]);
  });

  it("does not expose arbitrary raw Error messages", () => {
    const diagnostic = hyperswitchErrorDiagnostic(new Error("private provider prose PAN 4111111111111111 CVV 123"));
    const serialized = JSON.stringify(diagnostic);
    expect(diagnostic).toEqual({ provider: "hyperswitch", kind: "internal", code: "unknown", status: null });
    expect(serialized).not.toMatch(/private provider prose|4111111111111111|CVV|123/);
  });

  it("formats all four diagnostic fields for the development harness", () => {
    expect(formatDevRecurringResult({
      status: "failed",
      diagnostic: { provider: "hyperswitch", kind: "provider", code: "IR_TEST", status: 400 },
    })).toBe("MIT failed — Hyperswitch provider error IR_TEST (HTTP 400).");
  });

  it("ignores unrelated raw fields when formatting a failure", () => {
    const result = {
      status: "failed",
      diagnostic: { provider: "hyperswitch", kind: "network", code: "unknown", status: null },
      raw_error: "private provider response and card details",
    };
    const message = formatDevRecurringResult(result);
    expect(message).toBe("MIT failed — Hyperswitch network error unknown (HTTP status unknown).");
    expect(message).not.toContain(result.raw_error);
  });
});
