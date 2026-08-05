import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityBell } from "./ActivityBell";
import { activityEntry } from "@/lib/fixtures";
import { MAX_ENTRIES, type ActivityEntry } from "@/lib/activity";

const NOW = new Date("2026-06-25T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderBell(entries: ActivityEntry[] = [], overrides = {}) {
  const props = { entries, onOpen: vi.fn(), onClear: vi.fn(), ...overrides };
  render(<ActivityBell {...props} />);
  return props;
}

const bell = () => screen.getByRole("button", { name: /^activity/i });

describe("ActivityBell", () => {
  it("shows no badge when everything has been read", () => {
    renderBell([activityEntry({ seen: true })]);
    expect(bell()).toHaveAccessibleName("Activity");
  });

  it("counts the unseen entries in the badge and in the accessible name", () => {
    renderBell([
      activityEntry({ id: "a" }),
      activityEntry({ id: "b" }),
      activityEntry({ id: "c", seen: true }),
    ]);
    expect(bell()).toHaveAccessibleName("Activity, 2 unseen");
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("pulses only while something is unseen, and never against a reduced-motion preference", () => {
    const { rerender } = render(
      <ActivityBell entries={[activityEntry()]} onOpen={vi.fn()} onClear={vi.fn()} />,
    );
    // The prefix is what makes the animation conditional on the preference —
    // without it the badge would keep moving for someone who asked it not to.
    expect(screen.getByText("1")).toHaveClass("motion-safe:animate-pulse");
    rerender(
      <ActivityBell
        entries={[activityEntry({ seen: true })]}
        onOpen={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("keeps the panel closed until the bell is clicked", () => {
    renderBell([activityEntry()]);
    expect(bell()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Activity" })).not.toBeInTheDocument();
  });

  it("marks the feed read when the panel opens, and not before", () => {
    const { onOpen } = renderBell([activityEntry()]);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(bell());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(bell()).toHaveAttribute("aria-expanded", "true");
  });

  it("does not re-mark on the click that closes it", () => {
    const { onOpen } = renderBell([activityEntry()]);
    fireEvent.click(bell());
    fireEvent.click(bell());
    expect(screen.queryByRole("region", { name: "Activity" })).not.toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and hands focus back to the bell", () => {
    renderBell([activityEntry()]);
    fireEvent.click(bell());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Activity" })).not.toBeInTheDocument();
    expect(bell()).toHaveFocus();
  });

  it("ignores other keys", () => {
    renderBell([activityEntry()]);
    fireEvent.click(bell());
    fireEvent.keyDown(document, { key: "a" });
    expect(screen.getByRole("region", { name: "Activity" })).toBeInTheDocument();
  });

  it("closes when a click lands outside it", () => {
    renderBell([activityEntry()]);
    fireEvent.click(bell());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("region", { name: "Activity" })).not.toBeInTheDocument();
  });

  it("stays open for a click inside it", () => {
    renderBell([activityEntry()]);
    fireEvent.click(bell());
    fireEvent.mouseDown(screen.getByRole("region", { name: "Activity" }));
    expect(screen.getByRole("region", { name: "Activity" })).toBeInTheDocument();
  });

  it("explains itself when there is no history", () => {
    renderBell([]);
    fireEvent.click(bell());
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear all/i })).not.toBeInTheDocument();
  });

  it("names each entry, says what happened, and links to it", () => {
    renderBell([
      activityEntry({
        repo: "acme/web",
        number: 42,
        status: "ready",
        url: "https://github.com/acme/web/pull/42",
        recordedAt: "2026-06-25T11:58:00Z",
      }),
    ]);
    fireEvent.click(bell());
    expect(screen.getByText("acme/web #42")).toBeInTheDocument();
    expect(screen.getByText("is ready to merge")).toBeInTheDocument();
    expect(screen.getByText("2m")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/acme/web/pull/42",
    );
  });

  it("links a comment to the thread rather than the PR", () => {
    renderBell([
      activityEntry({
        status: "comment",
        url: "https://github.com/acme/api/pull/2#discussion_r1",
      }),
    ]);
    fireEvent.click(bell());
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/acme/api/pull/2#discussion_r1",
    );
  });

  it("lists the same PR once per change", () => {
    // Two entries share an id and a recordedAt — a poll stamps everything it
    // found with one instant — so neither is a usable key on its own.
    renderBell([
      activityEntry({ id: "PR_1", status: "ready" }),
      activityEntry({ id: "PR_1", status: "failing" }),
    ]);
    fireEvent.click(bell());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("marks the unseen rows in words, not only in colour", () => {
    renderBell([
      activityEntry({ id: "a", seen: false }),
      activityEntry({ id: "b", seen: true }),
    ]);
    fireEvent.click(bell());
    expect(screen.getAllByText("Unseen")).toHaveLength(1);
  });

  it("clears the whole feed on request", () => {
    const { onClear } = renderBell([activityEntry()]);
    fireEvent.click(bell());
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("scrolls rather than growing without bound", () => {
    renderBell(
      Array.from({ length: MAX_ENTRIES }, (_, i) => activityEntry({ id: `e-${i}` })),
    );
    fireEvent.click(bell());
    expect(screen.getByRole("list")).toHaveClass("overflow-y-auto");
  });

  it("stops listening once it is closed", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    renderBell([activityEntry()]);
    fireEvent.click(bell());
    fireEvent.click(bell());
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("mousedown", expect.any(Function));
  });
});
