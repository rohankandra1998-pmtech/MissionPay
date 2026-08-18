import { hmacSha256, sha256, verifyHmacSha256 } from "./crypto.ts";

const CAPABILITY_VERSION = "mp1";
const CAPABILITY_PURPOSE = "manage_recurring_donation";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CapabilityPayload = {
  v: 1;
  p: typeof CAPABILITY_PURPOSE;
  rid: string;
};

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const decoded = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function validateSecret(secret: string) {
  if (secret.length < 32) throw new Error("donation_management_link_secret_invalid");
}

export function isSignedManagementCapability(token: string) {
  return token.includes(".");
}

export async function createManagementCapability(recurringDonationId: string, secret: string) {
  validateSecret(secret);
  if (!UUID_PATTERN.test(recurringDonationId)) throw new Error("recurring_donation_id_invalid");
  const payload: CapabilityPayload = { v: 1, p: CAPABILITY_PURPOSE, rid: recurringDonationId };
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signedValue = `${CAPABILITY_VERSION}.${encodedPayload}`;
  const signature = encodeBase64Url(await hmacSha256(signedValue, secret));
  return `${signedValue}.${signature}`;
}

export async function verifyManagementCapability(token: string, secret: string) {
  validateSecret(secret);
  if (token.length > 1000) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== CAPABILITY_VERSION) return null;
  const payloadBytes = decodeBase64Url(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  if (!payloadBytes || !signature || signature.length !== 32) return null;
  if (!await verifyHmacSha256(`${parts[0]}.${parts[1]}`, signature, secret)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<CapabilityPayload>;
    if (payload.v !== 1 || payload.p !== CAPABILITY_PURPOSE || typeof payload.rid !== "string" || !UUID_PATTERN.test(payload.rid)) return null;
    return { recurringDonationId: payload.rid };
  } catch {
    return null;
  }
}

export type ManagementPlan = {
  id: string;
  status: string;
  cancelled_at?: string | null;
  [key: string]: unknown;
};

export type ManagementPlanStore<T extends ManagementPlan> = {
  findById: (id: string) => Promise<T | null>;
  findByLegacyHash: (hash: string) => Promise<T | null>;
  cancel: (id: string, cancelledAt: string) => Promise<void>;
};

export async function resolveManagementPlan<T extends ManagementPlan>(token: string, secret: string, store: ManagementPlanStore<T>) {
  if (token.length < 30 || token.length > 1000) return null;
  if (isSignedManagementCapability(token)) {
    const capability = await verifyManagementCapability(token, secret);
    return capability ? store.findById(capability.recurringDonationId) : null;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  return store.findByLegacyHash(await sha256(token));
}

export async function cancelManagementPlan<T extends ManagementPlan>(plan: T, store: ManagementPlanStore<T>, cancelledAt: string) {
  if (plan.status !== "cancelled") await store.cancel(plan.id, cancelledAt);
  return { ...plan, status: "cancelled", cancelled_at: plan.cancelled_at ?? cancelledAt };
}
