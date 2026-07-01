import { describe, it, expect } from "vitest";
import { isLoopback } from "./loopback";

function req(host: string) {
  return new Request(`http://${host}/some/path`, { method: "GET" });
}

describe("isLoopback", () => {
  it("returns true for localhost", () => {
    expect(isLoopback(req("localhost"))).toBe(true);
  });

  it("returns true for 127.0.0.1", () => {
    expect(isLoopback(req("127.0.0.1"))).toBe(true);
  });

  it("returns true for ::1 (bracketed IPv6)", () => {
    expect(isLoopback(new Request("http://[::1]/some/path"))).toBe(true);
  });

  it("returns true for ::1 unbracketed (direct set match)", () => {
    // The URL constructor parses http://[::1]/ → hostname "[::1]"
    // and the set also includes the bare "::1" string for any future direct usage.
    // Verify the bracketed form resolves correctly from URL.
    const url = new URL("http://[::1]/");
    expect(url.hostname).toBe("[::1]");
    expect(isLoopback(new Request("http://[::1]/"))).toBe(true);
  });

  it("returns true via the Host header even when the URL host is the container bind address (Docker)", () => {
    // In Docker the standalone server builds request.url from HOSTNAME=0.0.0.0,
    // but the browser/curl still sends Host: localhost:<port>.
    const r = new Request("http://0.0.0.0:3000/api/token/env", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });
    expect(isLoopback(r)).toBe(true);
  });

  it("returns true for a bracketed IPv6 loopback Host header with a port", () => {
    const r = new Request("http://0.0.0.0:3000/x", { headers: { host: "[::1]:3000" } });
    expect(isLoopback(r)).toBe(true);
  });

  it("returns false when both the Host header and URL are a public host", () => {
    const r = new Request("http://prison.example.com/x", {
      headers: { host: "prison.example.com" },
    });
    expect(isLoopback(r)).toBe(false);
  });

  it("returns false for a public host", () => {
    expect(isLoopback(req("example.com"))).toBe(false);
  });
});
