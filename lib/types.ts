export type Org = { login: string; avatarUrl: string };

export type StuckPr = {
  id: string;
  title: string;
  url: string;
  repo: string;
  number: number;
  failingChecks: number;
  pendingChecks: number;
  failing: string[];
  pending: string[];
  checkNames: string[];   // all DISTINCT context display names present in the rollup (any state)
  isDraft: boolean;
  blocked: boolean;
  readyViaBlocked: boolean;  // true when BLOCKED+APPROVED with no failing/pending check (see isReadyViaBlocked); client-side arbitration decides which list it lands in
  reviewDecision: string;  // raw reviewDecision from GitHub, e.g. "REVIEW_REQUIRED", "CHANGES_REQUESTED", "APPROVED", ""; surfaces "waiting on review" vs "pending CI" in the card
  mergeState: string;   // raw mergeStateStatus from GitHub API, e.g. "BEHIND", "DIRTY", "BLOCKED", ""
  stuckSince: string; // ISO
};

export type ReviewRequest = {
  id: string;
  title: string;
  url: string;
  repo: string;
  number: number;
  author: string;
  requestedAt: string; // ISO
  // requestedAt came from the viewer's own REVIEW_REQUESTED_EVENT rather than
  // from the PR's updatedAt. A team-originated request leaves no such event, and
  // updatedAt moves on any activity — only the direct one dates the request.
  requestedDirectly: boolean;
  isDraft: boolean;
};

export type ReadyPr = {
  id: string;
  title: string;
  url: string;
  number: number;
  repo: string;
  readySince: string;
  needsUpdate: boolean;
  checkNames: string[];   // all DISTINCT context display names present in the rollup (any state)
  viaBlocked: boolean;    // true when qualified via isReadyViaBlocked (BLOCKED+APPROVED, no failing/pending check)
  // Names that are red or still running on this PR and were ignored by the
  // user — which is why it is in this list at all. Set only by readyFromStuck;
  // the ready query never sees a PR like this, so nothing server-side fills it.
  ignoredChecks?: string[];
};

// A review comment on one of the viewer's own PRs that is still waiting on a
// reply. Two surfaces reach this type, and they decide "waiting" differently —
// an inline thread is unresolved with a last comment that is not the viewer's;
// a review body has neither replies nor a resolve bit, so it waits until the
// viewer says something on the PR after it. See parsePrComments.
export type PrComment = {
  id: string;          // review-thread id, or review id for a review body
  // Which surface it came from. The row shows it, because the two are answered
  // in different places and a body with no file badge otherwise reads as a
  // thread whose path failed to load.
  source: "thread" | "review";
  prId: string;        // PR node id — the Dashboard shows only comments on PRs visible in the stuck/ready lists
  url: string;         // direct anchor to the comment, e.g. .../pull/42#discussion_r1
  repo: string;
  number: number;
  author: string;
  isBot: boolean;      // author.__typename === "Bot"; bots dominate the raw feed, so the client hides them by default
  path: string;        // file the thread hangs on; "" for a review body, which hangs on the PR
  preview: string;     // whitespace-normalized bodyText, at most PREVIEW_MAX chars, ellipsized when cut
  commentedAt: string; // ISO — when the ball landed in the viewer's court; drives the age badge
  viewerReacted: boolean; // viewer has an emoji reaction on the last comment; the client can treat that as an acknowledgement and hide the thread
  viewerStarted: boolean; // the viewer opened the thread — true only for threads found on PRs they reviewed, where that is the whole reason the thread is theirs to answer
};

// One of the viewer's own closed PRs (author:@me is:closed) — merged or closed
// without merging. Powers the "Recently merged / closed" history section, newest
// close first. See parseClosedPrs.
export type ClosedPr = {
  id: string;
  title: string;
  url: string;
  number: number;
  repo: string;
  merged: boolean;   // true = merged, false = closed without merging
  endedAt: string;   // ISO — mergedAt ?? closedAt; drives sort + "merged/closed Xd ago"
};

// Someone else's open PR the viewer has already reviewed (is:open reviewed-by:@me).
// "Waiting on your review" drops a PR the moment you submit a review, but that is
// where the interesting part starts — did they answer the changes you asked for?
// Powers the "Recently reviewed" history section, newest review first.
// See parseReviewedPrs.
export type ReviewedPr = {
  id: string;
  title: string;
  url: string;
  number: number;
  repo: string;
  author: string;
  // The viewer's own latest submitted review. DISMISSED is not a verdict — the
  // author cleared it — but it is still the last thing the viewer said, and
  // saying so beats badging the opinion underneath it.
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";
  reviewedAt: string;    // ISO — when the viewer last reviewed; drives sort + the age
  updatedSince: boolean; // a commit landed after that review — the author answered with code
  isDraft: boolean;
};

export type AgeBucket = "fresh" | "warning" | "urgent";
