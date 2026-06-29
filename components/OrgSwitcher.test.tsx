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
    render(<OrgSwitcher orgs={orgs} value="acme" login="mfozmen" onChange={() => {}} />);
    const select = screen.getByRole("combobox");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["", "mfozmen", "acme", "widgets-inc"]);
    expect(screen.getByText("All organizations")).toBeInTheDocument();
  });

  it("renders the personal account option with label '<login> (you)'", () => {
    render(<OrgSwitcher orgs={orgs} value="" login="mfozmen" onChange={() => {}} />);
    const personalOption = screen.getByText("mfozmen (you)");
    expect(personalOption).toBeInTheDocument();
    expect((personalOption as HTMLOptionElement).value).toBe("mfozmen");
  });

  it("calls onChange with the correct login when selection changes", () => {
    const onChange = vi.fn();
    render(<OrgSwitcher orgs={orgs} value="acme" login="mfozmen" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "widgets-inc" } });
    expect(onChange).toHaveBeenCalledWith("widgets-inc");
  });

  it("calls onChange with the login when the personal option is selected", () => {
    const onChange = vi.fn();
    render(<OrgSwitcher orgs={orgs} value="" login="mfozmen" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "mfozmen" } });
    expect(onChange).toHaveBeenCalledWith("mfozmen");
  });
});
