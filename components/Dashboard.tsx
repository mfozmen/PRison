"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import type { Org, StuckPr, ReviewRequest } from "@/lib/types";
import { sortByAgeAsc } from "@/lib/prioritize";
import { suggestStuck, suggestReview } from "@/lib/suggest";
import { PrList } from "./PrList";
import { PrRow } from "./PrRow";
import { Header } from "./Header";

export interface DashboardProps {
  orgs: Org[];
  login: string;
}

// "" means "All organizations" — the lists span every repo the token can see
// (the user's personal account plus all accessible orgs). Selecting an org
// narrows the view.
const ALL = "";

export function Dashboard({ orgs, login }: DashboardProps) {
  const [selectedOrg, setSelectedOrg] = useState<string>(ALL);
  const [hydrated, setHydrated] = useState(false);

  const [stuckPrs, setStuckPrs] = useState<StuckPr[]>([]);
  const [reviewReqs, setReviewReqs] = useState<ReviewRequest[]>([]);
  const [stuckError, setStuckError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Tracks the most recently requested org so stale in-flight responses are
  // discarded instead of overwriting the current view.
  const latestOrgRef = useRef<string>(ALL);

  const fetchData = useCallback(
    (org: string) => {
      latestOrgRef.current = org;
      const qs = org ? `?org=${encodeURIComponent(org)}` : "";
      startTransition(async () => {
        const [stuckResult, reviewResult] = await Promise.allSettled([
          fetch(`/api/stuck-prs${qs}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<StuckPr[]>;
          }),
          fetch(`/api/review-requests${qs}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<ReviewRequest[]>;
          }),
        ]);

        if (latestOrgRef.current !== org) return;

        setStuckError(
          stuckResult.status === "rejected"
            ? "Failed to load stuck PRs. Please retry."
            : null,
        );
        setStuckPrs(stuckResult.status === "fulfilled" ? stuckResult.value : []);
        setReviewError(
          reviewResult.status === "rejected"
            ? "Failed to load review requests. Please retry."
            : null,
        );
        setReviewReqs(
          reviewResult.status === "fulfilled" ? reviewResult.value : [],
        );
      });
    },
    [startTransition],
  );

  // Apply the persisted selection after mount (client-only) to avoid a
  // hydration mismatch on the controlled filter.
  useEffect(() => {
    const stored = localStorage.getItem("prison.org");
    startTransition(() => {
      if (stored === ALL || (stored && orgs.some((o) => o.login === stored))) {
        setSelectedOrg(stored);
      }
      setHydrated(true);
    });
  }, [startTransition, orgs]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.org", selectedOrg);
    fetchData(selectedOrg);
  }, [selectedOrg, hydrated, fetchData]);

  const sortedStuck = sortByAgeAsc(stuckPrs, (pr) => pr.stuckSince);
  const sortedReviews = sortByAgeAsc(reviewReqs, (req) => req.requestedAt);

  return (
    <div className="flex min-h-screen flex-col bg-slate-900">
      <Header
        orgs={orgs}
        selectedOrg={selectedOrg}
        onOrgChange={setSelectedOrg}
        login={login}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-6 py-8">
        {isPending && (
          <p className="flex items-center gap-2 text-sm text-slate-400" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Loading&hellip;
          </p>
        )}
        {stuckError && (
          <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <span>{stuckError}</span>
            <button
              onClick={() => fetchData(selectedOrg)}
              className="ml-4 cursor-pointer rounded bg-red-500/20 px-3 py-1 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/30"
            >
              Retry
            </button>
          </div>
        )}
        <PrList
          title="PRs stuck on checks"
          items={sortedStuck}
          emptyMessage="No PRs stuck on checks 🎉"
          keyExtractor={(pr) => pr.id}
          renderRow={(pr) => (
            <PrRow
              title={pr.title}
              repo={pr.repo}
              number={pr.number}
              url={pr.url}
              since={pr.stuckSince}
              now={new Date()}
              detail={`${pr.failingChecks} failing · ${pr.pendingChecks} pending`}
              suggestion={suggestStuck(pr)}
            />
          )}
        />
        {reviewError && (
          <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <span>{reviewError}</span>
            <button
              onClick={() => fetchData(selectedOrg)}
              className="ml-4 cursor-pointer rounded bg-red-500/20 px-3 py-1 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/30"
            >
              Retry
            </button>
          </div>
        )}
        <PrList
          title="PRs waiting on your review"
          items={sortedReviews}
          emptyMessage="No PRs waiting on your review 🎉"
          keyExtractor={(req) => req.id}
          renderRow={(req) => (
            <PrRow
              title={req.title}
              repo={req.repo}
              number={req.number}
              url={req.url}
              since={req.requestedAt}
              now={new Date()}
              detail={`Requested by ${req.author}`}
              suggestion={suggestReview(req)}
            />
          )}
        />
      </main>
    </div>
  );
}
