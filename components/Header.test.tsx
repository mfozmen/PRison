import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { Header } from "./Header";
import { activityEntry } from "@/lib/fixtures";

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
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true }),
  ) as unknown as typeof fetch;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { reload: vi.fn() },
  });
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.mode;
  localStorage.clear();
});

describe("Header", () => {
  it("renders app name and user login", () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="octocat"
        onOpenSettings={() => {}}
        {...activityProps}
      />,
    );
    expect(screen.getByText("PRison")).toBeInTheDocument();
    expect(
      screen.getByText("octocat", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("clears the token via the API on sign out", async () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="octocat"
        onOpenSettings={() => {}}
        {...activityProps}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/token", {
        method: "DELETE",
      }),
    );
  });

  it("renders the OrgSwitcher with an All option and the orgs", () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="octocat"
        onOpenSettings={() => {}}
        {...activityProps}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("All organizations")).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("forwards login into the OrgSwitcher personal account option", () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="octocat"
        onOpenSettings={() => {}}
        {...activityProps}
      />,
    );
    const personalOption = screen.getByText("octocat (you)");
    expect(personalOption).toBeInTheDocument();
    expect((personalOption as HTMLOptionElement).value).toBe("octocat");
  });

  it("renders 'there' as fallback when login is empty", () => {
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login=""
        onOpenSettings={() => {}}
        {...activityProps}
      />,
    );
    expect(screen.getByText("there")).toBeInTheDocument();
  });

  it("clicking the gear button calls onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="octocat"
        onOpenSettings={onOpenSettings}
        {...activityProps}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

// The button flips the ground, not the family: which family you are on decides
// what the two grounds are *called*, and Settings is the only place that
// changes it.
describe("Header ground toggle", () => {
  function renderHeader() {
    return render(
      <Header
        orgs={[]}
        selectedOrg=""
        onOrgChange={() => {}}
        login="testuser"
        onOpenSettings={() => {}}
        {...activityProps}
      />,
    );
  }

  it("offers the dark ground and shows the moon when no ground is stamped", () => {
    renderHeader();
    const toggle = screen.getByRole("button", {
      name: "Switch to Default Dark",
    });
    // Moon SVG has a path element with d starting with "M14"
    const svg = toggle.querySelector("svg");
    expect(svg?.querySelector("path[d^='M14']")).not.toBeNull();
  });

  it("clicking stamps the dark ground and stores it", () => {
    renderHeader();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to Default Dark" }),
    );
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(localStorage.getItem("prison.mode")).toBe("dark");
  });

  it("clicking again goes back to the light ground", () => {
    document.documentElement.dataset.mode = "dark";
    renderHeader();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to Default Light" }),
    );
    expect(document.documentElement.dataset.mode).toBe("light");
    expect(localStorage.getItem("prison.mode")).toBe("light");
  });

  it("shows the sun once the dark ground is active", () => {
    document.documentElement.dataset.mode = "dark";
    renderHeader();
    const toggle = screen.getByRole("button", {
      name: "Switch to Default Light",
    });
    expect(toggle.querySelector("svg circle")).not.toBeNull();
  });

  // The whole point of naming both axes: on Aurora the grounds are Dawn and
  // Night, and the button has to say so.
  it("names the destination in the current family's own words", () => {
    document.documentElement.dataset.theme = "aurora";
    document.documentElement.dataset.mode = "dark";
    renderHeader();
    expect(
      screen.getByRole("button", { name: "Switch to Aurora Dawn" }),
    ).toBeInTheDocument();
  });

  it("names İznik's grounds too", () => {
    document.documentElement.dataset.theme = "iznik";
    renderHeader();
    expect(
      screen.getByRole("button", { name: "Switch to İznik Cobalt" }),
    ).toBeInTheDocument();
  });

  it("leaves the family alone when the ground is flipped", () => {
    document.documentElement.dataset.theme = "cyanotype";
    renderHeader();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to Cyanotype Print" }),
    );
    expect(document.documentElement.dataset.theme).toBe("cyanotype");
    expect(localStorage.getItem("prison.theme")).toBeNull();
  });

  // Server render can't see documentElement, so the SSR snapshot is always the
  // default family in its light ground — even when the client hydrates darker.
  it("server-renders the default family's light ground regardless of the client", () => {
    document.documentElement.dataset.theme = "aurora";
    document.documentElement.dataset.mode = "dark";
    const html = renderToString(
      <Header
        orgs={[]}
        selectedOrg=""
        onOrgChange={() => {}}
        login="testuser"
        onOpenSettings={() => {}}
        {...activityProps}
      />,
    );
    expect(html).toContain("Switch to Default Dark");
  });
});

describe("Header — app version", () => {
  // next.config.ts inlines this from package.json at build time. It is the only
  // source of truth for the version; nothing hard-codes it.
  it("shows the version and links to its GitHub release", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    render(
      <Header
        orgs={orgs}
        selectedOrg=""
        onOrgChange={vi.fn()}
        login="octocat"
        onOpenSettings={vi.fn()}
        {...activityProps}
      />,
    );

    const link = screen.getByRole("link", { name: /v1\.0\.0/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/mfozmen/PRison/releases/tag/v1.0.0",
    );
    vi.unstubAllEnvs();
  });

  // Never "vundefined": a dev build without the env var must render nothing.
  it("renders no version when the env var is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    render(
      <Header
        orgs={orgs}
        selectedOrg=""
        onOrgChange={vi.fn()}
        login="octocat"
        onOpenSettings={vi.fn()}
        {...activityProps}
      />,
    );

    expect(screen.queryByText(/^v/)).toBeNull();
    expect(screen.queryByText(/undefined/i)).toBeNull();
    vi.unstubAllEnvs();
  });
});

// A container runs whatever tag it was started with, forever, and nothing in
// PRison ever mentioned that a newer one exists. The chip that already carries
// the version is where that belongs.
describe("Header — a newer release", () => {
  const answer = (tagName: string | null) =>
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ tagName }) }),
    ) as unknown as typeof fetch;

  function renderHeader(
    props: Partial<React.ComponentProps<typeof Header>> = {},
  ) {
    return render(
      <Header
        orgs={orgs}
        selectedOrg=""
        onOrgChange={vi.fn()}
        login="octocat"
        onOpenSettings={vi.fn()}
        checkUpdates
        {...activityProps}
        {...props}
      />,
    );
  }

  afterEach(() => vi.unstubAllEnvs());

  it("says which newer version is out, and links to its notes", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    global.fetch = answer("v1.1.0");
    renderHeader();
    const link = await screen.findByRole("link", {
      name: /1\.1\.0 is available/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/mfozmen/PRison/releases/tag/v1.1.0",
    );
  });

  it("stays the plain version chip when there is nothing newer", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.1.0");
    global.fetch = answer("v1.1.0");
    renderHeader();
    expect(
      await screen.findByRole("link", { name: /^v1\.1\.0$/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/available/i)).toBeNull();
  });

  it("does not ask at all when the check is switched off", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    global.fetch = answer("v1.1.0");
    renderHeader({ checkUpdates: false });
    await waitFor(() =>
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls,
      ).toHaveLength(0),
    );
    expect(screen.queryByText(/available/i)).toBeNull();
  });

  it("says nothing when the check fails", async () => {
    // No network, GitHub down, rate limited: the dashboard behaves exactly as
    // it does with no check at all. A version check must never be visible as
    // an error.
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("offline")),
    ) as unknown as typeof fetch;
    renderHeader();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/available/i)).toBeNull();
    expect(
      screen.getByRole("link", { name: /^v1\.0\.0$/ }),
    ).toBeInTheDocument();
  });

  it("says nothing when the check answers with an error", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 502 }),
    ) as unknown as typeof fetch;
    renderHeader();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/available/i)).toBeNull();
  });

  it("says nothing when the answer is not a version it can compare", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    global.fetch = answer(null);
    renderHeader();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/available/i)).toBeNull();
  });

  it("says nothing on a dev build, which has no version to be behind", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    global.fetch = answer("v1.1.0");
    renderHeader();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/available/i)).toBeNull();
  });

  it("does not ask twice for one mount", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");
    global.fetch = answer("v1.1.0");
    const { rerender } = renderHeader();
    await screen.findByRole("link", { name: /available/i });
    rerender(
      <Header
        orgs={orgs}
        selectedOrg=""
        onOrgChange={vi.fn()}
        login="someone-else"
        onOpenSettings={vi.fn()}
        checkUpdates
        {...activityProps}
      />,
    );
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      1,
    );
  });
});

// The bell's own behaviour lives in ActivityBell.test.tsx; what is only true
// here is that the Header mounts it and hands it *these* props — without this
// block, deleting <ActivityBell /> from Header.tsx leaves the file green.
describe("Header — activity bell", () => {
  function renderHeader(
    props: Partial<React.ComponentProps<typeof Header>> = {},
  ) {
    return render(
      <Header
        orgs={orgs}
        selectedOrg="acme"
        onOrgChange={() => {}}
        login="octocat"
        onOpenSettings={() => {}}
        {...activityProps}
        {...props}
      />,
    );
  }

  it("renders the bell with the forwarded activity entries", () => {
    renderHeader({ activity: [activityEntry()] });
    // The unseen count comes from the entries, so this fails both when the
    // bell is gone and when `activity` stops reaching it.
    expect(
      screen.getByRole("button", { name: "Activity, 1 unseen" }),
    ).toBeInTheDocument();
  });

  it("opening the bell calls the forwarded onOpenActivity", () => {
    const onOpenActivity = vi.fn();
    renderHeader({ activity: [activityEntry()], onOpenActivity });
    fireEvent.click(screen.getByRole("button", { name: "Activity, 1 unseen" }));
    expect(onOpenActivity).toHaveBeenCalledTimes(1);
  });

  it("clearing from the bell panel calls the forwarded onClearActivity", () => {
    const onClearActivity = vi.fn();
    renderHeader({ activity: [activityEntry()], onClearActivity });
    fireEvent.click(screen.getByRole("button", { name: "Activity, 1 unseen" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearActivity).toHaveBeenCalledTimes(1);
  });
});
