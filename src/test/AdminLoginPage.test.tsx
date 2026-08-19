import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLoginPage } from "../pages/AdminLoginPage";

const mocks = vi.hoisted(() => ({
  authState: {
    user: null as { id: string; email: string } | null,
    loading: false,
    signOut: vi.fn(),
  },
  signInWithPassword: vi.fn(),
  authSignOut: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.authSignOut },
    from: mocks.from,
  },
}));

function renderPage() {
  return render(<MemoryRouter initialEntries={["/admin/login"]}><Routes><Route path="/admin/login" element={<AdminLoginPage />} /><Route path="/admin/refunds" element={<p>Refund review workspace</p>} /><Route path="/dashboard" element={<p>Fundraiser dashboard</p>} /></Routes></MemoryRouter>);
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "admin@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "missionpay1" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in to admin" }));
}

describe("admin authentication", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.authState.user = null;
    mocks.authState.loading = false;
    mocks.authState.signOut.mockReset().mockResolvedValue(undefined);
    mocks.signInWithPassword.mockReset();
    mocks.authSignOut.mockReset().mockResolvedValue({ error: null });
    mocks.maybeSingle.mockReset();
    mocks.eq.mockReset().mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.select.mockReset().mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReset().mockReturnValue({ select: mocks.select });
  });

  it("renders dedicated admin fields and copy without fundraiser signup", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Admin sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to admin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to MissionPay" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/create an account|start a fundraiser|organization/i)).not.toBeInTheDocument();
  });

  it("navigates a valid platform admin to the refund workspace", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: "admin-1" }, error: null });
    renderPage();
    submitCredentials();
    expect(await screen.findByText("Refund review workspace")).toBeInTheDocument();
    expect(mocks.from).toHaveBeenCalledWith("platform_admins");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "admin-1");
  });

  it("signs out a newly authenticated non-admin and denies access", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "fundraiser-1" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    renderPage();
    submitCredentials();
    expect(await screen.findByRole("alert")).toHaveTextContent("This account does not have MissionPay admin access.");
    expect(mocks.authSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.queryByText("Refund review workspace")).not.toBeInTheDocument();
  });

  it("shows a generic message for invalid credentials", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: new Error("Invalid login credentials") });
    renderPage();
    submitCredentials();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t sign you in with those details.");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.authSignOut).not.toHaveBeenCalled();
  });

  it("redirects an already authenticated admin", async () => {
    mocks.authState.user = { id: "admin-2", email: "admin@example.com" };
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: "admin-2" }, error: null });
    renderPage();
    expect(await screen.findByText("Refund review workspace")).toBeInTheDocument();
  });

  it("keeps an existing non-admin signed in and offers deliberate next actions", async () => {
    mocks.authState.user = { id: "fundraiser-2", email: "fundraiser@example.com" };
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    renderPage();
    expect(await screen.findByText("fundraiser@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to fundraiser dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(mocks.authSignOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out and use an admin account" }));
    await waitFor(() => expect(mocks.authState.signOut).toHaveBeenCalledOnce());
  });

  it("reports membership lookup errors distinctly and fails closed", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "admin-3" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error("database unavailable") });
    renderPage();
    submitCredentials();
    expect(await screen.findByRole("alert")).toHaveTextContent("unable to verify admin access");
    expect(mocks.authSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.queryByText("Refund review workspace")).not.toBeInTheDocument();
  });
});
