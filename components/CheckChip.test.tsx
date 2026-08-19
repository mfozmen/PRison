import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheckChip } from "./CheckChip";

const chip = (over: Partial<React.ComponentProps<typeof CheckChip>> = {}) =>
  render(
    <CheckChip name="flaky-e2e" tone="danger" ignored={false} onToggleIgnore={() => {}} {...over} />,
  );

describe("CheckChip", () => {
  it("names the check", () => {
    chip();
    expect(screen.getByRole("button", { name: /flaky-e2e/ })).toBeInTheDocument();
  });

  // The menu is the only way to ignore a check from the board, and a menu that
  // only opens on right-click is a menu most people never find — let alone one
  // anybody can reach from a keyboard.
  it("opens its menu on an ordinary click", () => {
    chip();
    fireEvent.click(screen.getByRole("button", { name: /flaky-e2e/ }));
    expect(screen.getByRole("menuitem", { name: /ignore this check/i })).toBeInTheDocument();
  });

  it("opens its menu on right-click, without the browser's own", () => {
    chip();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("button", { name: /flaky-e2e/ }), event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("menuitem", { name: /ignore this check/i })).toBeInTheDocument();
  });

  it("ignores the check when the item is chosen, and closes", () => {
    const onToggleIgnore = vi.fn();
    chip({ onToggleIgnore });
    fireEvent.click(screen.getByRole("button", { name: /flaky-e2e/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /ignore this check/i }));
    expect(onToggleIgnore).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers the way back on a check already ignored", () => {
    chip({ ignored: true });
    fireEvent.click(screen.getByRole("button", { name: /flaky-e2e/ }));
    expect(screen.getByRole("menuitem", { name: /stop ignoring/i })).toBeInTheDocument();
  });

  it("says an ignored check is ignored, so the muted chip is not a mystery", () => {
    chip({ ignored: true });
    expect(screen.getByRole("button", { name: /flaky-e2e — ignored/i })).toBeInTheDocument();
  });

  it("closes on Escape and hands focus back to the chip", () => {
    chip();
    const button = screen.getByRole("button", { name: /flaky-e2e/ });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  // Opening a menu and leaving focus behind on the button means a keyboard
  // user has to guess that Tab is what reaches the thing they just opened.
  it("moves focus into the menu when it opens", () => {
    chip();
    fireEvent.click(screen.getByRole("button", { name: /flaky-e2e/ }));
    expect(screen.getByRole("menuitem", { name: /ignore this check/i })).toHaveFocus();
  });

  it("stays open for a key that is not Escape", () => {
    chip();
    fireEvent.click(screen.getByRole("button", { name: /flaky-e2e/ }));
    fireEvent.keyDown(document, { key: "a" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes when the click lands somewhere else", () => {
    chip();
    fireEvent.click(screen.getByRole("button", { name: /flaky-e2e/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes again when the chip is clicked a second time", () => {
    chip();
    const button = screen.getByRole("button", { name: /flaky-e2e/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("takes a description for chips that say more than the name", () => {
    chip({ description: "Awaiting: flaky-e2e" });
    expect(screen.getByRole("button", { name: "Awaiting: flaky-e2e" })).toBeInTheDocument();
  });

  it("draws the icon it is given", () => {
    chip({ icon: <svg data-testid="clock" /> });
    expect(screen.getByTestId("clock")).toBeInTheDocument();
  });
});
