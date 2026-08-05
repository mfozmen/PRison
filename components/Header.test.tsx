import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { Header } from "./Header";

// The activity feed has its own test file; the Header only has to pass it
// through, so every case here supplies an empty one.
const activityProps = {
  activity: [],
  onOpenActivity: () => {},
  onClearActivity: () => {},
};

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
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="mehmet" onOpenSettings={() => {}} {...activityProps} />);
    expect(screen.getByText("PRison")).toBeInTheDocument();
    expect(screen.getByText("mehmet", { selector: "span" })).toBeInTheDocument();
  });

  it("clears the token via the API on sign out", async () => {
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="mehmet" onOpenSettings={() => {}} {...activityProps} />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/token", { method: "DELETE" }),
    );
  });

  it("renders the OrgSwitcher with an All option and the orgs", () => {
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="mehmet" onOpenSettings={() => {}} {...activityProps} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("All organizations")).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("forwards login into the OrgSwitcher personal account option", () => {
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="mehmet" onOpenSettings={() => {}} {...activityProps} />);
    const personalOption = screen.getByText("mehmet (you)");
    expect(personalOption).toBeInTheDocument();
    expect((personalOption as HTMLOptionElement).value).toBe("mehmet");
  });

  it("renders 'there' as fallback when login is empty", () => {
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="" onOpenSettings={() => {}} {...activityProps} />);
    expect(screen.getByText("there")).toBeInTheDocument();
  });

  it("clicking the gear button calls onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    render(<Header orgs={orgs} selectedOrg="acme" onOrgChange={() => {}} login="mehmet" onOpenSettings={onOpenSettings} {...activityProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe("Header theme toggle", () => {
  it("shows moon icon (light mode) and aria-label 'Switch to dark theme' when dark class is absent", () => {
    render(<Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" onOpenSettings={() => {}} {...activityProps} />);
    const toggle = screen.getByRole("button", { name: "Switch to dark theme" });
    expect(toggle).toBeInTheDocument();
    // Moon SVG has a path element with d starting with "M14"
    const svg = toggle.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("path[d^='M14']")).not.toBeNull();
  });

  it("clicking toggle adds dark class to documentElement and sets localStorage to dark", () => {
    render(<Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" onOpenSettings={() => {}} {...activityProps} />);
    const toggle = screen.getByRole("button", { name: "Switch to dark theme" });
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("prison.theme")).toBe("dark");
  });

  it("clicking toggle removes dark class and sets localStorage to light when dark mode is active", () => {
    document.documentElement.classList.add("dark");
    render(<Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" onOpenSettings={() => {}} {...activityProps} />);
    const toggle = screen.getByRole("button", { name: "Switch to light theme" });
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("prison.theme")).toBe("light");
  });

  // Server render can't see documentElement, so the SSR snapshot is always
  // light mode — even when the client would hydrate into dark.
  it("server-renders in light mode regardless of the client theme", () => {
    document.documentElement.classList.add("dark");
    const html = renderToString(
      <Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" onOpenSettings={() => {}} {...activityProps} />,
    );
    expect(html).toContain("Switch to dark theme");
  });

  it("initializes in dark state (sun icon) when dark class is present on documentElement at mount", () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("prison.theme", "dark");
    render(<Header orgs={[]} selectedOrg="" onOrgChange={() => {}} login="testuser" onOpenSettings={() => {}} {...activityProps} />);
    const toggle = screen.getByRole("button", { name: "Switch to light theme" });
    expect(toggle).toBeInTheDocument();
    // Sun SVG has a circle element
    const svg = toggle.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("circle")).not.toBeNull();
  });
});

describe("Header — app version", () => {
  // next.config.ts inlines this from package.json at build time. It is the only
  // source of truth for the version; nothing hard-codes it.
  it("shows the version and links to its GitHub release", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    render(<Header orgs={orgs} selectedOrg="" onOrgChange={vi.fn()} login="octocat" onOpenSettings={vi.fn()} {...activityProps} />);

    const link = screen.getByRole("link", { name: /v1\.0\.0/ });
    expect(link).toHaveAttribute("href", "https://github.com/mfozmen/PRison/releases/tag/v1.0.0");
    vi.unstubAllEnvs();
  });

  // Never "vundefined": a dev build without the env var must render nothing.
  it("renders no version when the env var is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    render(<Header orgs={orgs} selectedOrg="" onOrgChange={vi.fn()} login="octocat" onOpenSettings={vi.fn()} {...activityProps} />);

    expect(screen.queryByText(/^v/)).toBeNull();
    expect(screen.queryByText(/undefined/i)).toBeNull();
    vi.unstubAllEnvs();
  });
});
