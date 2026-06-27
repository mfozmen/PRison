import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Header } from "./Header";

const orgs = [
  { login: "acme", avatarUrl: "a" },
  { login: "beta", avatarUrl: "b" },
];

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true })) as unknown as typeof fetch;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { reload: vi.fn() },
  });
});

describe("Header", () => {
  it("renders app name and user login", () => {
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="mehmet" />);
    expect(screen.getByText("PRison")).toBeInTheDocument();
    expect(screen.getByText(/mehmet/)).toBeInTheDocument();
  });

  it("clears the token via the API on sign out", async () => {
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="mehmet" />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/token", { method: "DELETE" }),
    );
  });

  it("renders the OrgSwitcher with an All option and the orgs", () => {
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="mehmet" />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("All organizations")).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("renders 'there' as fallback when login is empty", () => {
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="" />);
    expect(screen.getByText("there")).toBeInTheDocument();
  });
});
