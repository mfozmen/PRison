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

  it("title is a link to the PR url with correct attributes", () => {
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
    const link = screen.getByRole("link", { name: /open fix the thing on github/i });
    expect(link).toHaveAttribute("href", "https://github.com/org/repo/pull/42");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("no standalone 'Open PR' button text in the rendered output", () => {
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
    expect(screen.queryByRole("link", { name: /^open pr$/i })).toBeNull();
  });

  it("renders amber left accent border when accent='blocking'", () => {
    const { container } = render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
        accent="blocking"
      />,
    );
    expect(container.firstChild).toHaveClass("border-l-warning");
  });

  it("amber left accent persists on hover: card has hover:border-l-warning when accent='blocking'", () => {
    const { container } = render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
        accent="blocking"
      />,
    );
    expect(container.firstChild).toHaveClass("hover:border-l-warning");
  });

  it("no accent border class when accent is not provided", () => {
    const { container } = render(
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
    expect(container.firstChild).not.toHaveClass("border-l-warning");
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
    expect(hint).toHaveAttribute("target", "_blank");
    expect(hint).toHaveAttribute("rel", "noopener noreferrer");
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

  it("Draft badge is shown when draft={true}", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        draft={true}
        suggestion={suggestion}
      />,
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("Draft badge is absent when draft is not passed", () => {
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
    expect(screen.queryByText("Draft")).toBeNull();
  });

  it("Blocked badge renders when blocked=true", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
        blocked={true}
      />,
    );
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("Blocked badge absent when blocked is not passed", () => {
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
    expect(screen.queryByText("Blocked")).toBeNull();
  });

  it("Blocked badge absent when blocked=false", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
        blocked={false}
      />,
    );
    expect(screen.queryByText("Blocked")).toBeNull();
  });
});
