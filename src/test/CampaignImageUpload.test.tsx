import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignEditorPage } from "../pages/CampaignEditorPage";

const { from, storageFrom, upload, remove, getPublicUrl } = vi.hoisted(() => ({
  from: vi.fn(), storageFrom: vi.fn(), upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(),
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "owner@example.com" } }),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { from, storage: { from: storageFrom } },
}));

type Builder = Record<string, ReturnType<typeof vi.fn>>;
function builder(maybeData: unknown, singleData: unknown = { id: "campaign-1" }): Builder {
  const value = {} as Builder;
  for (const method of ["select", "eq", "update", "insert"]) value[method] = vi.fn(() => value);
  value.maybeSingle = vi.fn().mockResolvedValue({ data: maybeData, error: null });
  value.single = vi.fn().mockResolvedValue({ data: singleData, error: null });
  return value;
}

const existingCampaign = {
  id: "campaign-1", title: "Neighborhood Food Pantry", category: "Community",
  short_description: "Fresh groceries for families across our neighborhood.",
  story: "A".repeat(120), goal_amount_cents: 250000, cover_image_url: "https://images.example/existing.jpg",
  impact_statement: "Every contribution keeps nutritious food available locally.", end_date: null,
};

function arrange(existing: typeof existingCampaign | null = null) {
  const fundraiser = builder({ id: "fundraiser-1" });
  const campaign = builder(existing);
  from.mockImplementation((table: string) => table === "fundraisers" ? fundraiser : campaign);
  upload.mockResolvedValue({ data: { path: "path" }, error: null });
  remove.mockResolvedValue({ data: null, error: null });
  getPublicUrl.mockReturnValue({ data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/campaign-images/user-1/generated.webp" } });
  storageFrom.mockReturnValue({ upload, remove, getPublicUrl });
  return { campaign };
}

function renderEditor(existing = false) {
  const path = existing ? "/dashboard/campaigns/campaign-1" : "/dashboard/campaigns/new";
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/dashboard/campaigns/new" element={<CampaignEditorPage />} /><Route path="/dashboard/campaigns/:id" element={<CampaignEditorPage />} /></Routes></MemoryRouter>);
}

function validImage(name = "cover.webp") {
  return new File(["image"], name, { type: "image/webp" });
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Campaign title"), { target: { value: "Community Garden Renewal" } });
  fireEvent.change(screen.getByLabelText("Short description"), { target: { value: "Help neighbors restore a shared garden and gathering place." } });
  fireEvent.change(screen.getByLabelText("Campaign story"), { target: { value: "A".repeat(120) } });
  fireEvent.change(screen.getByLabelText("Impact statement"), { target: { value: "Every gift funds plants, tools, soil, and accessible garden beds." } });
}

describe("campaign cover image upload", () => {
  beforeEach(() => {
    from.mockReset(); storageFrom.mockReset(); upload.mockReset(); remove.mockReset(); getPublicUrl.mockReset();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((selected: File) => `blob:${selected.name}`) });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });
  afterEach(cleanup);

  it("replaces the URL field with browse, preview, replace, and remove controls", async () => {
    arrange();
    renderEditor();
    await screen.findByLabelText("Campaign title");
    expect(screen.queryByLabelText("Cover image URL")).not.toBeInTheDocument();
    expect(screen.getByText("Browse files")).toBeInTheDocument();

    const input = screen.getByLabelText("Choose cover image");
    fireEvent.change(input, { target: { files: [validImage()] } });
    expect(await screen.findByAltText("Campaign preview")).toHaveAttribute("src", "blob:cover.webp");
    expect(screen.getByText("Replace image")).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [validImage("replacement.png")] } });
    expect(await screen.findByAltText("Campaign preview")).toHaveAttribute("src", "blob:replacement.png");
    fireEvent.click(screen.getByRole("button", { name: "Remove selection" }));
    expect(screen.getByText("Your cover image")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("shows accessible errors for unsupported and oversized files", async () => {
    arrange();
    renderEditor();
    const input = await screen.findByLabelText("Choose cover image");
    fireEvent.change(input, { target: { files: [new File(["svg"], "cover.svg", { type: "image/svg+xml" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a JPG, PNG, or WebP image.");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Cover images must be 5 MB or smaller.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads to the campaign bucket and inserts the generated public URL", async () => {
    const { campaign } = arrange();
    renderEditor();
    await screen.findByLabelText("Campaign title");
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Choose cover image"), { target: { files: [validImage()] } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(storageFrom).toHaveBeenCalledWith("campaign-images");
    expect(upload.mock.calls[0][0]).toMatch(/^user-1\/[0-9a-f-]+\.webp$/);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: "image/webp", upsert: false });
    await waitFor(() => expect(campaign.insert).toHaveBeenCalledWith(expect.objectContaining({ cover_image_url: expect.stringContaining("/campaign-images/user-1/generated.webp") })));
  });

  it("does not persist when the image upload fails", async () => {
    const { campaign } = arrange();
    upload.mockResolvedValue({ data: null, error: { message: "upload failed" } });
    renderEditor();
    await screen.findByLabelText("Campaign title");
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Choose cover image"), { target: { files: [validImage()] } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't upload your cover image. Please try again.");
    expect(campaign.insert).not.toHaveBeenCalled();
    expect(campaign.update).not.toHaveBeenCalled();
  });

  it("preserves an existing external URL when no replacement is selected", async () => {
    const { campaign } = arrange(existingCampaign);
    renderEditor(true);
    expect(await screen.findByAltText("Campaign preview")).toHaveAttribute("src", existingCampaign.cover_image_url);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(campaign.update).toHaveBeenCalledWith(expect.objectContaining({ cover_image_url: existingCampaign.cover_image_url })));
    expect(upload).not.toHaveBeenCalled();
  });

  it("updates an existing campaign with a replacement's generated URL", async () => {
    const { campaign } = arrange(existingCampaign);
    renderEditor(true);
    await screen.findByAltText("Campaign preview");
    fireEvent.change(screen.getByLabelText("Choose cover image"), { target: { files: [validImage()] } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(campaign.update).toHaveBeenCalledWith(expect.objectContaining({ cover_image_url: expect.stringContaining("/campaign-images/user-1/generated.webp") })));
    expect(remove).not.toHaveBeenCalled();
  });
});
