import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { signIn } from "next-auth/react";
import { SignInButton } from "./SignInButton";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

describe("SignInButton", () => {
  it("renders a GitHub sign-in button", () => {
    render(<SignInButton />);
    expect(screen.getByRole("button", { name: /sign in with github/i })).toBeInTheDocument();
  });

  it("triggers GitHub sign-in when clicked", () => {
    render(<SignInButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with github/i }));
    expect(signIn).toHaveBeenCalledWith("github");
  });
});
