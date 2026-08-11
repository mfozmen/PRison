import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionIndex } from "./SectionIndex";

const SECTIONS = [
  { id: "ready-to-merge", label: "Ready to merge", count: 2 },
  { id: "stuck-on-checks", label: "Stuck on checks", count: 0 },
  { id: "recently-closed", label: "Recently merged / closed", count: 11 },
];

describe("SectionIndex", () => {
  it("links every section it is given, in order", () => {
    render(<SectionIndex sections={SECTIONS} />);
    const links = screen.getAllByTestId("section-link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#ready-to-merge",
      "#stuck-on-checks",
      "#recently-closed",
    ]);
  });

  it("carries each section's count", () => {
    render(<SectionIndex sections={SECTIONS} />);
    expect(
      screen.getByRole("link", { name: /ready to merge/i }),
    ).toHaveTextContent("2");
  });

  // An empty section is still on the page, and an index that quietly drops it
  // is one you cannot trust to be the list of what exists.
  it("lists a section whose count is zero", () => {
    render(<SectionIndex sections={SECTIONS} />);
    expect(
      screen.getByRole("link", { name: /stuck on checks/i }),
    ).toHaveTextContent("0");
  });

  it("is a landmark, so a screen reader can skip to it", () => {
    render(<SectionIndex sections={SECTIONS} />);
    expect(screen.getByRole("navigation", { name: /sections/i })).toBeInTheDocument();
  });
});
