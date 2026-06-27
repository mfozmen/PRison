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

  it("renders the CLI sign-in button", () => {
    render(<TokenForm />);
    expect(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    ).toBeInTheDocument();
  });

  it("CLI button posts to /api/token/cli and reloads on 200", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ login: "alice" }),
      }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/token/cli",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });

  it("CLI button shows 503 fallback message", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 503 }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/github cli not found/i),
      ).toBeInTheDocument(),
    );
  });

  it("paste form is still accessible after a 503", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 503 }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/github cli not found/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/personal access token/i)).toBeInTheDocument();
  });

  it("CLI button shows a generic error on a non-503 failure", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument(),
    );
  });

  it("CLI button shows a network error when the request rejects", async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("network down")),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/couldn't reach the server/i)).toBeInTheDocument(),
    );
  });
});
