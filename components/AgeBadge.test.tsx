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

  // Minute-level tests
  it("shows minutes for durations under 1 hour", () => {
    render(<AgeBadge since="2026-06-26T11:15:00Z" now={now} />);
    expect(screen.getByText(/45m/i)).toBeInTheDocument();
  });
  it("shows 1h at exactly 60 minutes boundary", () => {
    render(<AgeBadge since="2026-06-26T11:00:00Z" now={now} />);
    expect(screen.getByText(/1h/i)).toBeInTheDocument();
  });
  it("shows hours for 1-24h range", () => {
    render(<AgeBadge since="2026-06-26T09:00:00Z" now={now} />);
    expect(screen.getByText(/3h/i)).toBeInTheDocument();
  });
  it("shows days for 24h+ range", () => {
    render(<AgeBadge since="2026-06-24T12:00:00Z" now={now} />);
    expect(screen.getByText(/2d/i)).toBeInTheDocument();
  });
  it("shows 0m when since equals now", () => {
    render(<AgeBadge since="2026-06-26T12:00:00Z" now={now} />);
    expect(screen.getByText(/0m/i)).toBeInTheDocument();
  });
});
