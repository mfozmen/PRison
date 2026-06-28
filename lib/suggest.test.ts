import { describe, it, expect } from "vitest";
import { suggestStuck, suggestReview } from "./suggest";
import type { StuckPr, ReviewRequest } from "./types";

const base = { id: "1", title: "t", url: "https://github.com/acme/b/pull/2", number: 2, repo: "acme/b" };

describe("suggestStuck", () => {
  it("suggests re-running checks when failing", () => {
    const pr: StuckPr = { ...base, failingChecks: 2, pendingChecks: 0, failing: ["build", "lint"], pending: [], isDraft: false, stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Re-run failed checks",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
  it("suggests investigating CI when only pending", () => {
    const pr: StuckPr = { ...base, failingChecks: 0, pendingChecks: 1, failing: [], pending: ["ci"], isDraft: false, stuckSince: "x" };
    expect(suggestStuck(pr)).toEqual({
      text: "Investigate pending CI",
      href: "https://github.com/acme/b/pull/2/checks",
    });
  });
});

describe("suggestReview", () => {
  it("suggests reviewing to unblock the author", () => {
    const req: ReviewRequest = { ...base, author: "alice", requestedAt: "x", isDraft: false };
    expect(suggestReview(req)).toEqual({
      text: "Review to unblock alice",
      href: "https://github.com/acme/b/pull/2/files",
    });
  });
});
