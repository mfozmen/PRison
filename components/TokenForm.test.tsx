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

  it("shows the not-installed message when gh is missing (reason: not-installed)", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ reason: "not-installed" }),
      }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/github cli not found/i)).toBeInTheDocument(),
    );
  });

  it("shows the not-signed-in message with the gh auth login hint", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ reason: "not-signed-in" }),
      }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() => {
      const msg = screen.getByText(/isn't signed in/i);
      expect(msg).toBeInTheDocument();
      expect(msg).toHaveTextContent(/gh auth login/i);
    });
  });

  it("shows the token-rejected message with the gh auth refresh hint", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ reason: "token-rejected" }),
      }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() => {
      const msg = screen.getByText(/rejected the cli token/i);
      expect(msg).toBeInTheDocument();
      expect(msg).toHaveTextContent(/gh auth refresh/i);
    });
  });

  it("paste form is still accessible after a CLI failure", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ reason: "not-installed" }),
      }),
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

  it("shows the generic message for an unknown reason", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/couldn't sign in with the github cli/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows the generic message for a prototype-key reason (e.g. toString)", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ reason: "toString" }),
      }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/couldn't sign in with the github cli/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows the generic message when the response body is not JSON", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error("not json");
        },
      }),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/couldn't sign in with the github cli/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows the generic message when the request rejects (network error)", async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("network down")),
    ) as unknown as typeof fetch;
    render(<TokenForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /sign in with github cli/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/couldn't sign in with the github cli/i),
      ).toBeInTheDocument(),
    );
  });
});
