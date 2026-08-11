import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryTiles, oldestOf } from "./SummaryTiles";

const NOW = new Date("2026-08-11T12:00:00Z");
const tile = (label: string) =>
  screen.getByText(label).parentElement as HTMLElement;

describe("oldestOf", () => {
  it("returns the earliest of the timestamps", () => {
    expect(
      oldestOf(
        "2026-08-11T09:00:00Z",
        "2026-08-09T09:00:00Z",
        "2026-08-10T09:00:00Z",
      ),
    ).toBe("2026-08-09T09:00:00Z");
  });

  it("ignores the lists that have no head", () => {
    expect(oldestOf(undefined, "2026-08-10T09:00:00Z", undefined)).toBe(
      "2026-08-10T09:00:00Z",
    );
  });

  it("returns null when every list is empty", () => {
    expect(oldestOf(undefined, undefined, undefined)).toBeNull();
  });
});

describe("SummaryTiles", () => {
  const props = {
    waiting: 3,
    stuck: 5,
    replies: 2,
    oldest: "2026-08-09T12:00:00Z",
    now: NOW,
  };

  it("shows a count for each queue", () => {
    render(<SummaryTiles {...props} />);
    expect(tile("Waiting on you")).toHaveTextContent("3");
    expect(tile("Awaiting your reply")).toHaveTextContent("2");
    expect(tile("Stuck on checks")).toHaveTextContent("5");
  });

  it("shows the longest wait as an age rather than a timestamp", () => {
    render(<SummaryTiles {...props} />);
    expect(tile("Longest wait")).toHaveTextContent("2d");
  });

  // A zero is information: how many are waiting on you is worth reading when
  // the answer is none, and a row that changes width as counts drop is harder
  // to scan than a stable one.
  it("renders a zero rather than dropping the tile", () => {
    render(<SummaryTiles {...props} waiting={0} />);
    expect(tile("Waiting on you")).toHaveTextContent("0");
    expect(screen.getAllByTestId("summary-tile")).toHaveLength(4);
  });

  // No queue is not a wait of zero, so it must not read as one.
  it("shows a dash, not a zero age, when nothing is waiting", () => {
    render(<SummaryTiles {...props} oldest={null} />);
    expect(tile("Longest wait")).toHaveTextContent("—");
    expect(tile("Longest wait")).not.toHaveTextContent("0m");
  });

  // Colouring every tile would colour none of them. Only the two where someone
  // else is held up by the viewer carry a status token.
  it("colours only the two tiles the viewer is blocking", () => {
    render(<SummaryTiles {...props} />);
    expect(tile("Waiting on you").querySelector("dd")).toHaveClass(
      "text-danger",
    );
    expect(tile("Awaiting your reply").querySelector("dd")).toHaveClass(
      "text-warning",
    );
    expect(tile("Stuck on checks").querySelector("dd")).toHaveClass(
      "text-foreground",
    );
    expect(tile("Longest wait").querySelector("dd")).toHaveClass(
      "text-foreground",
    );
  });

  // "Ready to merge" is good news; a row that reads as a warning has no place
  // for it.
  it("has no tile for ready to merge", () => {
    render(<SummaryTiles {...props} />);
    expect(screen.queryByText(/ready to merge/i)).not.toBeInTheDocument();
  });
});
