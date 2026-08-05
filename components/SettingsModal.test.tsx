import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsModal } from "./SettingsModal";
import type { Org } from "@/lib/types";
import type { TrackedChecks } from "@/lib/tracked-checks";
import { DEFAULT_POLL_INTERVAL_MS, POLL_INTERVAL_OPTIONS } from "@/lib/notify";

// Defaults for the filter/auto-refresh props so the tracked-checks tests stay
// focused on their own concern.
const filterProps = {
  showBots: false,
  onShowBotsChange: vi.fn(),
  hideReacted: true,
  onHideReactedChange: vi.fn(),
  autoRefresh: false,
  onAutoRefreshChange: vi.fn(),
  pollInterval: DEFAULT_POLL_INTERVAL_MS,
  onPollIntervalChange: vi.fn(),
  notifPermission: "granted" as NotificationPermission,
  onEnableNotifications: vi.fn(),
  onTestNotification: vi.fn(),
};

/** Only one section is mounted at a time; open the one under test. */
function selectSection(label: string) {
  fireEvent.click(screen.getByRole("tab", { name: label }));
}

const orgs: Org[] = [
  { login: "acme", avatarUrl: "https://example.com/acme.png" },
  { login: "beta", avatarUrl: "https://example.com/beta.png" },
];

const emptyValue: TrackedChecks = { orgs: {}, repos: {} };
const someRepos = ["acme/web", "beta/api"];

describe("SettingsModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SettingsModal
        {...filterProps}
        orgs={orgs}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={false}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders org inputs from props with correct values", () => {
    const value: TrackedChecks = {
      orgs: { acme: ["qa/smoke", "lint"], beta: ["ci/test"] },
      repos: {},
    };
    render(
      <SettingsModal
        {...filterProps}
        orgs={orgs}
        availableRepos={[]}
        value={value}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    const acmeInput = screen.getByRole("textbox", { name: "acme check names" });
    expect(acmeInput).toHaveValue("qa/smoke, lint");
    const betaInput = screen.getByRole("textbox", { name: "beta check names" });
    expect(betaInput).toHaveValue("ci/test");
  });

  it("editing an org input calls onChange with correct shape", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[{ login: "acme", avatarUrl: "" }]}
        availableRepos={[]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    const input = screen.getByRole("textbox", { name: "acme check names" });
    fireEvent.change(input, { target: { value: "qa/smoke, lint" } });
    expect(onChange).toHaveBeenCalledWith({
      orgs: { acme: ["qa/smoke", "lint"] },
      repos: {},
    });
  });

  it("lets the user type comma-separated org check names across keystrokes", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[{ login: "acme", avatarUrl: "" }]}
        availableRepos={[]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    const input = screen.getByRole("textbox", { name: "acme check names" });
    // Parent does not feed `value` back; the input must keep the raw draft so a
    // trailing comma survives long enough to type the second token.
    fireEvent.change(input, { target: { value: "qa/smoke," } });
    expect(input).toHaveValue("qa/smoke,");
    fireEvent.change(input, { target: { value: "qa/smoke, lint" } });
    expect(input).toHaveValue("qa/smoke, lint");
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: { acme: ["qa/smoke", "lint"] },
      repos: {},
    });
  });

  it("re-syncs drafts from props when the modal re-opens", () => {
    const value: TrackedChecks = {
      orgs: { acme: ["qa/smoke"] },
      repos: { "acme/web": ["Automation Result"] },
    };
    const { rerender } = render(
      <SettingsModal
        {...filterProps}
        orgs={[{ login: "acme", avatarUrl: "" }]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={false}
        onClose={vi.fn()}
      />,
    );
    // Open with a populated value (e.g. parent hydrated from localStorage).
    // "acme/web" is in value.repos so it appears in repoOptions even with availableRepos=[].
    rerender(
      <SettingsModal
        {...filterProps}
        orgs={[{ login: "acme", avatarUrl: "" }]}
        availableRepos={[]}
        value={value}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    expect(
      screen.getByRole("textbox", { name: "acme check names" }),
    ).toHaveValue("qa/smoke");
    expect(screen.getByRole("combobox", { name: "Repository" })).toHaveValue("acme/web");
    expect(screen.getByPlaceholderText("e.g. qa/smoke")).toHaveValue(
      "Automation Result",
    );
  });

  it("clicking 'Add override' renders a new repo/checks input row", () => {
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    expect(screen.queryByRole("combobox", { name: "Repository" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    expect(screen.getByRole("combobox", { name: "Repository" })).toBeInTheDocument();
  });

  it("editing a repo override calls onChange with correct shape", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={["acme/web"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    const repoInput = screen.getByRole("combobox", { name: "Repository" });
    const checksInput = screen.getByPlaceholderText("e.g. qa/smoke");
    // Focus the combobox to reveal availableRepos as suggestions, then pick one
    fireEvent.focus(repoInput);
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    fireEvent.change(checksInput, { target: { value: "Automation Result" } });
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: {},
      repos: { "acme/web": ["Automation Result"] },
    });
  });

  it("skips an override row whose repo field is left empty", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    // Fill only the checks field, leaving the repo select on the blank placeholder:
    // the row must not emit an empty-string repo key.
    fireEvent.change(screen.getByPlaceholderText("e.g. qa/smoke"), {
      target: { value: "Automation Result" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ orgs: {}, repos: {} });
  });

  it("clicking the remove button on an override removes that row", () => {
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    expect(screen.getByRole("combobox", { name: "Repository" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove repo override/i }));
    expect(screen.queryByRole("combobox", { name: "Repository" })).not.toBeInTheDocument();
  });

  it("clicking the close button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^close settings$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop does NOT call onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={onClose}
      />,
    );
    // Click the outermost backdrop div (not the panel)
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("panel has dialog role when open", () => {
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("repo override field shows availableRepos as suggestions on focus", () => {
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={["acme/web", "beta/api"]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    const combobox = screen.getByRole("combobox", { name: "Repository" });
    // Focus opens the suggestion dropdown; empty input shows availableRepos
    fireEvent.focus(combobox);
    expect(screen.getByRole("option", { name: "acme/web" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "beta/api" })).toBeInTheDocument();
  });

  it("already-configured repo not in availableRepos is shown as the input value", () => {
    const value: TrackedChecks = {
      orgs: {},
      repos: { "legacy/repo": ["ci"] },
    };
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={[]}
        value={value}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    // The row is seeded from value.repos; the combobox input displays the repo name
    const combobox = screen.getByRole("combobox", { name: "Repository" });
    expect(combobox).toHaveValue("legacy/repo");
  });

  it("selecting a repo and entering checks calls onChange with the right repos shape", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={["acme/web"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    const repoInput = screen.getByRole("combobox", { name: "Repository" });
    // Focus to show suggestions, then pick one
    fireEvent.focus(repoInput);
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    const checksInput = screen.getByPlaceholderText("e.g. qa/smoke");
    fireEvent.change(checksInput, { target: { value: "Automation Result" } });
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: {},
      repos: { "acme/web": ["Automation Result"] },
    });
  });

  it("merges checks from two rows targeting the same repo (union, de-duplicated)", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={["acme/web"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");

    // Add first row: acme/web → qa/smoke
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    const [repoInput1] = screen.getAllByRole("combobox", { name: "Repository" });
    fireEvent.focus(repoInput1);
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    const [checksInput1] = screen.getAllByPlaceholderText("e.g. qa/smoke");
    fireEvent.change(checksInput1, { target: { value: "qa/smoke" } });

    // Add second row: acme/web → Automation Result
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    const allRepoInputs = screen.getAllByRole("combobox", { name: "Repository" });
    const repoInput2 = allRepoInputs[allRepoInputs.length - 1];
    fireEvent.focus(repoInput2);
    fireEvent.mouseDown(screen.getAllByRole("option", { name: "acme/web" })[0]);
    const allChecksInputs = screen.getAllByPlaceholderText("e.g. qa/smoke");
    const checksInput2 = allChecksInputs[allChecksInputs.length - 1];
    fireEvent.change(checksInput2, { target: { value: "Automation Result" } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as {
      repos: Record<string, string[]>;
    };
    // Both checks must appear for acme/web — union, de-duplicated
    expect(lastCall.repos["acme/web"]).toEqual(
      expect.arrayContaining(["qa/smoke", "Automation Result"]),
    );
    expect(lastCall.repos["acme/web"]).toHaveLength(2);
  });

  it("distinct repos still map independently with no cross-contamination", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={["acme/web", "beta/api"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");

    // Row 1: acme/web → qa/smoke
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    const [repoInput1] = screen.getAllByRole("combobox", { name: "Repository" });
    fireEvent.focus(repoInput1);
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    const [checksInput1] = screen.getAllByPlaceholderText("e.g. qa/smoke");
    fireEvent.change(checksInput1, { target: { value: "qa/smoke" } });

    // Row 2: beta/api → lint
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    const allRepoInputs = screen.getAllByRole("combobox", { name: "Repository" });
    const repoInput2 = allRepoInputs[allRepoInputs.length - 1];
    fireEvent.focus(repoInput2);
    fireEvent.mouseDown(screen.getByRole("option", { name: "beta/api" }));
    const allChecksInputs = screen.getAllByPlaceholderText("e.g. qa/smoke");
    const checksInput2 = allChecksInputs[allChecksInputs.length - 1];
    fireEvent.change(checksInput2, { target: { value: "lint" } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as {
      repos: Record<string, string[]>;
    };
    expect(lastCall.repos["acme/web"]).toEqual(["qa/smoke"]);
    expect(lastCall.repos["beta/api"]).toEqual(["lint"]);
  });

  it("shows empty-state hint and Add override button when availableRepos and configured repos are both empty", () => {
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    expect(
      screen.getByText(/no repositories loaded yet/i),
    ).toBeInTheDocument();
    // Add override is always available so the user can search server-side
    expect(screen.getByRole("button", { name: /add override/i })).toBeInTheDocument();
  });

  it("shows the Settings title", () => {
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it.each([
    ["Show bot comments", "showBots", "onShowBotsChange", false, "Comments"],
    ["Hide comments I reacted to", "hideReacted", "onHideReactedChange", true, "Comments"],
    ["Auto refresh", "autoRefresh", "onAutoRefreshChange", false, "Auto refresh"],
  ] as const)(
    "%s checkbox reflects its prop and calls its setter",
    (label, propName, setterName, initial, section) => {
      const setter = vi.fn();
      render(
        <SettingsModal
          {...filterProps}
          {...{ [propName]: initial, [setterName]: setter }}
          orgs={[]}
          availableRepos={[]}
          value={emptyValue}
          onChange={vi.fn()}
          open={true}
          onClose={vi.fn()}
        />,
      );
      selectSection(section);
      const checkbox = screen.getByRole("checkbox", { name: label });
      if (initial) expect(checkbox).toBeChecked();
      else expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(setter).toHaveBeenCalledWith(!initial);
    },
  );

  describe("section menu", () => {
    function renderOpen() {
      render(
        <SettingsModal
          {...filterProps}
          orgs={[]}
          availableRepos={[]}
          value={emptyValue}
          onChange={vi.fn()}
          open={true}
          onClose={vi.fn()}
        />,
      );
    }

    it("offers every section and opens on the first one", () => {
      renderOpen();
      const tabs = screen.getAllByRole("tab");
      expect(tabs.map((t) => t.textContent)).toEqual([
        "Comments",
        "Auto refresh",
        "Tracked checks",
        "About",
      ]);
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    });

    it("shows only the selected section", () => {
      renderOpen();
      expect(screen.getByRole("checkbox", { name: "Show bot comments" })).toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: /auto refresh interval/i }),
      ).not.toBeInTheDocument();

      selectSection("Auto refresh");
      expect(
        screen.getByRole("combobox", { name: /auto refresh interval/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", { name: "Show bot comments" }),
      ).not.toBeInTheDocument();
    });

    it("moves between sections with the arrow keys, wrapping at the ends", () => {
      renderOpen();
      const tabs = screen.getAllByRole("tab");
      fireEvent.keyDown(tabs[0], { key: "ArrowDown" });
      expect(screen.getByRole("tab", { name: "Auto refresh" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      // Wrapping backwards off the first item lands on the last.
      fireEvent.keyDown(tabs[1], { key: "ArrowUp" });
      fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
      expect(screen.getByRole("tab", { name: "About" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      // ArrowRight is wired too, for the horizontal (mobile) menu.
      fireEvent.keyDown(tabs[3], { key: "ArrowRight" });
      expect(screen.getByRole("tab", { name: "Comments" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("points About at the repository, with the running version", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.5.0");
      renderOpen();
      selectSection("About");
      expect(screen.getByText("PRison v1.5.0")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "github.com/mfozmen/PRison" }),
      ).toHaveAttribute("href", "https://github.com/mfozmen/PRison");
      vi.unstubAllEnvs();
    });

    it("drops the version line when the build doesn't carry one", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
      renderOpen();
      selectSection("About");
      expect(screen.getByText("PRison")).toBeInTheDocument();
      vi.unstubAllEnvs();
    });

    it("ignores keys that aren't arrows", () => {
      renderOpen();
      fireEvent.keyDown(screen.getAllByRole("tab")[0], { key: "a" });
      expect(screen.getByRole("tab", { name: "Comments" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("reopens on the first section after being closed elsewhere", () => {
      const props = {
        ...filterProps,
        orgs: [],
        availableRepos: [],
        value: emptyValue,
        onChange: vi.fn(),
        onClose: vi.fn(),
      };
      const { rerender } = render(<SettingsModal {...props} open={true} />);
      selectSection("Tracked checks");
      rerender(<SettingsModal {...props} open={false} />);
      rerender(<SettingsModal {...props} open={true} />);
      expect(screen.getByRole("tab", { name: "Comments" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  it("offers every poll interval and reflects the selected one", () => {
    render(
      <SettingsModal
        {...filterProps}
        autoRefresh={true}
        pollInterval={POLL_INTERVAL_OPTIONS[0].ms}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Auto refresh");
    const select = screen.getByRole("combobox", { name: /auto refresh interval/i });
    expect(select).toHaveValue(String(POLL_INTERVAL_OPTIONS[0].ms));
    for (const o of POLL_INTERVAL_OPTIONS) {
      expect(screen.getByRole("option", { name: o.label })).toBeInTheDocument();
    }
  });

  it("reports the chosen interval as a number", () => {
    const onPollIntervalChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        autoRefresh={true}
        onPollIntervalChange={onPollIntervalChange}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Auto refresh");
    const target = POLL_INTERVAL_OPTIONS[POLL_INTERVAL_OPTIONS.length - 1];
    fireEvent.change(
      screen.getByRole("combobox", { name: /auto refresh interval/i }),
      { target: { value: String(target.ms) } },
    );
    expect(onPollIntervalChange).toHaveBeenCalledWith(target.ms);
  });

  it("disables the interval select while auto refresh is off", () => {
    render(
      <SettingsModal
        {...filterProps}
        autoRefresh={false}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Auto refresh");
    expect(
      screen.getByRole("combobox", { name: /auto refresh interval/i }),
    ).toBeDisabled();
  });

  describe("notification permission", () => {
    function renderWithPermission(
      notifPermission: NotificationPermission,
      overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {},
    ) {
      render(
        <SettingsModal
          {...filterProps}
          notifPermission={notifPermission}
          // The permission controls only apply while something is polling.
          autoRefresh={true}
          orgs={[]}
          availableRepos={[]}
          value={emptyValue}
          onChange={vi.fn()}
          open={true}
          onClose={vi.fn()}
          {...overrides}
        />,
      );
      selectSection("Auto refresh");
    }

    it("offers to ask the browser while the prompt is unanswered", () => {
      const onEnableNotifications = vi.fn();
      renderWithPermission("default", { onEnableNotifications });
      expect(screen.getByText(/browser hasn't been asked yet/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /enable notifications/i }));
      expect(onEnableNotifications).toHaveBeenCalled();
    });

    it("keeps the permission controls out of the way while auto refresh is off", () => {
      // Nothing polls, so there is no tab badge to promise and nothing to test.
      renderWithPermission("denied", { autoRefresh: false });
      expect(
        screen.queryByText(/notifications are blocked in your browser/i),
      ).not.toBeInTheDocument();
    });

    it("says so when the browser has blocked notifications", () => {
      renderWithPermission("denied");
      expect(
        screen.getByText(/notifications are blocked in your browser/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /enable notifications/i }),
      ).not.toBeInTheDocument();
    });

    it("lets the user prove delivery once permission is granted", () => {
      const onTestNotification = vi.fn();
      renderWithPermission("granted", { onTestNotification });
      expect(
        screen.queryByText(/notifications are blocked in your browser/i),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /send a test notification/i }));
      expect(onTestNotification).toHaveBeenCalled();
    });

    it("says where else to look when the notification never appears", () => {
      renderWithPermission("granted");
      expect(screen.getByText(/nothing appeared\?/i)).toBeInTheDocument();
    });

    it("keeps the OS hint out of sight until there is a button it explains", () => {
      renderWithPermission("denied");
      expect(screen.queryByText(/nothing appeared\?/i)).not.toBeInTheDocument();
    });

    it("offers no test button until permission is granted", () => {
      renderWithPermission("default");
      expect(
        screen.queryByRole("button", { name: /send a test notification/i }),
      ).not.toBeInTheDocument();
    });
  });
});

describe("SettingsModal — check for updates", () => {
  function renderAbout() {
    render(
      <SettingsModal
        {...filterProps}
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("About");
  }

  /** One reply from /api/latest-release. */
  function stubRelease(tagName: string | null) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tagName }),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function clickCheck() {
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks GitHub only when the button is clicked", async () => {
    const fetchMock = stubRelease("v1.6.0");
    renderAbout();
    // Opening Settings must not spend the user's rate limit on a question
    // they did not ask.
    expect(fetchMock).not.toHaveBeenCalled();
    clickCheck();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/latest-release"));
  });

  it("says so when the running build is the latest release", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.6.0");
    stubRelease("v1.6.0");
    renderAbout();
    clickCheck();
    expect(await screen.findByText("You're on the latest version.")).toBeInTheDocument();
  });

  it("links to the release page when a newer one exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.5.0");
    stubRelease("v1.6.0");
    renderAbout();
    clickCheck();
    const link = await screen.findByRole("link", { name: "v1.6.0 is available" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/mfozmen/PRison/releases/tag/v1.6.0",
    );
    // The tag already carries the v; building the URL must not double it.
    expect(link.getAttribute("href")).not.toContain("vv");
  });

  it("names the latest release when the build carries no version to compare", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    stubRelease("v1.6.0");
    renderAbout();
    clickCheck();
    expect(await screen.findByRole("link", { name: "v1.6.0" })).toBeInTheDocument();
  });

  it("handles a repository with no published release", async () => {
    stubRelease(null);
    renderAbout();
    clickCheck();
    expect(await screen.findByText("No published release yet.")).toBeInTheDocument();
  });

  it("says the check failed rather than claiming the build is current", async () => {
    // The dangerous failure mode is a silent one that reads as "up to date".
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    renderAbout();
    clickCheck();
    expect(
      await screen.findByText("Couldn't reach GitHub. Try again in a moment."),
    ).toBeInTheDocument();
  });

  it("survives the request throwing outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderAbout();
    clickCheck();
    expect(
      await screen.findByText("Couldn't reach GitHub. Try again in a moment."),
    ).toBeInTheDocument();
  });

  it("drops a previous answer when Settings is reopened", async () => {
    // The old answer is stale by an unknown amount — an hour later it would
    // still read "You're on the latest version" without having asked anyone.
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.6.0");
    stubRelease("v1.6.0");
    const props = {
      ...filterProps,
      orgs: [],
      availableRepos: [],
      value: emptyValue,
      onChange: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<SettingsModal {...props} open={true} />);
    selectSection("About");
    clickCheck();
    expect(await screen.findByText("You're on the latest version.")).toBeInTheDocument();

    rerender(<SettingsModal {...props} open={false} />);
    rerender(<SettingsModal {...props} open={true} />);
    selectSection("About");
    expect(screen.queryByText("You're on the latest version.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
  });

  it("announces the answer to a screen reader", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.6.0");
    stubRelease("v1.6.0");
    renderAbout();
    clickCheck();
    // The button label doesn't change, so nothing else would announce it.
    const result = await screen.findByText("You're on the latest version.");
    expect(result.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });
});
