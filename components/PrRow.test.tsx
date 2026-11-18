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

  it.each([
    ["ready", "text-success"],
    ["reply", "text-warning"],
    ["review", "text-accent"],
    ["fail", "text-danger"],
    ["pending", "text-warning"],
  ] as const)("marks a %s row with an icon in %s, never colour alone", (kind, cls) => {
    const { container } = render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
        kind={kind}
      />,
    );
    expect(container.querySelector("svg[aria-hidden]")).toHaveClass(cls);
    expect(container.firstChild).toHaveAttribute("data-kind", kind);
  });

  it("draws no status icon without a kind", () => {
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
    expect(container.firstChild).not.toHaveAttribute("data-kind");
  });

  it("says when it is the row the Next move strip points at", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
        kind="fail"
        marked
      />,
    );
    expect(screen.getByText(/next move/i)).toHaveClass("text-danger");
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

  it("does not clamp the title by default, so a long PR title stays fully readable", () => {
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
    expect(screen.getByRole("link", { name: /open fix the thing on github/i })).not.toHaveClass(
      "line-clamp-2",
    );
  });

  it("clamps the title to two lines when clampTitle is set, bounding a comment-preview row", () => {
    render(
      <PrRow
        title="Fix the thing"
        repo="org/repo"
        number={42}
        url="https://github.com/org/repo/pull/42"
        since="2026-06-25T00:00:00Z"
        now={now}
        suggestion={suggestion}
        clampTitle
      />,
    );
    expect(screen.getByRole("link", { name: /open fix the thing on github/i })).toHaveClass(
      "line-clamp-2",
    );
  });

});
