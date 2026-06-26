import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrRow } from "./PrRow";
import type { Suggestion } from "@/lib/suggest";

const now = new Date("2026-06-26T12:00:00Z");

const suggestion: Suggestion = {
  text: "Re-run failed checks",
  href: "https://github.com/org/repo/pull/42/checks",
};

describe("PrRow", () => {
  it("renders title", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
      />,
    );
    expect(screen.getByText("Fix the thing")).toBeInTheDocument();
  });

  it("renders Open PR link with correct href", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
      />,
    );
    const link = screen.getByRole("link", { name: /open pr/i });
    expect(link).toHaveAttribute("href", "https://github.com/org/repo/pull/42");
  });

  it("renders suggestion text and href", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
      />,
    );
    const hint = screen.getByRole("link", { name: /re-run failed checks/i });
    expect(hint).toHaveAttribute(
      "href",
      "https://github.com/org/repo/pull/42/checks",
    );
  });

  it("renders the optional detail slot when provided", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        detail={<span>2 failing checks</span>}
        suggestion={suggestion}
      />,
    );
    expect(screen.getByText("2 failing checks")).toBeInTheDocument();
  });
});
