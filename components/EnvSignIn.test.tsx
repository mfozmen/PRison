import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EnvSignIn } from "./EnvSignIn";

beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { reload: vi.fn() },
  });
});

describe("EnvSignIn", () => {
  it("POSTs to /api/token/env and reloads when the response is ok", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200 }),
    ) as unknown as typeof fetch;

    render(<EnvSignIn />);

    // Shows signing-in state initially
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/signing in/i)).toBeInTheDocument();

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/token/env",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });

  it("renders TokenForm fallback when the response is not ok", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 }),
    ) as unknown as typeof fetch;

    render(<EnvSignIn />);

    await waitFor(() =>
      expect(
        screen.getByLabelText(/personal access token/i),
      ).toBeInTheDocument(),
    );

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("renders TokenForm fallback when the request rejects (network error)", async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("network down")),
    ) as unknown as typeof fetch;

    render(<EnvSignIn />);

    await waitFor(() =>
      expect(
        screen.getByLabelText(/personal access token/i),
      ).toBeInTheDocument(),
    );

    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
