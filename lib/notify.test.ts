import { describe, it, expect, vi, afterEach } from "vitest";
import {
  snapshotStatuses,
  diffStatuses,
  describeEvents,
  withBadge,
  withoutBadge,
  showChangeNotification,
  showTestNotification,
  notificationPermission,
  requestNotificationPermission,
  parsePollInterval,
  POLL_INTERVAL_OPTIONS,
  DEFAULT_POLL_INTERVAL_MS,
  type StatusEvent,
} from "./notify";
import {
  stubNotification,
  stuckPr,
  reviewRequest,
  readyPr,
  prComment,
  closedPr,
} from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

const EMPTY = { ready: [], stuck: [], reviews: [], comments: [], closed: [] };

function event(overrides: Partial<StatusEvent> = {}): StatusEvent {
  return { id: "PR_1", repo: "acme/api", number: 2, status: "ready", ...overrides };
}

describe("parsePollInterval", () => {
  it("accepts any offered option", () => {
    for (const o of POLL_INTERVAL_OPTIONS) {
      expect(parsePollInterval(String(o.ms))).toBe(o.ms);
    }
  });

  it.each([null, "", "abc", "0", "12345", "-60000"])(
    "falls back to the default for %o",
    (stored) => {
      expect(parsePollInterval(stored)).toBe(DEFAULT_POLL_INTERVAL_MS);
    },
  );

  it("defaults to 30 minutes", () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(30 * 60_000);
    expect(POLL_INTERVAL_OPTIONS.some((o) => o.ms === DEFAULT_POLL_INTERVAL_MS)).toBe(true);
  });
});

describe("snapshotStatuses", () => {
  it("is empty for empty lists", () => {
    expect(snapshotStatuses(EMPTY).size).toBe(0);
  });

  it("labels each list with its own status", () => {
    const snapshot = snapshotStatuses({
      ...EMPTY,
      ready: [readyPr()],
      stuck: [stuckPr({ id: "PR_s", pending: ["build"] })],
      reviews: [reviewRequest()],
      comments: [prComment()],
      closed: [closedPr()],
    });
    expect([...snapshot.values()].map((e) => e.status)).toEqual([
      "ready",
      "merged",
      "pending",
      "review",
      "comment",
    ]);
  });

  it("carries repo and number so the copy can name the PR", () => {
    const snapshot = snapshotStatuses({ ...EMPTY, ready: [readyPr()] });
    expect(snapshot.get("PR_ready")).toEqual({
      id: "PR_ready",
      repo: "acme/worker",
      number: 5,
      status: "ready",
    });
  });

  it.each([
    ["changes-requested", stuckPr({ reviewDecision: "CHANGES_REQUESTED", failing: ["build"] })],
    ["failing", stuckPr({ failing: ["build"], pending: ["lint"] })],
    ["pending", stuckPr({ pending: ["lint"] })],
  ] as const)("reports a stuck PR as %s", (status, pr) => {
    const snapshot = snapshotStatuses({ ...EMPTY, stuck: [pr] });
    expect(snapshot.get(pr.id)?.status).toBe(status);
  });

  it("ignores a PR closed without merging — that is not progress", () => {
    const snapshot = snapshotStatuses({ ...EMPTY, closed: [closedPr({ merged: false })] });
    expect(snapshot.size).toBe(0);
  });

  it("keeps the first status when an id appears in two lists", () => {
    // A merged PR can still linger in the stuck list until the next fetch;
    // "was merged" is the news, not "checks failing".
    const snapshot = snapshotStatuses({
      ...EMPTY,
      stuck: [stuckPr({ id: "PR_x", failing: ["build"] })],
      closed: [closedPr({ id: "PR_x" })],
    });
    expect(snapshot.get("PR_x")?.status).toBe("merged");
  });
});

describe("diffStatuses", () => {
  const snapshot = (...events: StatusEvent[]) =>
    new Map(events.map((e) => [e.id, e]));

  it("reports an item that appeared", () => {
    expect(diffStatuses(new Map(), snapshot(event()))).toEqual([event()]);
  });

  it("reports an item whose status changed", () => {
    const before = snapshot(event({ status: "failing" }));
    const after = snapshot(event({ status: "ready" }));
    expect(diffStatuses(before, after)).toEqual([event({ status: "ready" })]);
  });

  it("stays quiet when nothing moved", () => {
    const before = snapshot(event({ status: "failing" }));
    expect(diffStatuses(before, snapshot(event({ status: "failing" })))).toEqual([]);
  });

  it("says nothing about an item that vanished", () => {
    expect(diffStatuses(snapshot(event()), new Map())).toEqual([]);
  });
});

describe("describeEvents", () => {
  it("names the PR and what happened", () => {
    expect(describeEvents([event()])).toBe("acme/api #2 is ready to merge");
  });

  it.each([
    ["merged", "acme/api #2 was merged"],
    ["changes-requested", "acme/api #2 — changes requested"],
    ["failing", "acme/api #2 — checks failing"],
    ["pending", "acme/api #2 — waiting on checks"],
    ["review", "acme/api #2 needs your review"],
    ["comment", "acme/api #2 — new reply"],
  ] as const)("phrases %s", (status, expected) => {
    expect(describeEvents([event({ status })])).toBe(expected);
  });

  it("spells out up to three events", () => {
    const events = [
      event({ id: "1", number: 1 }),
      event({ id: "2", number: 2 }),
      event({ id: "3", number: 3 }),
    ];
    expect(describeEvents(events).split("\n")).toHaveLength(3);
  });

  it("collapses the rest into a count so the notification stays glanceable", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      event({ id: String(i), number: i }),
    );
    expect(describeEvents(events).split("\n")).toEqual([
      "acme/api #0 is ready to merge",
      "acme/api #1 is ready to merge",
      "acme/api #2 is ready to merge",
      "+3 more",
    ]);
  });

  it("is empty for no events", () => {
    expect(describeEvents([])).toBe("");
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

describe("showChangeNotification", () => {
  it("does not throw when Notification is undefined", () => {
    expect(() => showChangeNotification([event()])).not.toThrow();
  });

  it("constructs one tagged notification describing the changes", () => {
    const { constructed } = stubNotification("granted");
    showChangeNotification([event(), event({ id: "2", status: "review", number: 9 })]);
    expect(constructed).toEqual([
      {
        title: "PRison",
        options: {
          body: "acme/api #2 is ready to merge\nacme/api #9 needs your review",
          tag: "prison-changes",
        },
      },
    ]);
  });

  it("stays silent when nothing changed", () => {
    const { constructed } = stubNotification("granted");
    showChangeNotification([]);
    expect(constructed).toEqual([]);
  });

  it.each(["default", "denied"] as const)(
    "stays silent when permission is %s",
    (permission) => {
      const { constructed } = stubNotification(permission);
      showChangeNotification([event()]);
      expect(constructed).toEqual([]);
    },
  );
});

describe("showTestNotification", () => {
  it("does not throw when Notification is undefined", () => {
    expect(() => showTestNotification()).not.toThrow();
  });

  it("confirms delivery to the user", () => {
    const { constructed } = stubNotification("granted");
    showTestNotification();
    expect(constructed).toEqual([
      {
        title: "PRison",
        options: {
          body: "Notifications are on — you'll get one when a PR changes state.",
          tag: "prison-changes",
        },
      },
    ]);
  });

  it("stays silent without permission", () => {
    const { constructed } = stubNotification("denied");
    showTestNotification();
    expect(constructed).toEqual([]);
  });
});

describe("notificationPermission", () => {
  it("reports an unsupported browser as denied", () => {
    expect(notificationPermission()).toBe("denied");
  });

  it.each(["default", "granted", "denied"] as const)("reports %s", (permission) => {
    stubNotification(permission);
    expect(notificationPermission()).toBe(permission);
  });
});

describe("requestNotificationPermission", () => {
  it("resolves denied when Notification is undefined", async () => {
    await expect(requestNotificationPermission()).resolves.toBe("denied");
  });

  it("prompts only when undecided, and resolves with the answer", async () => {
    const { requestPermission } = stubNotification("default");
    requestPermission.mockResolvedValue("granted");
    await expect(requestNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it.each(["granted", "denied"] as const)(
    "never re-prompts when permission is %s",
    async (permission) => {
      const { requestPermission } = stubNotification(permission);
      await expect(requestNotificationPermission()).resolves.toBe(permission);
      expect(requestPermission).not.toHaveBeenCalled();
    },
  );
});
