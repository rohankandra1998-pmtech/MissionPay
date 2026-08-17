import { describe, expect, it, vi } from "vitest";
import { CAMPAIGN_IMAGE_MAX_BYTES, campaignImagePath, managedCampaignImagePath, validateCampaignImage } from "../lib/campaignImage";

const file = (type: string, size = 12) => new File([new Uint8Array(size)], "cover", { type });

describe("campaign cover image helpers", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(validateCampaignImage(file(type))).toBeNull();
  });

  it("rejects unsupported file types", () => {
    expect(validateCampaignImage(file("image/svg+xml"))).toBe("Choose a JPG, PNG, or WebP image.");
  });

  it("rejects files larger than 5 MB", () => {
    expect(validateCampaignImage(file("image/png", CAMPAIGN_IMAGE_MAX_BYTES + 1))).toBe("Cover images must be 5 MB or smaller.");
  });

  it("creates unique paths inside the authenticated user's folder", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000001").mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    expect(campaignImagePath("user-1", file("image/jpeg"))).toBe("user-1/00000000-0000-4000-8000-000000000001.jpg");
    expect(campaignImagePath("user-1", file("image/jpeg"))).not.toContain("00000000-0000-4000-8000-000000000001");
  });

  it("only recognizes managed URLs in the current user's namespace", () => {
    const base = "https://project.supabase.co";
    expect(managedCampaignImagePath(`${base}/storage/v1/object/public/campaign-images/user-1/photo.webp`, "user-1", base)).toBe("user-1/photo.webp");
    expect(managedCampaignImagePath(`${base}/storage/v1/object/public/campaign-images/user-2/photo.webp`, "user-1", base)).toBeNull();
    expect(managedCampaignImagePath("https://images.unsplash.com/storage/v1/object/public/campaign-images/user-1/photo.webp", "user-1", base)).toBeNull();
  });
});
