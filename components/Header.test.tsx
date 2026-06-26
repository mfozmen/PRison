import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "./Header";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

import { signOut } from "next-auth/react";

describe("Header", () => {
  const orgs = [
    { login: "acme", avatarUrl: "a" },
    { login: "beta", avatarUrl: "b" },
  ];

  it("renders app name and user login", () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="mehmet"
      />,
    );
    expect(screen.getByText("PRison")).toBeInTheDocument();
    expect(screen.getByText(/mehmet/)).toBeInTheDocument();
  });

  it("calls signOut on button click", () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="mehmet"
      />,
    );
    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(signOutBtn);
    expect(signOut).toHaveBeenCalled();
  });

  it("renders OrgSwitcher with orgs", () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="mehmet"
      />,
    );
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("renders 'there' as fallback when login is empty", () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login=""
      />,
    );
    expect(screen.getByText(/Welcome, there/)).toBeInTheDocument();
  });
});
