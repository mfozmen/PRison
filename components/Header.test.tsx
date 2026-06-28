import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
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

describe("Header theme toggle", () => {
  it("shows moon icon (light mode) and aria-label 'Switch to dark theme' when dark class is absent", async () => {
    await act(async () => {
      render(<Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" />);
    });
    const toggle = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(toggle).toBeInTheDocument();
    // Moon SVG has a path element with d starting with "M14"
    const svg = toggle.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("path[d^='M14']")).not.toBeNull();
  });

  it("clicking toggle adds dark class to documentElement and sets localStorage to dark", async () => {
    await act(async () => {
      render(<Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" />);
    });
    const toggle = screen.getByRole("button", { name: "Switch to dark theme" });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("prison.theme")).toBe("dark");
  });

  it("clicking toggle removes dark class and sets localStorage to light when dark mode is active", async () => {
    document.documentElement.classList.add("dark");
    await act(async () => {
      render(<Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" />);
    });
    const toggle = screen.getByRole("button", { name: "Switch to light theme" });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("prison.theme")).toBe("light");
  });

  it("initializes in dark state (sun icon) when dark class is present on documentElement at mount", async () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("prison.theme", "dark");
    await act(async () => {
      render(<Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" />);
    });
    const toggle = screen.getByRole("button", { name: "Switch to light theme" });
    expect(toggle).toBeInTheDocument();
    // Sun SVG has a circle element
    const svg = toggle.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("circle")).not.toBeNull();
  });
});
