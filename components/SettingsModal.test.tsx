import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsModal } from "./SettingsModal";
import type { TrackedChecks } from "@/lib/tracked-checks";

// Every name typed into the required field carries that mark into storage.
const required = (name: string) => ({ name, required: true });
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

const owners = ["acme", "beta"];

const emptyValue: TrackedChecks = { orgs: {}, repos: {} };
const someRepos = ["acme/web", "beta/api"];

describe("SettingsModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={false}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });













  it("lists every stored check with its own name field and mark", () => {
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={{ orgs: { acme: ["qa/smoke", { name: "nightly-e2e", required: false }] }, repos: {} }}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    expect(screen.getByRole("textbox", { name: "Check 1 for acme" })).toHaveValue("qa/smoke");
    expect(screen.getByRole("textbox", { name: "Check 2 for acme" })).toHaveValue("nightly-e2e");
    expect(screen.getByRole("checkbox", { name: "qa/smoke is required for acme" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "nightly-e2e is required for acme" }),
    ).not.toBeChecked();
  });

  it("decides the mark while adding, not after", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    // The name is not stored until Add, so nothing is announced per keystroke
    // and the box is answered before the check exists.
    fireEvent.change(screen.getByRole("textbox", { name: "New check for acme" }), {
      target: { value: "nightly-e2e" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "New check is required for acme" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add check to acme" }));
    expect(onChange).toHaveBeenCalledWith({
      orgs: { acme: [{ name: "nightly-e2e", required: false }] },
      repos: {},
    });
  });

  it("clears the add field and returns to Required after adding", () => {
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    const field = screen.getByRole("textbox", { name: "New check for acme" });
    const box = screen.getByRole("checkbox", { name: "New check is required for acme" });
    fireEvent.change(field, { target: { value: "lint" } });
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Add check to acme" }));
    expect(field).toHaveValue("");
    expect(box).toBeChecked();
  });

  it("adds on Enter, so the keyboard alone gets through the list", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    const field = screen.getByRole("textbox", { name: "New check for acme" });
    fireEvent.change(field, { target: { value: "lint" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ orgs: { acme: [required("lint")] }, repos: {} });
  });

  it("refuses a blank name and a name already in the list", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={{ orgs: { acme: ["lint"] }, repos: {} }}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    const field = screen.getByRole("textbox", { name: "New check for acme" });
    const add = screen.getByRole("button", { name: "Add check to acme" });
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(add);
    fireEvent.change(field, { target: { value: "lint" } });
    fireEvent.click(add);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renames a check in place, keeping its mark", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={{ orgs: { acme: [{ name: "nightly-e2e", required: false }, "lint"] }, repos: {} }}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.change(screen.getByRole("textbox", { name: "Check 1 for acme" }), {
      target: { value: "nightly-e2e-v2" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: { acme: [{ name: "nightly-e2e-v2", required: false }, required("lint")] },
      repos: {},
    });
  });

  it("keeps the row while its name is emptied mid-edit", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={{ orgs: { acme: ["lint"] }, repos: {} }}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    const field = screen.getByRole("textbox", { name: "Check 1 for acme" });
    // Clearing the field is how a rename starts; the row has to survive it or
    // the user loses the control they were typing into.
    fireEvent.change(field, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({ orgs: { acme: [] }, repos: {} });
    expect(field).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "ci" } });
    expect(onChange).toHaveBeenLastCalledWith({ orgs: { acme: [required("ci")] }, repos: {} });
  });

  it("unticks a stored check without touching the others", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={{ orgs: { acme: ["qa/smoke", "nightly-e2e"] }, repos: {} }}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("checkbox", { name: "nightly-e2e is required for acme" }));
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: { acme: [required("qa/smoke"), { name: "nightly-e2e", required: false }] },
      repos: {},
    });
  });

  it("removes a single check from the list", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={{ orgs: { acme: ["qa/smoke", "lint"] }, repos: {} }}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: "Remove qa/smoke from acme" }));
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: { acme: [required("lint")] },
      repos: {},
    });
    expect(
      screen.queryByRole("checkbox", { name: "qa/smoke is required for acme" }),
    ).not.toBeInTheDocument();
  });

  it("names the same check once per owner it is tracked for", () => {
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme", "globex"]}
        availableRepos={[]}
        value={{ orgs: { acme: ["lint"], globex: ["lint"] }, repos: {} }}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    // One scope shows at a time, but the label still carries it: a bare "lint
    // is required" would say nothing about which list you just changed.
    expect(screen.getByRole("checkbox", { name: "lint is required for acme" })).toBeChecked();
    fireEvent.change(screen.getByRole("combobox", { name: "Tracked checks scope" }), {
      target: { value: "owner:globex" },
    });
    expect(screen.getByRole("checkbox", { name: "lint is required for globex" })).toBeChecked();
  });

  it("takes checks for a repo override once a repo is picked", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        availableRepos={["acme/web"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Repository" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New check for acme/web" }), {
      target: { value: "Automation Result" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add check to acme/web" }));
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: {},
      repos: { "acme/web": [required("Automation Result")] },
    });
  });

  it("starts a freshly picked repo with an empty list", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        availableRepos={["acme/web"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Repository" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    expect(onChange).toHaveBeenLastCalledWith({ orgs: {}, repos: { "acme/web": [] } });
  });

  it("stores a renamed check trimmed, and never twice under one name", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={["acme"]}
        availableRepos={[]}
        value={{ orgs: { acme: ["qa/smoke", "lint"] }, repos: {} }}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    const second = screen.getByRole("textbox", { name: "Check 2 for acme" });
    // A stray space would stop the name matching what GitHub reports.
    fireEvent.change(second, { target: { value: " lint " } });
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: { acme: [required("qa/smoke"), required("lint")] },
      repos: {},
    });
    // Two rows can read the same name mid-rename; storage keeps one.
    fireEvent.change(second, { target: { value: "qa/smoke" } });
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: { acme: [required("qa/smoke")] },
      repos: {},
    });
    expect(second).toHaveValue("qa/smoke");
  });

  it("keeps two override rows independent", () => {
    const onChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        availableRepos={["acme/web", "beta/api"]}
        value={{ orgs: {}, repos: { "acme/web": ["lint"], "beta/api": ["ci"] } }}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.change(screen.getByRole("combobox", { name: "Tracked checks scope" }), {
      target: { value: "repo:beta/api" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "ci is required for beta/api" }));
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: {},
      // acme/web was not touched, so it keeps the shape it was stored in.
      repos: { "acme/web": ["lint"], "beta/api": [{ name: "ci", required: false }] },
    });
  });

  it("clicking the close button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
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
        availableRepos={["acme/web", "beta/api"]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
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
        availableRepos={[]}
        value={value}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    // A configured repo is a scope whether or not GitHub listed it, so it is
    // on the picker and the panel opens on it.
    expect(screen.getByRole("option", { name: "legacy/repo (1)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Check 1 for legacy/repo" })).toHaveValue("ci");
  });






  it("offers Add repository even when nothing has loaded", () => {
    render(
      <SettingsModal
        {...filterProps}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
    // The combobox searches GitHub, so a repo can be configured before the
    // board has ever loaded one.
    expect(screen.getByRole("button", { name: /add repository/i })).toBeInTheDocument();
  });

  it("shows the Settings title", () => {
    render(
      <SettingsModal
        {...filterProps}
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
        "Ignored checks",
        "Appearance",
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

    // Learned the hard way on a machine where this hint was already on screen
    // and still not enough: the browser had permission, the operating system
    // had switched it off, and "check your operating system" was too vague to
    // act on. Both traps have to be named.
    it("names the setting that is off and the trap that looks like it is on", () => {
      renderWithPermission("granted");
      const hint = screen.getByText(/nothing appeared\?/i);
      expect(hint.textContent).toMatch(/notifications/i);
      // An alert style of None is permission that shows nothing.
      expect(hint.textContent).toMatch(/style/i);
      // A browser registers more than one entry, and the one you switched on
      // may not be the one that delivers.
      expect(hint.textContent).toMatch(/more than one|several|each/i);
    });

    it.each(["granted", "denied", "default"] as NotificationPermission[])(
      "points at the menu bar whatever the browser answered (%s)",
      (permission) => {
        // The reader who most needs an alternative is the one whose browser
        // said no — and that is the one with no button and no hint above.
        renderWithPermission(permission);
        const link = screen.getByRole("link", { name: /menu bar/i });
        expect(link).toHaveAttribute("href", expect.stringContaining("menubar"));
      },
    );

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

describe("SettingsModal — owner defaults cover the personal account", () => {
  function renderTracked(props: { owners: string[]; onChange?: () => void }) {
    render(
      <SettingsModal
        {...filterProps}
        availableRepos={[]}
        owners={props.owners}
        value={emptyValue}
        onChange={props.onChange ?? vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Tracked checks");
  }

  it("offers a row for the personal account alongside the orgs", () => {
    // Dashboard passes [login, ...orgs]; the personal account is the head of
    // that list and used to be the one owner with no way to set a default.
    renderTracked({ owners: ["octocat", "acme"] });
    expect(screen.getByRole("option", { name: "octocat" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "acme" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New check for octocat" })).toBeInTheDocument();
  });

  it("stores a personal-account default under that login", () => {
    const onChange = vi.fn();
    renderTracked({ owners: ["octocat"], onChange });
    fireEvent.change(screen.getByRole("textbox", { name: "New check for octocat" }), {
      target: { value: "qa/smoke" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add check to octocat" }));
    // resolveTracked keys on the owner segment of `owner/repo`, so this is the
    // shape that makes octocat/anything pick the default up.
    expect(onChange).toHaveBeenCalledWith({
      orgs: { octocat: [required("qa/smoke")] },
      repos: {},
    });
  });

  it("says what an owner scope is for", () => {
    renderTracked({ owners: ["octocat"] });
    expect(screen.getByText(/default for every repo this owner has/i)).toBeInTheDocument();
  });

  it("says there is nothing to configure when no owner has loaded", () => {
    renderTracked({ owners: [] });
    expect(screen.getByText(/no owners loaded yet/i)).toBeInTheDocument();
  });
});

// The family lives here; the ground lives on the header button. This section is
// the only place the family can be changed, and the only place both grounds are
// named — which is what makes the header button's label readable.
describe("SettingsModal — appearance", () => {
  function renderAppearance() {
    const result = render(
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    selectSection("Appearance");
    return result;
  }

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.mode;
    localStorage.clear();
  });

  it("offers every family", () => {
    renderAppearance();
    expect(
      screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value),
    ).toEqual(["default", "aurora", "iznik", "cyanotype"]);
  });

  it("stamps the chosen family on <html> and stores it", () => {
    renderAppearance();
    fireEvent.click(screen.getByRole("radio", { name: /Aurora/ }));
    expect(document.documentElement.dataset.theme).toBe("aurora");
    expect(localStorage.getItem("prison.theme")).toBe("aurora");
  });

  it("marks the family already in effect", () => {
    document.documentElement.dataset.theme = "iznik";
    renderAppearance();
    expect(screen.getByRole("radio", { name: /İznik/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Aurora/ })).not.toBeChecked();
  });

  it("names both grounds of every family, not just the current one", () => {
    document.documentElement.dataset.theme = "aurora";
    document.documentElement.dataset.mode = "dark";
    renderAppearance();
    expect(screen.getByText(/Dawn · Night/)).toBeInTheDocument();
    expect(screen.getByText(/Glaze · Cobalt/)).toBeInTheDocument();
    expect(screen.getByText(/Negative · Print/)).toBeInTheDocument();
    expect(screen.getByText(/on Night/)).toBeInTheDocument();
  });

  // The swatch is stamped with the pair so globals.css resolves that palette
  // inside it. If these attributes go missing the preview silently shows the
  // page's current colours for every row, which looks fine and is wrong.
  it("renders each swatch under its own family and the current ground", () => {
    document.documentElement.dataset.mode = "dark";
    const { container } = renderAppearance();
    const swatches = container.querySelectorAll("[aria-hidden='true'][data-theme]");
    expect(
      Array.from(swatches).map((s) => [
        s.getAttribute("data-theme"),
        s.getAttribute("data-mode"),
      ]),
    ).toEqual([
      ["default", "dark"],
      ["aurora", "dark"],
      ["iznik", "dark"],
      ["cyanotype", "dark"],
    ]);
  });

  it("leaves the ground alone when the family changes", () => {
    document.documentElement.dataset.mode = "dark";
    renderAppearance();
    fireEvent.click(screen.getByRole("radio", { name: /Cyanotype/ }));
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(localStorage.getItem("prison.mode")).toBeNull();
  });
});

describe("SettingsModal — ignored checks", () => {
  const open = (props: Partial<React.ComponentProps<typeof SettingsModal>> = {}) =>
    render(
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open
        onClose={vi.fn()}
        ignored={{ orgs: {}, repos: {} }}
        onIgnoredChange={vi.fn()}
        {...props}
      />,
    );

  it("has its own section, apart from tracked checks", () => {
    open();
    expect(screen.getByRole("tab", { name: "Ignored checks" })).toBeInTheDocument();
  });

  // Ignoring starts on the board. The panel is where you find out what you did
  // there, so an empty one has to say where the names come from.
  it("says where ignored checks come from while there are none", () => {
    open();
    selectSection("Ignored checks");
    expect(screen.getByText(/right-click a check/i)).toBeInTheDocument();
  });

  it("lists what a repo ignores, under the repo's name", () => {
    open({ ignored: { orgs: {}, repos: { "acme/web": ["flaky-e2e"] } } });
    selectSection("Ignored checks");
    // The picker names the repo and says how much it ignores; the panel opens
    // on it, because it is the only scope holding anything.
    expect(screen.getByRole("option", { name: "acme/web (1)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ignored check 1 for acme/web")).toHaveValue("flaky-e2e");
  });

  it("stops ignoring a check when its row is removed", () => {
    const onIgnoredChange = vi.fn();
    open({
      ignored: { orgs: {}, repos: { "acme/web": ["flaky-e2e", "nightly"] } },
      onIgnoredChange,
    });
    selectSection("Ignored checks");
    fireEvent.click(screen.getByRole("button", { name: "Remove flaky-e2e from acme/web" }));
    expect(onIgnoredChange).toHaveBeenCalledWith({ orgs: {}, repos: { "acme/web": ["nightly"] } });
  });

  it("drops the repo entirely once its last ignored check goes", () => {
    const onIgnoredChange = vi.fn();
    open({ ignored: { orgs: {}, repos: { "acme/web": ["flaky-e2e"] } }, onIgnoredChange });
    selectSection("Ignored checks");
    fireEvent.click(screen.getByRole("button", { name: "Remove flaky-e2e from acme/web" }));
    expect(onIgnoredChange).toHaveBeenCalledWith({ orgs: {}, repos: {} });
  });

  it("renames an ignored check in place", () => {
    const onIgnoredChange = vi.fn();
    open({ ignored: { orgs: {}, repos: { "acme/web": ["flaky-e2e"] } }, onIgnoredChange });
    selectSection("Ignored checks");
    fireEvent.change(screen.getByLabelText("Ignored check 1 for acme/web"), {
      target: { value: "flaky-e2e-v2" },
    });
    expect(onIgnoredChange).toHaveBeenCalledWith({
      orgs: {},
      repos: { "acme/web": ["flaky-e2e-v2"] },
    });
  });

  // A check that is broken everywhere is worth saying once, and the owner list
  // is the only place to say it before the board has ever drawn the chip.
  it("leaves the other names alone while one is renamed", () => {
    const onIgnoredChange = vi.fn();
    open({ ignored: { orgs: {}, repos: { "acme/web": ["flaky", "nightly"] } }, onIgnoredChange });
    selectSection("Ignored checks");
    fireEvent.change(screen.getByLabelText("Ignored check 1 for acme/web"), {
      target: { value: "flaky-v2" },
    });
    expect(onIgnoredChange).toHaveBeenCalledWith({
      orgs: {},
      repos: { "acme/web": ["flaky-v2", "nightly"] },
    });
  });

  // The panel is one section of a modal that is rendered plenty of places; a
  // consumer that never wired ignoring up should get an inert panel, not a
  // crash on the first keystroke.
  it("stays inert when nothing is listening", () => {
    render(
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open
        onClose={vi.fn()}
      />,
    );
    selectSection("Ignored checks");
    fireEvent.change(screen.getByLabelText("New ignored check for acme"), {
      target: { value: "nightly" },
    });
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Ignore for acme" })),
    ).not.toThrow();
  });

  it("ignores a check for every repo an owner has", () => {
    const onIgnoredChange = vi.fn();
    open({ onIgnoredChange });
    selectSection("Ignored checks");
    fireEvent.change(screen.getByLabelText("New ignored check for acme"), {
      target: { value: "nightly-e2e" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ignore for acme" }));
    expect(onIgnoredChange).toHaveBeenCalledWith({
      orgs: { acme: ["nightly-e2e"] },
      repos: {},
    });
  });

  it("adds on Enter too", () => {
    const onIgnoredChange = vi.fn();
    open({ onIgnoredChange });
    selectSection("Ignored checks");
    fireEvent.change(screen.getByLabelText("New ignored check for acme"), {
      target: { value: "nightly-e2e" },
    });
    fireEvent.keyDown(screen.getByLabelText("New ignored check for acme"), { key: "Enter" });
    expect(onIgnoredChange).toHaveBeenCalledWith({ orgs: { acme: ["nightly-e2e"] }, repos: {} });
  });

  it("refuses a blank name and one already on the list", () => {
    const onIgnoredChange = vi.fn();
    open({ ignored: { orgs: { acme: ["nightly"] }, repos: {} }, onIgnoredChange });
    selectSection("Ignored checks");
    fireEvent.click(screen.getByRole("button", { name: "Ignore for acme" }));
    fireEvent.change(screen.getByLabelText("New ignored check for acme"), {
      target: { value: "nightly" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ignore for acme" }));
    expect(onIgnoredChange).not.toHaveBeenCalled();
  });

  it("keeps each scope's list to itself", () => {
    const onIgnoredChange = vi.fn();
    open({
      ignored: { orgs: { acme: ["owner-wide"] }, repos: { "acme/web": ["repo-only"] } },
      onIgnoredChange,
    });
    selectSection("Ignored checks");
    fireEvent.change(screen.getByRole("combobox", { name: "Ignored checks scope" }), {
      target: { value: "repo:acme/web" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove repo-only from acme/web" }));
    expect(onIgnoredChange).toHaveBeenCalledWith({ orgs: { acme: ["owner-wide"] }, repos: {} });
  });
});

// One scope at a time. The panels used to stack every owner and every repo,
// so the scroll grew with the number of scopes; a picker keeps the panel the
// height of one list however many scopes there are. Both check panels use it,
// so learning it once is enough.
describe("SettingsModal — scope picker", () => {
  const openTracked = (props: Partial<React.ComponentProps<typeof SettingsModal>> = {}) => {
    render(
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open
        onClose={vi.fn()}
        {...props}
      />,
    );
    selectSection("Tracked checks");
  };

  const pick = (label: string, value: string) =>
    fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });

  it("shows one scope's checks, not every scope's at once", () => {
    openTracked({ value: { orgs: { acme: ["lint"], beta: ["ci"] }, repos: {} } });
    expect(screen.getByRole("textbox", { name: "Check 1 for acme" })).toHaveValue("lint");
    expect(screen.queryByRole("textbox", { name: "Check 1 for beta" })).not.toBeInTheDocument();
  });

  it("swaps the list when another scope is picked", () => {
    openTracked({ value: { orgs: { acme: ["lint"], beta: ["ci"] }, repos: {} } });
    pick("Tracked checks scope", "owner:beta");
    expect(screen.getByRole("textbox", { name: "Check 1 for beta" })).toHaveValue("ci");
    expect(screen.queryByRole("textbox", { name: "Check 1 for acme" })).not.toBeInTheDocument();
  });

  // Opening on an empty owner default would hide the one repo the user
  // actually configured behind a picker they haven't noticed yet.
  it("opens on the first scope that has something configured", () => {
    openTracked({ value: { orgs: {}, repos: { "beta/api": ["ci"] } } });
    expect(screen.getByRole("textbox", { name: "Check 1 for beta/api" })).toHaveValue("ci");
  });

  it("offers every owner and every configured repo", () => {
    openTracked({ value: { orgs: {}, repos: { "beta/api": ["ci"] } } });
    const options = screen
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(["owner:acme", "owner:beta", "repo:beta/api"]);
  });

  // The stacked lists said at a glance which scope held something; the picker
  // has to keep saying it, or a configured repo hides behind a name.
  it("says how much each scope holds", () => {
    openTracked({ value: { orgs: { acme: ["lint", "ci"] }, repos: { "beta/api": ["qa"] } } });
    const labels = screen.getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(["acme (2)", "beta", "beta/api (1)"]);
  });

  it("adds a repo scope through the combobox and lands on it", () => {
    const onChange = vi.fn();
    openTracked({ onChange });
    fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Repository" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    expect(onChange).toHaveBeenLastCalledWith({ orgs: {}, repos: { "acme/web": [] } });
    expect(
      screen.getByRole("textbox", { name: "New check for acme/web" }),
    ).toBeInTheDocument();
  });

  // Picking a repo that already has an override is how you get back to it
  // when it has scrolled out of mind — it must not read as starting over.
  it("keeps a repo's checks when it is picked again", () => {
    const onChange = vi.fn();
    openTracked({ value: { orgs: {}, repos: { "acme/web": ["lint"] } }, onChange });
    fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Repository" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    expect(onChange).toHaveBeenLastCalledWith({
      orgs: {},
      repos: { "acme/web": [required("lint")] },
    });
  });

  it("lists a repo once however many times it is picked", () => {
    openTracked();
    const addAcmeWeb = () => {
      fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
      fireEvent.focus(screen.getByRole("combobox", { name: "Repository" }));
      fireEvent.mouseDown(screen.getAllByRole("option", { name: "acme/web" }).slice(-1)[0]);
    };
    addAcmeWeb();
    addAcmeWeb();
    expect(screen.getAllByRole("option", { name: "acme/web" })).toHaveLength(1);
  });

  it("backs out of adding a repository", () => {
    openTracked();
    fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("combobox", { name: "Repository" })).not.toBeInTheDocument();
  });

  it("clears a repo's whole ignore list from its scope", () => {
    const onIgnoredChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open
        onClose={vi.fn()}
        ignored={{ orgs: {}, repos: { "acme/web": ["flaky", "nightly"] } }}
        onIgnoredChange={onIgnoredChange}
      />,
    );
    selectSection("Ignored checks");
    fireEvent.click(
      screen.getByRole("button", { name: "Stop ignoring everything for acme/web" }),
    );
    expect(onIgnoredChange).toHaveBeenCalledWith({ orgs: {}, repos: {} });
  });

  // Ignoring usually starts on the board, but a check known to be broken can
  // be written off before it has ever drawn a chip — same picker, same flow.
  it("ignores a check on a repo picked here, before the board ever draws it", () => {
    const onIgnoredChange = vi.fn();
    render(
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open
        onClose={vi.fn()}
        ignored={{ orgs: {}, repos: {} }}
        onIgnoredChange={onIgnoredChange}
      />,
    );
    selectSection("Ignored checks");
    fireEvent.click(screen.getByRole("button", { name: /add repository/i }));
    fireEvent.focus(screen.getByRole("combobox", { name: "Repository" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    fireEvent.change(screen.getByLabelText("New ignored check for acme/web"), {
      target: { value: "nightly-e2e" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ignore for acme/web" }));
    expect(onIgnoredChange).toHaveBeenCalledWith({
      orgs: {},
      repos: { "acme/web": ["nightly-e2e"] },
    });
  });

  // An owner scope is a default in one panel and a blanket ignore in the
  // other; one hard-coded group label would contradict the panel it sits in.
  it("names the owner group after what the panel does with it", () => {
    openTracked();
    const groups = (label: string) =>
      Array.from(
        (screen.getByRole("combobox", { name: label }) as HTMLSelectElement).querySelectorAll(
          "optgroup",
        ),
      ).map((g) => g.label);
    expect(groups("Tracked checks scope")).toContain("Owner defaults");
    selectSection("Ignored checks");
    expect(groups("Ignored checks scope")).toContain("Owner-wide");
  });

  it("puts focus back on the picker after removing a scope", () => {
    openTracked({ value: { orgs: {}, repos: { "acme/web": ["lint"] } } });
    fireEvent.click(screen.getByRole("button", { name: "Remove acme/web override" }));
    // The button unmounts with the scope it removed; focus has to land
    // somewhere, and the picker is where the work continues.
    expect(screen.getByRole("combobox", { name: "Tracked checks scope" })).toHaveFocus();
  });

  // Emptying a list row by row is not a request to go somewhere else. The
  // scope the panel opened on is pinned, so only an explicit pick — or the
  // scope-level Remove — moves the view.
  it("stays on the scope it opened on once its last name is removed", () => {
    const onIgnoredChange = vi.fn();
    const props = (ignored: { orgs: Record<string, string[]>; repos: Record<string, string[]> }) => (
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open
        onClose={vi.fn()}
        ignored={ignored}
        onIgnoredChange={onIgnoredChange}
      />
    );
    const { rerender } = render(props({ orgs: {}, repos: { "acme/web": ["flaky"] } }));
    selectSection("Ignored checks");
    fireEvent.click(screen.getByRole("button", { name: "Remove flaky from acme/web" }));
    rerender(props({ orgs: {}, repos: {} }));
    expect(screen.getByLabelText("New ignored check for acme/web")).toBeInTheDocument();
  });

  it("drops a repo's checks when its scope is removed, and falls back", () => {
    const onChange = vi.fn();
    // Stateful, because the removal and the fallback happen in one commit:
    // a frozen `value` would show the scope still holding its checks.
    function Harness() {
      const [value, setValue] = useState<TrackedChecks>({
        orgs: {},
        repos: { "acme/web": ["lint"] },
      });
      return (
        <SettingsModal
          {...filterProps}
          owners={owners}
          availableRepos={someRepos}
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          open
          onClose={vi.fn()}
        />
      );
    }
    render(<Harness />);
    selectSection("Tracked checks");
    fireEvent.click(screen.getByRole("button", { name: "Remove acme/web override" }));
    expect(onChange).toHaveBeenLastCalledWith({ orgs: {}, repos: {} });
    // The scope goes with the checks, so the panel has to land somewhere: the
    // first owner, which is what a repo with no override falls back to anyway.
    expect(screen.getByRole("textbox", { name: "New check for acme" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /^acme\/web/ }),
    ).not.toBeInTheDocument();
  });

  it("offers no remove button on an owner scope", () => {
    openTracked({ value: { orgs: { acme: ["lint"] }, repos: {} } });
    expect(screen.queryByRole("button", { name: /remove .* override/i })).not.toBeInTheDocument();
  });

  it("uses the same picker for ignored checks", () => {
    render(
      <SettingsModal
        {...filterProps}
        owners={owners}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open
        onClose={vi.fn()}
        ignored={{ orgs: { beta: ["nightly"] }, repos: {} }}
        onIgnoredChange={vi.fn()}
      />,
    );
    selectSection("Ignored checks");
    expect(screen.getByLabelText("Ignored check 1 for beta")).toHaveValue("nightly");
    pick("Ignored checks scope", "owner:acme");
    expect(screen.getByLabelText("New ignored check for acme")).toBeInTheDocument();
  });
});
