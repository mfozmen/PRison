import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackedChecksSettings } from "./TrackedChecksSettings";
import type { Org } from "@/lib/types";
import type { TrackedChecks } from "@/lib/tracked-checks";

const orgs: Org[] = [
  { login: "acme", avatarUrl: "https://example.com/acme.png" },
  { login: "beta", avatarUrl: "https://example.com/beta.png" },
];

const emptyValue: TrackedChecks = { orgs: {}, repos: {} };
const someRepos = ["acme/web", "beta/api"];

describe("TrackedChecksSettings", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <TrackedChecksSettings
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
      <TrackedChecksSettings
        orgs={orgs}
        availableRepos={[]}
        value={value}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    const acmeInput = screen.getByRole("textbox", { name: "acme check names" });
    expect(acmeInput).toHaveValue("qa/smoke, lint");
    const betaInput = screen.getByRole("textbox", { name: "beta check names" });
    expect(betaInput).toHaveValue("ci/test");
  });

  it("editing an org input calls onChange with correct shape", () => {
    const onChange = vi.fn();
    render(
      <TrackedChecksSettings
        orgs={[{ login: "acme", avatarUrl: "" }]}
        availableRepos={[]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
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
      <TrackedChecksSettings
        orgs={[{ login: "acme", avatarUrl: "" }]}
        availableRepos={[]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
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
      <TrackedChecksSettings
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
      <TrackedChecksSettings
        orgs={[{ login: "acme", avatarUrl: "" }]}
        availableRepos={[]}
        value={value}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
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
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Repository" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    expect(screen.getByRole("combobox", { name: "Repository" })).toBeInTheDocument();
  });

  it("editing a repo override calls onChange with correct shape", () => {
    const onChange = vi.fn();
    render(
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={["acme/web"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
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
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
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
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={someRepos}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add override/i }));
    expect(screen.getByRole("combobox", { name: "Repository" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove repo override/i }));
    expect(screen.queryByRole("combobox", { name: "Repository" })).not.toBeInTheDocument();
  });

  it("clicking the close button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={onClose}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /close tracked checks settings/i }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop does NOT call onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <TrackedChecksSettings
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
      <TrackedChecksSettings
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
      <TrackedChecksSettings
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
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={["acme/web", "beta/api"]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
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
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={[]}
        value={value}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    // The row is seeded from value.repos; the combobox input displays the repo name
    const combobox = screen.getByRole("combobox", { name: "Repository" });
    expect(combobox).toHaveValue("legacy/repo");
  });

  it("selecting a repo and entering checks calls onChange with the right repos shape", () => {
    const onChange = vi.fn();
    render(
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={["acme/web"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );
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
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={["acme/web"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );

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
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={["acme/web", "beta/api"]}
        value={emptyValue}
        onChange={onChange}
        open={true}
        onClose={vi.fn()}
      />,
    );

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
      <TrackedChecksSettings
        orgs={[]}
        availableRepos={[]}
        value={emptyValue}
        onChange={vi.fn()}
        open={true}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no repositories loaded yet/i),
    ).toBeInTheDocument();
    // Add override is always available so the user can search server-side
    expect(screen.getByRole("button", { name: /add override/i })).toBeInTheDocument();
  });
});
