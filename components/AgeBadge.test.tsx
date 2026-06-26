import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgeBadge } from "./AgeBadge";

const now = new Date("2026-06-26T12:00:00Z");

describe("AgeBadge", () => {
  it("shows urgent styling for old items", () => {
    render(<AgeBadge since="2026-06-20T00:00:00Z" now={now} />);
    const badge = screen.getByText(/6d/i);
    expect(badge).toHaveAttribute("data-bucket", "urgent");
  });
  it("shows fresh styling for recent items", () => {
    render(<AgeBadge since="2026-06-26T06:00:00Z" now={now} />);
    expect(screen.getByText(/6h/i)).toHaveAttribute("data-bucket", "fresh");
  });
  it("shows warning styling and a day label for mid-aged items", () => {
    render(<AgeBadge since="2026-06-24T12:00:00Z" now={now} />);
    const badge = screen.getByText(/2d/i);
    expect(badge).toHaveAttribute("data-bucket", "warning");
  });
});
