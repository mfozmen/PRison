import { describe, it, expect, afterEach } from "vitest";
import { PROJECT_URL, PROJECT_LABEL, releaseUrl, appVersion } from "./project";

describe("PROJECT_LABEL", () => {
  it("drops the scheme but still points at the same place", () => {
    expect(PROJECT_LABEL).toBe("github.com/mfozmen/PRison");
    expect(`https://${PROJECT_LABEL}`).toBe(PROJECT_URL);
  });
});

describe("releaseUrl", () => {
  it("tags the version under the project's releases", () => {
    expect(releaseUrl("1.5.0")).toBe(`${PROJECT_URL}/releases/tag/v1.5.0`);
  });

  it("does not double the v prefix", () => {
    expect(releaseUrl("1.5.0")).not.toContain("vv");
  });
});

describe("appVersion", () => {
  const original = process.env.NEXT_PUBLIC_APP_VERSION;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_VERSION;
    else process.env.NEXT_PUBLIC_APP_VERSION = original;
  });

  it("reads the build-time version", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "9.9.9";
    expect(appVersion()).toBe("9.9.9");
  });

  it("is undefined in a dev build that never inlined one", () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    expect(appVersion()).toBeUndefined();
  });
});
