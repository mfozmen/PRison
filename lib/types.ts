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
};

// An inline review-thread comment on one of the viewer's own PRs that is still
// waiting on a reply: the thread is unresolved AND its last comment is not the
// viewer's. See parsePrComments.
export type PrComment = {
  id: string;          // review-thread id
  prId: string;        // PR node id — the Dashboard shows only comments on PRs visible in the stuck/ready lists
  url: string;         // direct anchor to the comment, e.g. .../pull/42#discussion_r1
  repo: string;
  number: number;
  author: string;
  isBot: boolean;      // author.__typename === "Bot"; bots dominate the raw feed, so the client hides them by default
  path: string;        // file the thread hangs on
  preview: string;     // whitespace-normalized bodyText, at most PREVIEW_MAX chars, ellipsized when cut
  commentedAt: string; // ISO — when the ball landed in the viewer's court; drives the age badge
};

export type AgeBucket = "fresh" | "warning" | "urgent";
