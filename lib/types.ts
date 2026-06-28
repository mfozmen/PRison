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
  isDraft: boolean;
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

export type AgeBucket = "fresh" | "warning" | "urgent";
