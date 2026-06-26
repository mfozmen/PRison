"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import type { Org, StuckPr, ReviewRequest } from "@/lib/types";
import { sortByAgeAsc, ageBucket } from "@/lib/prioritize";
import { suggestStuck, suggestReview } from "@/lib/suggest";
import { PrList } from "./PrList";
import { PrRow } from "./PrRow";
import { Header } from "./Header";

export interface DashboardProps {
  orgs: Org[];
  login: string;
  orgsError?: boolean;
}

export function Dashboard({ orgs, login, orgsError }: DashboardProps) {
  // Initialize deterministically so the server render and the client's first
  // (hydration) render agree. The persisted value is applied after mount in the
  // hydrate effect below, avoiding a hydration mismatch on the controlled
  // OrgSwitcher for returning users.
  const [selectedOrg, setSelectedOrg] = useState<string>(orgs[0]?.login ?? "");
  const [hydrated, setHydrated] = useState(false);

  const [stuckPrs, setStuckPrs] = useState<StuckPr[]>([]);
  const [reviewReqs, setReviewReqs] = useState<ReviewRequest[]>([]);
  const [stuckError, setStuckError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Tracks the most recently requested org so stale in-flight responses (from a
  // prior selection) are discarded instead of overwriting the current org's data.
  const latestOrgRef = useRef<string>("");

  const fetchData = useCallback(
    (org: string) => {
      latestOrgRef.current = org;
      // React 19 async transition: state updates inside startTransition are
      // deferred transitions, satisfying the React Compiler's set-state-in-effect rule.
      startTransition(async () => {
        const [stuckResult, reviewResult] = await Promise.allSettled([
          fetch(`/api/stuck-prs?org=${encodeURIComponent(org)}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<StuckPr[]>;
          }),
          fetch(`/api/review-requests?org=${encodeURIComponent(org)}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<ReviewRequest[]>;
          }),
        ]);

        // Ignore responses for an org the user has since navigated away from.
        if (latestOrgRef.current !== org) return;

        setStuckError(
          stuckResult.status === "rejected"
            ? "Failed to load stuck PRs. Please retry."
            : null,
        );
        setStuckPrs(
          stuckResult.status === "fulfilled" ? stuckResult.value : [],
        );
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

  // Apply the persisted org once, after mount (client-only). This runs before
  // the first data fetch because the effect below is gated on `hydrated`. The
  // updates are wrapped in a transition so they are deferred rather than
  // synchronous within the effect.
  useEffect(() => {
    const stored = localStorage.getItem("prison.org");
    startTransition(() => {
      // Only adopt the persisted org if it still belongs to the user's current
      // org list; otherwise keep the deterministic default so the controlled
      // OrgSwitcher never shows a value with no matching option.
      if (stored && orgs.some((o) => o.login === stored)) {
        setSelectedOrg(stored);
      }
      setHydrated(true);
    });
  }, [startTransition, orgs]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.org", selectedOrg);
    if (selectedOrg) {
      fetchData(selectedOrg);
    }
  }, [selectedOrg, hydrated, fetchData]);

  const sortedStuck = sortByAgeAsc(stuckPrs, (pr) => pr.stuckSince);
  const sortedReviews = sortByAgeAsc(reviewReqs, (req) => req.requestedAt);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header
        orgs={orgs}
        selectedOrg={selectedOrg}
        onOrgChange={setSelectedOrg}
        login={login}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-6 py-8">
        {orgsError && (
          <div className="rounded border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            Couldn&apos;t load your organizations. Try reloading.
          </div>
        )}
        {isPending && (
          <p className="text-sm text-slate-500" aria-live="polite">
            Loading&hellip;
          </p>
        )}
        {stuckError && (
          <div className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{stuckError}</span>
            <button
              onClick={() => fetchData(selectedOrg)}
              className="ml-4 rounded bg-red-100 px-3 py-1 text-xs font-medium hover:bg-red-200"
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
          <div className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{reviewError}</span>
            <button
              onClick={() => fetchData(selectedOrg)}
              className="ml-4 rounded bg-red-100 px-3 py-1 text-xs font-medium hover:bg-red-200"
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
              detail={`${req.author} · ${ageBucket(req.requestedAt, new Date())} age`}
              suggestion={suggestReview(req)}
            />
          )}
        />
      </main>
    </div>
  );
}
