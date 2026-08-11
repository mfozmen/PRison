import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryTiles } from "./SummaryTiles";

const NOW = new Date("2026-08-11T12:00:00Z");
// The tiles wrap their label in an anchor, so walk up to the tile itself
// rather than assuming the label's parent is it.
const tile = (label: string) =>
  screen.getByText(label).closest("[data-testid='summary-tile']") as HTMLElement;

describe("SummaryTiles", () => {
  const props = {
    waiting: { count: 3, oldest: "2026-08-09T12:00:00Z" },
    stuck: { count: 5, oldest: "2026-08-05T12:00:00Z" },
    replies: { count: 2, oldest: "2026-08-11T08:00:00Z" },
    now: NOW,
  };

  it("shows a count for each queue", () => {
    render(<SummaryTiles {...props} />);
    expect(tile("Waiting on you")).toHaveTextContent("3");
    expect(tile("Awaiting your reply")).toHaveTextContent("2");
    expect(tile("Stuck on checks")).toHaveTextContent("5");
  });

  // The age used to live in a tile of its own that never named the queue it was
  // reading. Each tile now answers both questions about the same list.
  it("shows each queue's own oldest wait beside its count", () => {
    render(<SummaryTiles {...props} />);
    expect(tile("Waiting on you")).toHaveTextContent("oldest 2d");
    expect(tile("Awaiting your reply")).toHaveTextContent("oldest 4h");
    expect(tile("Stuck on checks")).toHaveTextContent("oldest 6d");
  });

  // There is no fourth queue, and inventing one to fill a grid cell is how the
  // tile this replaces came to exist.
  it("has three tiles and no roaming longest-wait tile", () => {
    render(<SummaryTiles {...props} />);
    expect(screen.getAllByTestId("summary-tile")).toHaveLength(3);
    expect(screen.queryByText(/longest wait/i)).not.toBeInTheDocument();
  });

  // A zero is information: how many are waiting on you is worth reading when
  // the answer is none, and a row that changes width as counts drop is harder
  // to scan than a stable one.
  it("renders a zero rather than dropping the tile", () => {
    render(<SummaryTiles {...props} waiting={{ count: 0 }} />);
    expect(tile("Waiting on you")).toHaveTextContent("0");
    expect(screen.getAllByTestId("summary-tile")).toHaveLength(3);
  });

  // An empty queue has no oldest, and the 0 has already said so.
  it("omits the age when the queue is empty", () => {
    render(<SummaryTiles {...props} waiting={{ count: 0 }} />);
    expect(tile("Waiting on you")).not.toHaveTextContent(/oldest/);
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
  });

  // "Ready to merge" is good news; a row that reads as a warning has no place
  // for it.
  it("has no tile for ready to merge", () => {
    render(<SummaryTiles {...props} />);
    expect(screen.queryByText(/ready to merge/i)).not.toBeInTheDocument();
  });

  // Navigation belongs to the section index. Tiles that were links forced a
  // fourth control onto the row for the sections they could not cover.
  it("carries no links", () => {
    render(<SummaryTiles {...props} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
