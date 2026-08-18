interface MitFailureDiagnostic {
  provider: string;
  kind: string;
  code: string;
  status: number | null;
}

interface MitWorkerResult {
  status?: string;
  diagnostic?: MitFailureDiagnostic;
}

export function formatDevRecurringResult(result: MitWorkerResult | undefined) {
  const diagnostic = result?.status === "failed" ? result.diagnostic : undefined;
  if (diagnostic) {
    const provider = diagnostic.provider === "hyperswitch" ? "Hyperswitch" : diagnostic.provider;
    const httpStatus = diagnostic.status === null ? "HTTP status unknown" : `HTTP ${diagnostic.status}`;
    return `MIT failed — ${provider} ${diagnostic.kind} error ${diagnostic.code} (${httpStatus}).`;
  }
  return `Worker completed: ${result?.status ?? "no due charge"}. Refresh to see the new attempt.`;
}
