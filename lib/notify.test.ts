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
  serializeSnapshot,
  parseSnapshot,
  MAX_SNAPSHOT_ENTRIES,
  POLL_INTERVAL_OPTIONS,
  DEFAULT_POLL_INTERVAL_MS,
  shouldAnnounceInterval,
  type StatusEvent,
} from "./notify";
import {
  stubNotification,
  stuckPr,
  reviewRequest,
  readyPr,
  reviewedPr,
  prComment,
  closedPr,
  statusEvent as event,
} from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

const EMPTY = { ready: [], stuck: [], reviews: [], comments: [], closed: [], reviewed: [] };

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
      "merged",
      "ready",
      "pending",
      "review",
      "comment",
    ]);
  });

  it("carries repo, number, and url so the copy can name and link the PR", () => {
    const snapshot = snapshotStatuses({ ...EMPTY, ready: [readyPr()] });
    expect(snapshot.get("PR_ready")).toEqual({
      id: "PR_ready",
      repo: "acme/worker",
      number: 5,
      url: "https://github.com/acme/worker/pull/5",
      status: "ready",
      at: undefined,
    });
  });

  it("takes a comment's url, which anchors the thread rather than the PR", () => {
    const snapshot = snapshotStatuses({ ...EMPTY, comments: [prComment()] });
    expect(snapshot.get("THREAD_1")?.url).toBe(
      "https://github.com/acme/api/pull/2#discussion_r1",
    );
  });

  it.each([
    // A conflict outranks even a human: nothing moves until it is resolved.
    [
      "conflict",
      stuckPr({ mergeState: "DIRTY", reviewDecision: "CHANGES_REQUESTED", failing: ["build"] }),
    ],
    ["changes-requested", stuckPr({ reviewDecision: "CHANGES_REQUESTED", failing: ["build"] })],
    ["failing", stuckPr({ failing: ["build"], pending: ["lint"] })],
    // A red check outranks the approval: the check is the thing you can act on.
    ["failing", stuckPr({ reviewDecision: "APPROVED", failing: ["build"] })],
    ["approved", stuckPr({ reviewDecision: "APPROVED", pending: ["lint"] })],
    ["pending", stuckPr({ pending: ["lint"] })],
  ] as const)("reports a stuck PR as %s", (status, pr) => {
    const snapshot = snapshotStatuses({ ...EMPTY, stuck: [pr] });
    expect(snapshot.get(pr.id)?.status).toBe(status);
  });

  // The Recently reviewed section's whole reason to exist — did they answer
  // what you asked for? — was the one thing on the board nothing pushed.
  it("announces the author answering your review with code", () => {
    const waiting = snapshotStatuses({ ...EMPTY, reviewed: [reviewedPr()] });
    expect(waiting.size).toBe(0);
    const answered = snapshotStatuses({
      ...EMPTY,
      reviewed: [reviewedPr({ updatedSince: true })],
    });
    expect(diffStatuses(waiting, answered).map((e) => e.status)).toEqual(["answered"]);
  });

  it("announces a second round after you review again", () => {
    // Stamped with your own review time, so "they pushed again" is news rather
    // than the "answered" already on record from the first round.
    const first = snapshotStatuses({
      ...EMPTY,
      reviewed: [reviewedPr({ updatedSince: true })],
    });
    const second = snapshotStatuses({
      ...EMPTY,
      reviewed: [reviewedPr({ updatedSince: true, reviewedAt: "2026-06-26T00:00:00Z" })],
    });
    expect(diffStatuses(first, second).map((e) => e.status)).toEqual(["answered"]);
  });

  it("lets a re-requested review outrank the history it also appears in", () => {
    const snapshot = snapshotStatuses({
      ...EMPTY,
      reviews: [reviewRequest({ id: "PR_x" })],
      reviewed: [reviewedPr({ id: "PR_x", updatedSince: true })],
    });
    expect(snapshot.get("PR_x")?.status).toBe("review");
  });

  // The route a conflict actually arrives by: the PR was mergeable until
  // someone else merged something. Read as "pending" it would be swallowed.
  it("announces a PR that fell out of the ready list into a conflict", () => {
    const mergeable = snapshotStatuses({ ...EMPTY, ready: [readyPr({ id: "PR_x" })] });
    const conflicted = snapshotStatuses({
      ...EMPTY,
      stuck: [stuckPr({ id: "PR_x", mergeState: "DIRTY" })],
    });
    expect(diffStatuses(mergeable, conflicted).map((e) => e.status)).toEqual(["conflict"]);
  });

  // The whole reason `approved` exists rather than waiting for `ready`: an
  // approved PR only reaches the ready list once nothing else blocks it.
  it("announces an approval on a PR that is still blocked by something else", () => {
    const waiting = snapshotStatuses({ ...EMPTY, stuck: [stuckPr({ pending: ["lint"] })] });
    const approved = snapshotStatuses({
      ...EMPTY,
      stuck: [stuckPr({ reviewDecision: "APPROVED", pending: ["lint"] })],
    });
    expect(diffStatuses(waiting, approved).map((e) => e.status)).toEqual(["approved"]);
  });

  // The suppression of transitions into "pending" was written for "you pushed
  // a fix", and used to swallow this — the most welcome news on your own PR.
  it("announces changes-requested turning into an approval", () => {
    const requested = snapshotStatuses({
      ...EMPTY,
      stuck: [stuckPr({ reviewDecision: "CHANGES_REQUESTED", pending: ["lint"] })],
    });
    const approved = snapshotStatuses({
      ...EMPTY,
      stuck: [stuckPr({ reviewDecision: "APPROVED", pending: ["lint"] })],
    });
    expect(diffStatuses(requested, approved).map((e) => e.status)).toEqual(["approved"]);
  });

  it("does not distinguish waiting on CI from waiting on a review gate", () => {
    // Splitting them would fire a notification the moment CI went green on a
    // PR still awaiting review — announcing progress as a setback.
    const running = snapshotStatuses({ ...EMPTY, stuck: [stuckPr({ pending: ["build"] })] });
    const green = snapshotStatuses({ ...EMPTY, stuck: [stuckPr({ failing: [], pending: [] })] });
    expect(diffStatuses(running, green)).toEqual([]);
  });

  it("stamps a comment thread with when it was last replied to", () => {
    // The status alone never changes, so the timestamp is what makes a second
    // reply on an already-seen thread visible to diffStatuses.
    const c = prComment({ commentedAt: "2026-06-25T09:00:00Z" });
    expect(snapshotStatuses({ ...EMPTY, comments: [c] }).get(c.id)?.at).toBe(
      "2026-06-25T09:00:00Z",
    );
  });

  it("leaves a team-originated review request unstamped", () => {
    // Without its own REVIEW_REQUESTED_EVENT, requestedAt is the PR's updatedAt
    // standing in — and that moves on any activity, so stamping it would
    // re-announce "needs your review" every time someone commented.
    const team = (requestedAt: string) =>
      snapshotStatuses({
        ...EMPTY,
        reviews: [reviewRequest({ requestedAt, requestedDirectly: false })],
      });
    const first = team("2026-06-25T09:00:00Z");
    expect(first.get("PR_review")?.at).toBeUndefined();
    expect(diffStatuses(first, team("2026-06-25T11:30:00Z"))).toEqual([]);
  });

  // You review the PR, it leaves the queue, the author pushes and asks again.
  // The snapshot never forgets an id, so without the stamp it comes back
  // already on record as "review" and says nothing.
  it("announces a review requested of you a second time", () => {
    const asked = (requestedAt: string) =>
      snapshotStatuses({ ...EMPTY, reviews: [reviewRequest({ requestedAt })] });
    const first = asked("2026-06-22T00:00:00Z");
    expect(first.get("PR_review")?.at).toBe("2026-06-22T00:00:00Z");
    expect(diffStatuses(first, asked("2026-06-26T00:00:00Z")).map((e) => e.status)).toEqual([
      "review",
    ]);
  });

  it("reports a red check that reports no name as failing", () => {
    // computeCheckRollup counts an unnamed failing context into failingChecks
    // but never into failing[], so reading the list would call this PR
    // "waiting" — and diffStatuses swallows that, silencing the alert on a
    // card the dashboard itself renders as failing.
    const pr = stuckPr({ failingChecks: 1, failing: [] });
    expect(snapshotStatuses({ ...EMPTY, stuck: [pr] }).get(pr.id)?.status).toBe(
      "failing",
    );
  });

  it("ignores a PR closed without merging — that is not progress", () => {
    const snapshot = snapshotStatuses({ ...EMPTY, closed: [closedPr({ merged: false })] });
    expect(snapshot.size).toBe(0);
  });

  it.each(["stuck", "ready"] as const)(
    "reports a merge even while the PR lingers in the %s list",
    (list) => {
      // GitHub's search index lags, so an is:open query can still return a PR
      // that closed-prs already reports merged. "Was merged" is the news.
      const snapshot = snapshotStatuses({
        ...EMPTY,
        [list]: [
          list === "stuck"
            ? stuckPr({ id: "PR_x", failing: ["build"] })
            : readyPr({ id: "PR_x" }),
        ],
        closed: [closedPr({ id: "PR_x" })],
      });
      expect(snapshot.get("PR_x")?.status).toBe("merged");
    },
  );
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

  it("reports a fresh reply on a thread it has already seen", () => {
    const before = snapshot(event({ status: "comment", at: "2026-06-25T09:00:00Z" }));
    const after = event({ status: "comment", at: "2026-06-25T11:00:00Z" });
    expect(diffStatuses(before, snapshot(after))).toEqual([after]);
  });

  it("stays quiet when a PR falls back to waiting", () => {
    // Pushing a fix resets the checks; that is not news, and the red run that
    // follows will announce itself.
    const before = snapshot(event({ status: "failing" }));
    expect(diffStatuses(before, snapshot(event({ status: "pending" })))).toEqual([]);
  });

  it("still reports a PR that shows up waiting for the first time", () => {
    const fresh = event({ status: "pending" });
    expect(diffStatuses(new Map(), snapshot(fresh))).toEqual([fresh]);
  });

  it("stays quiet when the same reply is still the latest one", () => {
    const seen = event({ status: "comment", at: "2026-06-25T09:00:00Z" });
    expect(diffStatuses(snapshot(seen), snapshot(seen))).toEqual([]);
  });
});

describe("describeEvents", () => {
  it("names the PR and what happened", () => {
    expect(describeEvents([event()])).toBe("acme/api #2 is ready to merge");
  });

  it.each([
    ["merged", "acme/api #2 was merged"],
    ["approved", "acme/api #2 — approved"],
    ["conflict", "acme/api #2 — merge conflict"],
    ["changes-requested", "acme/api #2 — changes requested"],
    ["failing", "acme/api #2 — checks failing"],
    ["pending", "acme/api #2 — waiting on checks or review"],
    ["review", "acme/api #2 needs your review"],
    ["answered", "acme/api #2 — updated since your review"],
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

  it("spells out the newest events, not the oldest", () => {
    // The notification replaces its predecessor, so the event that raised it
    // must be visible — burying it under three older ones defeats the point.
    const events = Array.from({ length: 4 }, (_, i) =>
      event({ id: String(i), number: i }),
    );
    expect(describeEvents(events).split("\n")).toEqual([
      "acme/api #1 is ready to merge",
      "acme/api #2 is ready to merge",
      "acme/api #3 is ready to merge",
      "+1 more",
    ]);
  });

  it("collapses the rest into a count so the notification stays glanceable", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      event({ id: String(i), number: i }),
    );
    expect(describeEvents(events).split("\n")).toEqual([
      "acme/api #3 is ready to merge",
      "acme/api #4 is ready to merge",
      "acme/api #5 is ready to merge",
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
          // No tag, so it can neither replace a real notification nor be
          // replaced by the next test send.
          tag: undefined,
        },
      },
    ]);
  });

  it("stacks rather than replacing itself, so a second click is visible too", () => {
    const { constructed } = stubNotification("granted");
    showTestNotification();
    showTestNotification();
    expect(constructed).toHaveLength(2);
    // A shared tag is what would make the second one replace the first, and
    // the platforms do that replacement without alerting anyone.
    expect(constructed.every((n) => n.options?.tag === undefined)).toBe(true);
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

  it("falls back to the live permission on a callback-only browser", async () => {
    // Safari before 16 resolves with nothing; without the fallback the caller
    // would put `undefined` into state and lose all three branches.
    const { requestPermission } = stubNotification("default");
    requestPermission.mockResolvedValue(undefined);
    await expect(requestNotificationPermission()).resolves.toBe("default");
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

describe("serializeSnapshot / parseSnapshot", () => {
  const event = {
    id: "PR_1",
    repo: "acme/web",
    number: 7,
    status: "ready" as const,
    url: "https://github.com/acme/web/pull/7",
  };

  it("round-trips a snapshot", () => {
    const snapshot = new Map([[event.id, event]]);
    expect(parseSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
  });

  it("keeps the freshness stamp, which is what separates a second reply from the first", () => {
    const thread = { ...event, status: "comment" as const, at: "2026-06-21T00:00:00Z" };
    const back = parseSnapshot(serializeSnapshot(new Map([[thread.id, thread]])));
    expect(back.get(thread.id)?.at).toBe("2026-06-21T00:00:00Z");
  });

  it("bounds what it writes, so a tab left running for a year can't fill storage", () => {
    const many = new Map(
      Array.from({ length: MAX_SNAPSHOT_ENTRIES + 50 }, (_, i) => [
        `PR_${i}`,
        { ...event, id: `PR_${i}`, number: i },
      ]),
    );
    const kept = parseSnapshot(serializeSnapshot(many));
    expect(kept.size).toBe(MAX_SNAPSHOT_ENTRIES);
    // The newest survive; the oldest fall off.
    expect(kept.has("PR_0")).toBe(false);
    expect(kept.has(`PR_${MAX_SNAPSHOT_ENTRIES + 49}`)).toBe(true);
  });

  it.each([
    ["no stored value", null],
    ["an empty string", ""],
    ["unparseable JSON", "{not json"],
    ["a non-array", JSON.stringify({ id: "PR_1" })],
  ])("reads %s as no snapshot", (_label, raw) => {
    expect(parseSnapshot(raw).size).toBe(0);
  });

  it.each([
    ["a missing id", { ...event, id: undefined }],
    ["a numeric repo", { ...event, repo: 42 }],
    ["a string number", { ...event, number: "7" }],
    ["a status this version doesn't know", { ...event, status: "abducted" }],
    ["a status borrowed from the prototype chain", { ...event, status: "constructor" }],
    ["a non-string stamp", { ...event, at: 1 }],
    ["null", null],
  ])("drops %s rather than diffing against it", (_label, entry) => {
    expect(parseSnapshot(JSON.stringify([entry])).size).toBe(0);
  });

  it("keeps the good entries around a bad one", () => {
    const raw = JSON.stringify([event, { ...event, id: "PR_2", status: "nonsense" }]);
    const back = parseSnapshot(raw);
    expect([...back.keys()]).toEqual(["PR_1"]);
  });
});

describe("shouldAnnounceInterval", () => {
  it("says nothing on the run that only read the value back", () => {
    expect(shouldAnnounceInterval(null, 5 * 60_000)).toBe(false);
  });

  it("says nothing about a number already announced", () => {
    // React runs an effect twice on mount under development StrictMode.
    expect(shouldAnnounceInterval(5 * 60_000, 5 * 60_000)).toBe(false);
  });

  it("announces a change", () => {
    expect(shouldAnnounceInterval(30 * 60_000, 5 * 60_000)).toBe(true);
  });
});
