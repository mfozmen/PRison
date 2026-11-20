import { describe, it, expect } from "vitest";
import { reminderText, waitWords, waitingOn } from "./reminder";
import type { AwaitingPr } from "./types";

const now = new Date("2026-11-20T12:00:00Z");
const base: AwaitingPr = {
  id: "PR_1", title: "Add an audit log", url: "u", number: 491, repo: "acme/api",
  isDraft: false, waitingSince: "2026-11-17T12:00:00Z", reviewers: [],
};

describe("waitWords", () => {
  it("says it the way a person would", () => {
    expect(waitWords("2026-11-17T12:00:00Z", now)).toBe("3 days");
    expect(waitWords("2026-11-19T11:00:00Z", now)).toBe("a day");
    expect(waitWords("2026-11-20T07:00:00Z", now)).toBe("5 hours");
    expect(waitWords("2026-11-20T11:00:00Z", now)).toBe("an hour");
    expect(waitWords("2026-11-20T11:50:00Z", now)).toBe("a few minutes");
  });
});

describe("reminderText", () => {
  it("names only the reviewers it waits on, teams included", () => {
    const pr: AwaitingPr = {
      ...base,
      reviewers: [
        { name: "alice", team: false, state: "requested", since: base.waitingSince },
        { name: "acme/backend", team: true, state: "requested", since: base.waitingSince },
        { name: "dave", team: false, state: "approved", since: base.waitingSince },
      ],
    };
    expect(waitingOn(pr).map((r) => r.name)).toEqual(["alice", "acme/backend"]);
    expect(reminderText(pr, now)).toBe(
      "Hi @alice @acme/backend, when you get a moment, could you take a look at acme/api#491 (Add an audit log)? It's been waiting 3 days. Thanks!",
    );
  });

  it("asks for another look when every wait is a re-review", () => {
    const pr: AwaitingPr = {
      ...base,
      reviewers: [{ name: "carol", team: false, state: "changes", since: base.waitingSince, pushedSince: true }],
    };
    expect(reminderText(pr, now)).toBe(
      "Hi @carol, I've pushed changes since your review on acme/api#491 (Add an audit log). Could you take another look when you get a moment? Thanks!",
    );
  });
});
