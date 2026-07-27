import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClosedPrRow } from "./ClosedPrRow";
import type { ClosedPr } from "@/lib/types";

const now = new Date("2026-06-26T12:00:00Z");

const mergedPr: ClosedPr = {
  id: "1",
  title: "Fix the thing",
  url: "https://github.com/org/repo/pull/42",
  number: 42,
  repo: "org/repo",
  merged: true,
  endedAt: "2026-06-24T12:00:00Z",
};

const closedPr: ClosedPr = {
  ...mergedPr,
  id: "2",
  title: "Abandoned idea",
  number: 43,
  merged: false,
  endedAt: "2026-06-23T12:00:00Z",
};

describe("ClosedPrRow", () => {
  it("links the title to the PR with new-tab attributes", () => {
    render(<ClosedPrRow pr={mergedPr} now={now} />);
    const link = screen.getByRole("link", { name: /open fix the thing on github/i });
    expect(link).toHaveAttribute("href", "https://github.com/org/repo/pull/42");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the repo and number", () => {
    render(<ClosedPrRow pr={mergedPr} now={now} />);
    expect(screen.getByText("org/repo #42")).toBeInTheDocument();
  });

  it("shows a Merged badge and 'merged Xd ago' for a merged PR", () => {
    render(<ClosedPrRow pr={mergedPr} now={now} />);
    expect(screen.getByText("Merged")).toBeInTheDocument();
    expect(screen.getByText("merged 2d ago")).toBeInTheDocument();
  });

  it("shows a Closed badge and 'closed Xd ago' for an unmerged PR", () => {
    render(<ClosedPrRow pr={closedPr} now={now} />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("closed 3d ago")).toBeInTheDocument();
  });
});
