import { describe, it, expect, afterEach } from "vitest";
import {
  PROJECT_URL,
  PROJECT_LABEL,
  PROJECT_OWNER,
  PROJECT_NAME,
  releaseUrl,
  appVersion,
  isNewerVersion,
} from "./project";

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

describe("PROJECT_OWNER / PROJECT_NAME", () => {
  it("name the repository the About pane links to", () => {
    // Split from the URL rather than written twice, so the update check can
    // never ask GitHub about a different repo than the link points at.
    expect(`${PROJECT_URL}`).toBe(`https://github.com/${PROJECT_OWNER}/${PROJECT_NAME}`);
  });
});

describe("isNewerVersion", () => {
  it.each([
    ["a newer patch", "v1.5.1", "1.5.0"],
    ["a newer minor", "v1.6.0", "1.5.9"],
    ["a newer major", "v2.0.0", "1.99.99"],
    // The whole reason not to compare strings: "1.10.0" < "1.9.0" lexically.
    ["a two-digit minor over a one-digit one", "v1.10.0", "1.9.0"],
  ])("says yes to %s", (_label, latest, current) => {
    expect(isNewerVersion(latest, current)).toBe(true);
  });

  it.each([
    ["the same version", "v1.5.0", "1.5.0"],
    ["an older release", "v1.4.0", "1.5.0"],
    ["an older patch", "v1.5.0", "1.5.1"],
  ])("says no to %s", (_label, latest, current) => {
    expect(isNewerVersion(latest, current)).toBe(false);
  });

  it("tolerates a tag written without the v", () => {
    expect(isNewerVersion("1.6.0", "1.5.0")).toBe(true);
  });

  it.each([
    ["a prerelease suffix", "v2.0.0-rc.1", "1.5.0"],
    ["a two-part version", "v2.0", "1.5.0"],
    ["a four-part version", "v2.0.0.1", "1.5.0"],
    ["a non-numeric segment", "vlatest.0.0", "1.5.0"],
    ["an empty segment", "v2..0", "1.5.0"],
    ["nothing to compare against", "v2.0.0", ""],
  ])("stays quiet rather than guess about %s", (_label, latest, current) => {
    // An update prompt that can't tell shouldn't send anyone anywhere.
    expect(isNewerVersion(latest, current)).toBe(false);
  });
});
