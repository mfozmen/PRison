import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RepoCombobox } from "./RepoCombobox";

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Advance debounce timer AND flush all resulting promise chains. */
async function drainDebounce() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe("RepoCombobox", () => {
  it("typing triggers a debounced fetch and renders results", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () => Promise.resolve(["acme/web"]),
    });

    render(<RepoCombobox value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.change(input, { target: { value: "acme" } });

    // Debounce has not fired yet
    expect(global.fetch).not.toHaveBeenCalled();

    await drainDebounce();

    expect(global.fetch).toHaveBeenCalledWith("/api/repos?q=acme");
    expect(screen.getByRole("option", { name: "acme/web" })).toBeInTheDocument();
  });

  it("selecting a result calls onChange", async () => {
    const onChange = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () => Promise.resolve(["acme/web"]),
    });

    render(<RepoCombobox value="" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.change(input, { target: { value: "acme" } });

    await drainDebounce();

    expect(screen.getByRole("option", { name: "acme/web" })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("option", { name: "acme/web" }));
    expect(onChange).toHaveBeenCalledWith("acme/web");
  });

  it("empty input shows suggestions on focus", () => {
    render(
      <RepoCombobox value="" onChange={vi.fn()} suggestions={["org/a", "org/b"]} />,
    );
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.focus(input);
    expect(screen.getByRole("option", { name: "org/a" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "org/b" })).toBeInTheDocument();
  });

  it("short query (< 2 chars) does not fetch", async () => {
    render(<RepoCombobox value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.change(input, { target: { value: "a" } });

    await drainDebounce();

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("stale response is ignored — only latest results shown", async () => {
    // First fetch is slow (never resolves during the test advance)
    let resolveFirst!: (v: unknown) => void;
    const firstFetchResponse = new Promise((r) => {
      resolveFirst = r;
    });

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(firstFetchResponse)
      .mockResolvedValueOnce({
        json: () => Promise.resolve(["abc/repo"]),
      });

    render(<RepoCombobox value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Repository" });

    // Type "ab" — schedules first debounce
    fireEvent.change(input, { target: { value: "ab" } });
    // Advance 300ms to fire the first fetch
    act(() => vi.advanceTimersByTime(300));

    // Before first response arrives, type "abc" — schedules second debounce
    fireEvent.change(input, { target: { value: "abc" } });
    // Drain the second debounce; second fetch resolves with "abc/repo"
    await drainDebounce();

    expect(screen.getByRole("option", { name: "abc/repo" })).toBeInTheDocument();

    // Now resolve the first (stale) fetch — its result must be ignored
    resolveFirst({ json: () => Promise.resolve(["ab/stale"]) });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.queryByRole("option", { name: "ab/stale" })).not.toBeInTheDocument();
  });

  it("ignores an in-flight fetch once the query drops below 2 chars", async () => {
    let resolveFirst!: (v: unknown) => void;
    const firstFetchResponse = new Promise((r) => {
      resolveFirst = r;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      firstFetchResponse,
    );

    render(<RepoCombobox value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Repository" });

    // Type "ab" (>= 2) — schedules + dispatches the fetch
    fireEvent.change(input, { target: { value: "ab" } });
    act(() => vi.advanceTimersByTime(300));

    // Shorten to "a" (< 2) before the fetch resolves — this must invalidate it
    fireEvent.change(input, { target: { value: "a" } });

    // Now resolve the stale fetch; its results must NOT render
    resolveFirst({ json: () => Promise.resolve(["ab/web"]) });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.queryByRole("option", { name: "ab/web" })).not.toBeInTheDocument();
  });

  it("shows Searching… while fetch is in flight", async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(pending);

    render(<RepoCombobox value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.change(input, { target: { value: "acme" } });
    act(() => vi.advanceTimersByTime(300));

    // Searching indicator should appear while the fetch is still pending
    await act(async () => {});
    expect(screen.getByText("Searching…")).toBeInTheDocument();

    // Resolve inside act so the fetch's resulting state updates are flushed
    // within React's batch — leaves the test output pristine (no act() warning).
    await act(async () => {
      resolve({ json: () => Promise.resolve([]) });
      await vi.runAllTimersAsync();
    });
  });

  it("shows No matches when fetch returns empty for query ≥ 2 chars", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () => Promise.resolve([]),
    });

    render(<RepoCombobox value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.change(input, { target: { value: "zzz" } });

    await drainDebounce();

    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("keyboard ArrowDown + Enter selects an item", async () => {
    const onChange = vi.fn();
    render(
      <RepoCombobox value="" onChange={onChange} suggestions={["org/a", "org/b"]} />,
    );
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("org/a");
  });

  it("ArrowUp moves the highlight back up and clamps at the top", () => {
    const onChange = vi.fn();
    render(
      <RepoCombobox
        value=""
        onChange={onChange}
        suggestions={["org/a", "org/b", "org/c"]}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" }); // -> org/a
    fireEvent.keyDown(input, { key: "ArrowDown" }); // -> org/b
    fireEvent.keyDown(input, { key: "ArrowUp" }); // -> org/a
    fireEvent.keyDown(input, { key: "ArrowUp" }); // clamps at org/a
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("org/a");
  });

  it("clicking outside the component closes the dropdown", () => {
    render(
      <div>
        <RepoCombobox value="" onChange={vi.fn()} suggestions={["org/a"]} />
        <button type="button">outside</button>
      </div>,
    );
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape closes the dropdown", () => {
    render(
      <RepoCombobox value="" onChange={vi.fn()} suggestions={["org/a"]} />,
    );
    const input = screen.getByRole("combobox", { name: "Repository" });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("value prop sync updates the input when value changes externally", () => {
    const { rerender } = render(
      <RepoCombobox value="old/repo" onChange={vi.fn()} />,
    );
    expect(screen.getByRole("combobox", { name: "Repository" })).toHaveValue(
      "old/repo",
    );
    rerender(<RepoCombobox value="new/repo" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Repository" })).toHaveValue(
      "new/repo",
    );
  });
});
