import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TokenForm } from "./TokenForm";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { reload: vi.fn() },
  });
});

describe("TokenForm", () => {
  it("renders the token input and a disabled button until a token is typed", () => {
    render(<TokenForm />);
    expect(screen.getByLabelText(/personal access token/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("posts the token and reloads on success", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200 }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.change(screen.getByLabelText(/personal access token/i), {
      target: { value: "ghp_abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/token",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });

  it("shows an error when the token is rejected", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 401 }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.change(screen.getByLabelText(/personal access token/i), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByText(/didn't work/i)).toBeInTheDocument(),
    );
  });
});
