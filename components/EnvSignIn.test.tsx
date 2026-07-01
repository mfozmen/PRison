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

  it("does NOT render TokenForm when the fetch is aborted (AbortError)", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    global.fetch = vi.fn(() =>
      Promise.reject(abortError),
    ) as unknown as typeof fetch;

    const { container } = render(<EnvSignIn />);

    // Give the promise time to resolve
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // Should still show the loading spinner, not TokenForm
    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
    expect(screen.queryByLabelText(/personal access token/i)).not.toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("passes an AbortSignal to fetch and aborts it on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;
    global.fetch = vi.fn((_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal ?? undefined;
      // Never resolves: keeps the request "in flight" so cleanup can abort it.
      return new Promise(() => {});
    }) as unknown as typeof fetch;

    const { unmount } = render(<EnvSignIn />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
