import { hmacSha256, verifyHmacSha256 } from "./crypto.ts";

const CAPABILITY_VERSION = "mp1";
const CAPABILITY_PURPOSE = "request_refund";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RefundCapabilityPayload = {
  v: 1;
  p: typeof CAPABILITY_PURPOSE;
  did: string;
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

export async function createRefundCapability(donationId: string, secret: string) {
  validateSecret(secret);
  if (!UUID_PATTERN.test(donationId)) throw new Error("donation_id_invalid");
  const payload: RefundCapabilityPayload = { v: 1, p: CAPABILITY_PURPOSE, did: donationId };
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signedValue = `${CAPABILITY_VERSION}.${encodedPayload}`;
  const signature = encodeBase64Url(await hmacSha256(signedValue, secret));
  return `${signedValue}.${signature}`;
}

export async function verifyRefundCapability(token: string, secret: string) {
  validateSecret(secret);
  if (token.length < 30 || token.length > 1000) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== CAPABILITY_VERSION) return null;
  const payloadBytes = decodeBase64Url(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  if (!payloadBytes || !signature || signature.length !== 32) return null;
  if (!await verifyHmacSha256(`${parts[0]}.${parts[1]}`, signature, secret)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<RefundCapabilityPayload>;
    if (payload.v !== 1 || payload.p !== CAPABILITY_PURPOSE || typeof payload.did !== "string" || !UUID_PATTERN.test(payload.did)) return null;
    return { donationId: payload.did };
  } catch {
    return null;
  }
}
