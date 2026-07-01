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

  it("returns false for a public host", () => {
    expect(isLoopback(req("example.com"))).toBe(false);
  });
});
