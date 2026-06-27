import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrgSwitcher } from "./OrgSwitcher";
import type { Org } from "@/lib/types";

const orgs: Org[] = [
  { login: "acme", avatarUrl: "https://example.com/acme.png" },
  { login: "widgets-inc", avatarUrl: "https://example.com/widgets.png" },
];

describe("OrgSwitcher", () => {
  it("renders an All option plus every org login", () => {
    render(<OrgSwitcher orgs={orgs} value="acme" onChange={() => {}} />);
    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["", "acme", "widgets-inc"]);
    expect(screen.getByText("All organizations")).toBeInTheDocument();
  });

  it("calls onChange with the correct login when selection changes", () => {
    const onChange = vi.fn();
    render(<OrgSwitcher orgs={orgs} value="acme" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "widgets-inc" } });
    expect(onChange).toHaveBeenCalledWith("widgets-inc");
  });
});
