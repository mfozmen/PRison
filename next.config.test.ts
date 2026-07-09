import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import nextConfig from "./next.config";

// Header.test.tsx stubs NEXT_PUBLIC_APP_VERSION directly, so it would stay green
// if the wiring in next.config.ts broke. Nothing else exercises that chain until
// `next build` runs. This pins it.
describe("next.config", () => {
  it("exposes package.json's version as NEXT_PUBLIC_APP_VERSION", () => {
    const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).toBe(version);
  });

  it("exposes nothing else to the client — every `env` key is inlined into the bundle", () => {
    expect(Object.keys(nextConfig.env ?? {})).toEqual(["NEXT_PUBLIC_APP_VERSION"]);
  });

  it("still emits a standalone server bundle for the Docker image", () => {
    expect(nextConfig.output).toBe("standalone");
  });
});
