import { describe, it, expect } from "vitest";
import { appName } from "./smoke";

describe("appName", () => {
  it("returns PRison", () => {
    expect(appName()).toBe("PRison");
  });
});
