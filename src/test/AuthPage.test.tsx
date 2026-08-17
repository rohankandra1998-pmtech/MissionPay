import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "../pages/AuthPage";

const { signInWithPassword, signUp } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { auth: { signInWithPassword, signUp } },
}));

function renderAuth(mode: "login" | "signup") {
  return render(<MemoryRouter><AuthPage mode={mode} /></MemoryRouter>);
}

function completeSignup(password: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Maya Okafor" } });
  fireEvent.change(screen.getByLabelText("Organization (optional)"), { target: { value: "Waterline Collective" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "maya@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole("button", { name: "Create fundraiser account" }));
}

describe("fundraiser authentication", () => {
  afterEach(cleanup);

  beforeEach(() => {
    signUp.mockReset();
    signInWithPassword.mockReset();
  });

  it("rejects mismatched signup passwords before invoking Supabase", async () => {
    renderAuth("signup");
    completeSignup("missionpay1", "missionpay2");

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match. Please enter the same password in both fields.");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("continues the existing signup flow when passwords match", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    renderAuth("signup");
    completeSignup("missionpay1", "missionpay1");

    await waitFor(() => expect(signUp).toHaveBeenCalledOnce());
    expect(signUp).toHaveBeenCalledWith({
      email: "maya@example.com",
      password: "missionpay1",
      options: {
        data: { display_name: "Maya Okafor", organization_name: "Waterline Collective" },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
  });

  it("does not render confirm password on login", () => {
    renderAuth("login");
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
  });
});
