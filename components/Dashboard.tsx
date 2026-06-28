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
  const [hideDrafts, setHideDrafts] = useState(false);

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
    const storedHideDrafts = localStorage.getItem("prison.hideDrafts");
    startTransition(() => {
      if (stored === ALL || (stored && orgs.some((o) => o.login === stored))) {
        setSelectedOrg(stored);
      }
      if (storedHideDrafts === "true") {
        setHideDrafts(true);
      }
      setHydrated(true);
    });
  }, [startTransition, orgs]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.org", selectedOrg);
    fetchData(selectedOrg);
  }, [selectedOrg, hydrated, fetchData]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.hideDrafts", String(hideDrafts));
  }, [hideDrafts, hydrated]);

  const sortedStuck = sortByAgeAsc(stuckPrs, (pr) => pr.stuckSince);
  const sortedReviews = sortByAgeAsc(reviewReqs, (req) => req.requestedAt);

  const visibleStuck = hideDrafts ? sortedStuck.filter((pr) => !pr.isDraft) : sortedStuck;
  const visibleReviews = hideDrafts ? sortedReviews.filter((req) => !req.isDraft) : sortedReviews;

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
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideDrafts}
            onChange={(e) => setHideDrafts(e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-800 accent-green-500"
          />
          Hide drafts
        </label>
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
          items={visibleStuck}
          emptyMessage="No PRs stuck on checks 🎉"
          keyExtractor={(pr) => pr.id}
          renderRow={(pr) => {
            const hasNames = pr.failing.length > 0 || pr.pending.length > 0;
            const totalNames = pr.failing.length + pr.pending.length;
            // Only truncate when there are more than 4 names total; otherwise
            // show every name. The "+N more" count is derived from what is
            // actually rendered so lopsided check lists never hide a chip
            // without an indicator.
            const truncate = totalNames > 4;
            const showFailingNames = truncate ? pr.failing.slice(0, 2) : pr.failing;
            const showPendingNames = truncate ? pr.pending.slice(0, 2) : pr.pending;
            const overflow = totalNames - (showFailingNames.length + showPendingNames.length);
            const detail = hasNames ? (
              <div className="flex flex-wrap gap-1 items-center">
                {showFailingNames.map((name, i) => (
                  <span
                    key={`fail-${i}-${name}`}
                    className="bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/30 rounded px-1.5 py-0.5 text-xs font-medium"
                  >
                    {name}
                  </span>
                ))}
                {showPendingNames.map((name, i) => (
                  <span
                    key={`pend-${i}-${name}`}
                    className="bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30 rounded px-1.5 py-0.5 text-xs font-medium"
                  >
                    {name}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-xs text-slate-400">+{overflow} more</span>
                )}
              </div>
            ) : (
              `${pr.failingChecks} failing · ${pr.pendingChecks} pending`
            );
            return (
              <PrRow
                title={pr.title}
                repo={pr.repo}
                number={pr.number}
                url={pr.url}
                since={pr.stuckSince}
                now={new Date()}
                draft={pr.isDraft}
                detail={detail}
                suggestion={suggestStuck(pr)}
              />
            );
          }}
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
          items={visibleReviews}
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
              draft={req.isDraft}
              detail={`Requested by ${req.author}`}
              suggestion={suggestReview(req)}
            />
          )}
        />
      </main>
    </div>
  );
}
