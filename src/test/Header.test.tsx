import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Header } from "../components/Header";

describe("public header", () => {
  afterEach(cleanup);

  it("distinguishes Platform Support from fundraiser actions", () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Platform Support" })).toHaveAttribute("href", "/admin/login");
    expect(screen.getByRole("link", { name: "Platform Support" })).toHaveClass("button", "button--outline");
    expect(screen.getByRole("link", { name: "Start a fundraiser" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "For fundraisers" })).toHaveAttribute("href", "/dashboard/campaigns/new");
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });
});
