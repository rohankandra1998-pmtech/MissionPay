import { FunctionsHttpError } from "@supabase/supabase-js";

export const CHECKOUT_FALLBACK_ERROR = "We could not open secure checkout. No charge was made. Please try again.";

export function safeErrorFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return null;
  const message = (payload as { error?: unknown }).error;
  if (typeof message !== "string") return null;
  const normalized = message.trim();
  return normalized && normalized.length <= 300 ? normalized : null;
}

export async function functionErrorMessage(error: unknown, fallback = CHECKOUT_FALLBACK_ERROR): Promise<string> {
  if (!(error instanceof FunctionsHttpError)) return fallback;
  try {
    return safeErrorFromPayload(await error.context.json()) ?? fallback;
  } catch {
    return fallback;
  }
}
