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

export type ReadyPr = { id: string; title: string; url: string; number: number; repo: string; readySince: string };

export type AgeBucket = "fresh" | "warning" | "urgent";
