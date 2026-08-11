import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArchiveSection } from "./ArchiveSection";

function renderSection(props: Partial<Parameters<typeof ArchiveSection>[0]> = {}) {
  const onToggle = vi.fn();
  const onRetry = vi.fn();
  render(
    <ArchiveSection
      title="Recently reviewed"
      id="recently-reviewed"
      count={7}
      countTestId="reviewed-count"
      open={false}
      onToggle={onToggle}
      error={null}
      onRetry={onRetry}
      {...props}
    >
      <p>the rows</p>
    </ArchiveSection>,
  );
  return { onToggle, onRetry };
}

describe("ArchiveSection", () => {
  // The section index links here, and a link that moves the viewport without
  // the caret leaves the next Tab back at the top of the page.
  it("is a focusable jump target", () => {
    renderSection();
    const section = document.getElementById("recently-reviewed");
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute("tabindex", "-1");
  });

  it("shows the title and the fetched count", () => {
    renderSection();
    expect(screen.getByRole("button", { name: /recently reviewed/i })).toBeInTheDocument();
    expect(screen.getByTestId("reviewed-count")).toHaveTextContent("7");
  });

  it("hides its rows while collapsed and reports that state", () => {
    renderSection();
    expect(screen.getByRole("button", { name: /recently reviewed/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("the rows")).not.toBeInTheDocument();
  });

  it("reveals its rows when open", () => {
    renderSection({ open: true });
    expect(screen.getByRole("button", { name: /recently reviewed/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("the rows")).toBeInTheDocument();
  });

  it("calls onToggle when the header is clicked", () => {
    const { onToggle } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /recently reviewed/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows the error and a working Retry even while collapsed", () => {
    // Deliberate: a section that failed to load says so whether or not it is
    // expanded, the same as every list.
    const { onRetry } = renderSection({ error: "Failed to load" });
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
