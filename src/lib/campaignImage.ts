export const CAMPAIGN_IMAGE_BUCKET = "campaign-images";
export const CAMPAIGN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CAMPAIGN_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateCampaignImage(file: File): string | null {
  if (!supportedTypes.has(file.type)) return "Choose a JPG, PNG, or WebP image.";
  if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) return "Cover images must be 5 MB or smaller.";
  return null;
}

export function campaignImagePath(userId: string, file: File): string {
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  return `${userId}/${crypto.randomUUID()}.${extension}`;
}

export function managedCampaignImagePath(publicUrl: string, userId: string, supabaseUrl: string): string | null {
  try {
    const url = new URL(publicUrl);
    if (url.origin !== new URL(supabaseUrl).origin) return null;
    const marker = `/storage/v1/object/public/${CAMPAIGN_IMAGE_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    if (!path.startsWith(`${userId}/`) || path.includes("..")) return null;
    return path;
  } catch {
    return null;
  }
}
