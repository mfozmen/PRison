import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewedPrRow } from "./ReviewedPrRow";
import type { ReviewedPr } from "@/lib/types";

const now = new Date("2026-06-26T12:00:00Z");

const approved: ReviewedPr = {
  id: "1",
  title: "Add the widget",
  url: "https://github.com/acme/web/pull/42",
  number: 42,
  repo: "acme/web",
  author: "alice",
  isDraft: false,
  state: "APPROVED",
  reviewedAt: "2026-06-24T12:00:00Z",
  updatedSince: false,
};

describe("ReviewedPrRow", () => {
  it("links the title to the PR with new-tab attributes", () => {
    render(<ReviewedPrRow pr={approved} now={now} />);
    const link = screen.getByRole("link", { name: /open add the widget on github/i });
    expect(link).toHaveAttribute("href", "https://github.com/acme/web/pull/42");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the repo, number, author and how long ago the review was left", () => {
    render(<ReviewedPrRow pr={approved} now={now} />);
    expect(screen.getByText("acme/web #42 · alice")).toBeInTheDocument();
    expect(screen.getByText(/reviewed 2d ago/)).toBeInTheDocument();
  });

  it.each([
    ["APPROVED", "Approved"],
    ["CHANGES_REQUESTED", "Changes requested"],
    ["COMMENTED", "Commented"],
  ] as const)("badges a %s review as %s", (state, label) => {
    render(<ReviewedPrRow pr={{ ...approved, state }} now={now} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("flags a PR the author pushed to after the review", () => {
    render(<ReviewedPrRow pr={{ ...approved, updatedSince: true }} now={now} />);
    expect(screen.getByText("Updated since")).toBeInTheDocument();
  });

  it("stays quiet when nothing has happened since the review", () => {
    render(<ReviewedPrRow pr={approved} now={now} />);
    expect(screen.queryByText("Updated since")).not.toBeInTheDocument();
  });
});
