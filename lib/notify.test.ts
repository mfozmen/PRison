import { describe, it, expect, vi, afterEach } from "vitest";
import {
  collectIds,
  countNewIds,
  withBadge,
  withoutBadge,
  showNewItemsNotification,
  maybeRequestNotificationPermission,
} from "./notify";
import { stubNotification } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collectIds", () => {
  it("flattens and dedupes ids across lists", () => {
    const ids = collectIds([
      [{ id: "a" }, { id: "b" }],
      [],
      [{ id: "b" }, { id: "c" }],
    ]);
    expect(ids).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns an empty set for no lists", () => {
    expect(collectIds([])).toEqual(new Set());
  });
});

describe("countNewIds", () => {
  it("counts only ids not previously seen", () => {
    expect(countNewIds(new Set(["a"]), new Set(["a", "b", "c"]))).toBe(2);
  });

  it("returns 0 when fresh is a subset of prev", () => {
    expect(countNewIds(new Set(["a", "b"]), new Set(["a"]))).toBe(0);
  });

  it("does not count removed ids", () => {
    expect(countNewIds(new Set(["a", "b"]), new Set(["b"]))).toBe(0);
  });
});

describe("withBadge / withoutBadge", () => {
  it("prefixes the count", () => {
    expect(withBadge("PRison", 3)).toBe("(3) PRison");
  });

  it("replaces an existing badge instead of stacking", () => {
    expect(withBadge("(2) PRison", 5)).toBe("(5) PRison");
  });

  it("strips the badge", () => {
    expect(withoutBadge("(12) PRison")).toBe("PRison");
  });

  it("is a no-op on an unbadged title", () => {
    expect(withoutBadge("PRison")).toBe("PRison");
  });
});

describe("showNewItemsNotification", () => {
  it("does not throw when Notification is undefined", () => {
    expect(() => showNewItemsNotification(1)).not.toThrow();
  });

  it("constructs a tagged notification when permission is granted", () => {
    const { constructed } = stubNotification("granted");
    showNewItemsNotification(1);
    showNewItemsNotification(3);
    expect(constructed).toEqual([
      { title: "PRison", options: { body: "1 new item needs your attention", tag: "prison-new-items" } },
      { title: "PRison", options: { body: "3 new items need your attention", tag: "prison-new-items" } },
    ]);
  });

  it.each(["default", "denied"] as const)(
    "stays silent when permission is %s",
    (permission) => {
      const { constructed } = stubNotification(permission);
      showNewItemsNotification(2);
      expect(constructed).toEqual([]);
    },
  );
});

describe("maybeRequestNotificationPermission", () => {
  it("does not throw when Notification is undefined", () => {
    expect(() => maybeRequestNotificationPermission()).not.toThrow();
  });

  it("requests permission only when undecided", () => {
    const { requestPermission } = stubNotification("default");
    maybeRequestNotificationPermission();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it.each(["granted", "denied"] as const)(
    "never re-prompts when permission is %s",
    (permission) => {
      const { requestPermission } = stubNotification(permission);
      maybeRequestNotificationPermission();
      expect(requestPermission).not.toHaveBeenCalled();
    },
  );
});
