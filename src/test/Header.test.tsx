import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Header } from "../components/Header";

describe("public header", () => {
  afterEach(cleanup);

  it("includes a subtle admin entry without replacing fundraiser actions", () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin/login");
    expect(screen.getByRole("link", { name: "Start a fundraiser" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "For fundraisers" })).toHaveAttribute("href", "/dashboard/campaigns/new");
  });
});
