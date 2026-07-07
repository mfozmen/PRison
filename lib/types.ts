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

export type AgeBucket = "fresh" | "warning" | "urgent";
