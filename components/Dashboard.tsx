"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import type { Org, StuckPr, ReviewRequest, ReadyPr } from "@/lib/types";
import { sortByAgeAsc } from "@/lib/prioritize";
import { suggestStuck, suggestReview, suggestReady } from "@/lib/suggest";
import { PrList } from "./PrList";
import { PrRow } from "./PrRow";
import { Header } from "./Header";
import { TrackedChecksSettings } from "./TrackedChecksSettings";
import { type TrackedChecks, EMPTY_TRACKED, parseTracked, awaitingChecks } from "@/lib/tracked-checks";

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
  const [groupBy, setGroupBy] = useState<"flat" | "repo" | "check">("flat");

  const [tracked, setTracked] = useState<TrackedChecks>(EMPTY_TRACKED);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [stuckPrs, setStuckPrs] = useState<StuckPr[]>([]);
  const [reviewReqs, setReviewReqs] = useState<ReviewRequest[]>([]);
  const [readyPrs, setReadyPrs] = useState<ReadyPr[]>([]);
  const [stuckError, setStuckError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Tracks the most recently requested org so stale in-flight responses are
  // discarded instead of overwriting the current view.
  const latestOrgRef = useRef<string>(ALL);

  const fetchData = useCallback(
    (org: string) => {
      latestOrgRef.current = org;
      const qs =
        org === login
          ? `?user=${encodeURIComponent(login)}`
          : org
            ? `?org=${encodeURIComponent(org)}`
            : "";
      startTransition(async () => {
        const [stuckResult, reviewResult, readyResult] = await Promise.allSettled([
          fetch(`/api/stuck-prs${qs}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<StuckPr[]>;
          }),
          fetch(`/api/review-requests${qs}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<ReviewRequest[]>;
          }),
          fetch(`/api/ready-to-merge${qs}`).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<ReadyPr[]>;
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
        setReadyError(
          readyResult.status === "rejected"
            ? "Failed to load ready-to-merge PRs. Please retry."
            : null,
        );
        setReadyPrs(readyResult.status === "fulfilled" ? readyResult.value : []);
      });
    },
    [startTransition, login],
  );

  // Apply the persisted selection after mount (client-only) to avoid a
  // hydration mismatch on the controlled filter.
  useEffect(() => {
    const stored = localStorage.getItem("prison.org");
    const storedHideDrafts = localStorage.getItem("prison.hideDrafts");
    const storedGroupBy = localStorage.getItem("prison.groupBy");
    const storedTracked = localStorage.getItem("prison.trackedChecks");
    startTransition(() => {
      if (
        stored === ALL ||
        stored === login ||
        (stored && orgs.some((o) => o.login === stored))
      ) {
        setSelectedOrg(stored);
      }
      if (storedHideDrafts === "true") {
        setHideDrafts(true);
      }
      if (storedGroupBy === "repo" || storedGroupBy === "check") {
        setGroupBy(storedGroupBy);
      }
      // "blocker" (old value) falls through → stays "flat" (default)
      setTracked(parseTracked(storedTracked));
      setHydrated(true);
    });
  }, [startTransition, orgs, login]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.org", selectedOrg);
    fetchData(selectedOrg);
  }, [selectedOrg, hydrated, fetchData]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.hideDrafts", String(hideDrafts));
  }, [hideDrafts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.groupBy", groupBy);
  }, [groupBy, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.trackedChecks", JSON.stringify(tracked));
  }, [tracked, hydrated]);

  const availableRepos = Array.from(
    new Set([
      ...stuckPrs.map((p) => p.repo),
      ...reviewReqs.map((r) => r.repo),
      ...readyPrs.map((p) => p.repo),
    ])
  ).sort();

  // Owner logins (personal + orgs) used to scope the repo search to repos the
  // user can access.
  const repoOwners = [login, ...orgs.map((o) => o.login)];

  const sortedStuck = sortByAgeAsc(stuckPrs, (pr) => pr.stuckSince);
  const sortedReviews = sortByAgeAsc(reviewReqs, (req) => req.requestedAt);
  const sortedReady = sortByAgeAsc(readyPrs, (pr) => pr.readySince);

  const visibleStuck = hideDrafts ? sortedStuck.filter((pr) => !pr.isDraft) : sortedStuck;
  const visibleReviews = hideDrafts ? sortedReviews.filter((req) => !req.isDraft) : sortedReviews;
  // Drafts are already excluded server-side (parseReadyPrs drops drafts); hideDrafts is a no-op here.
  const visibleReady = sortedReady;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        orgs={orgs}
        selectedOrg={selectedOrg}
        onOrgChange={setSelectedOrg}
        login={login}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <TrackedChecksSettings
        orgs={orgs}
        availableRepos={availableRepos}
        owners={repoOwners}
        value={tracked}
        onChange={setTracked}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-8 px-4 sm:px-6 lg:px-8 py-8">
        {isPending && (
          <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Loading&hellip;
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideDrafts}
              onChange={(e) => setHideDrafts(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface accent-accent"
            />
            Hide drafts
          </label>
          <div role="group" aria-label="Group by" className="flex rounded-md">
            <button
              type="button"
              aria-pressed={groupBy === "flat"}
              onClick={() => setGroupBy("flat")}
              className={`min-h-[44px] rounded-l-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                groupBy === "flat"
                  ? "bg-accent text-background"
                  : "bg-surface text-foreground"
              }`}
            >
              Flat
            </button>
            <button
              type="button"
              aria-pressed={groupBy === "repo"}
              onClick={() => setGroupBy("repo")}
              className={`min-h-[44px] px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                groupBy === "repo"
                  ? "bg-accent text-background"
                  : "bg-surface text-foreground"
              }`}
            >
              By repo
            </button>
            <button
              type="button"
              aria-pressed={groupBy === "check"}
              onClick={() => setGroupBy("check")}
              className={`min-h-[44px] rounded-r-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                groupBy === "check"
                  ? "bg-accent text-background"
                  : "bg-surface text-foreground"
              }`}
            >
              By check
            </button>
          </div>
          <button
            type="button"
            onClick={() => fetchData(selectedOrg)}
            disabled={isPending}
            className="ml-auto flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md bg-surface px-4 text-sm font-medium text-foreground hover:brightness-95 dark:hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              aria-hidden="true"
              className={`shrink-0 ${isPending ? "animate-spin" : ""}`}
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 7a5 5 0 1 1-1.46-3.54"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M12 1.5V4H9.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Refresh
          </button>
        </div>
        {/* Ready-to-merge — full-width section above the two-column review/stuck grid */}
        <div className="flex flex-col gap-4">
          {readyError && (
            <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <span>{readyError}</span>
              <button
                onClick={() => fetchData(selectedOrg)}
                className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
              >
                Retry
              </button>
            </div>
          )}
          <PrList
            title="Ready to merge"
            items={visibleReady}
            emptyMessage="Nothing ready to merge"
            keyExtractor={(pr) => pr.id}
            countAccent="success"
            renderRow={(pr) => (
              <PrRow
                title={pr.title}
                repo={pr.repo}
                number={pr.number}
                url={pr.url}
                since={pr.readySince}
                now={new Date()}
                suggestion={suggestReady(pr)}
                accent="success"
              />
            )}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Review list is LEFT/TOP column */}
          <div className="flex flex-col gap-4">
            {reviewError && (
              <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                <span>{reviewError}</span>
                <button
                  onClick={() => fetchData(selectedOrg)}
                  className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
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
              groupBy={groupBy === "repo" ? (req) => req.repo : undefined}
              groupHref={
                groupBy === "repo"
                  ? (repo) => `https://github.com/${repo}`
                  : undefined
              }
              countAccent="warning"
              renderRow={(req) => (
                <PrRow
                  title={req.title}
                  repo={req.repo}
                  number={req.number}
                  url={req.url}
                  since={req.requestedAt}
                  now={new Date()}
                  draft={req.isDraft}
                  accent="warning"
                  detail={
                    <span className="flex items-center gap-1 text-warning">
                      <svg
                        aria-hidden="true"
                        className="shrink-0"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle cx="5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.5" />
                        <path
                          d="M1 10c0-2.21 1.79-4 4-4s4 1.79 4 4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M9 6l2 2-2 2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>Blocking @{req.author}</span>
                    </span>
                  }
                  suggestion={suggestReview(req)}
                />
              )}
            />
          </div>
          {/* Stuck list is RIGHT/BOTTOM column */}
          <div className="flex flex-col gap-4">
            {stuckError && (
              <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                <span>{stuckError}</span>
                <button
                  onClick={() => fetchData(selectedOrg)}
                  className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
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
              countAccent="danger"
              groupBy={groupBy === "repo" ? (pr) => pr.repo : undefined}
              groupKeys={
                groupBy === "check"
                  ? (pr) => {
                      const keys = Array.from(
                        new Set([...pr.failing, ...pr.pending]),
                      );
                      return keys.length > 0 ? keys : ["Other"];
                    }
                  : undefined
              }
              groupHref={
                groupBy === "repo"
                  ? (repo) => `https://github.com/${repo}`
                  : undefined
              }
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
                const awaiting = awaitingChecks(pr.repo, pr.checkNames, tracked);
                const noteIcon = (
                  <svg aria-hidden="true" className="shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M7 6v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                );
                const chipsBlock = hasNames ? (
                  <div className="flex flex-wrap gap-1 items-center">
                    {showFailingNames.map((name, i) => (
                      <span
                        key={`fail-${i}-${name}`}
                        className="bg-danger/10 text-danger ring-1 ring-inset ring-danger/30 rounded px-1.5 py-0.5 text-xs font-medium"
                      >
                        {name}
                      </span>
                    ))}
                    {showPendingNames.map((name, i) => (
                      <span
                        key={`pend-${i}-${name}`}
                        className="bg-warning/10 text-warning ring-1 ring-inset ring-warning/30 rounded px-1.5 py-0.5 text-xs font-medium"
                      >
                        {name}
                      </span>
                    ))}
                    {overflow > 0 && (
                      <span className="text-xs text-muted">+{overflow} more</span>
                    )}
                  </div>
                ) : pr.mergeState === "BEHIND" ? (
                  <span className="flex items-center gap-1.5 text-muted text-sm">
                    {noteIcon}
                    Out of date with the base branch — update it to merge.
                  </span>
                ) : pr.mergeState === "DIRTY" ? (
                  <span className="flex items-center gap-1.5 text-muted text-sm">
                    {noteIcon}
                    Has merge conflicts — resolve them on GitHub.
                  </span>
                ) : pr.blocked ? (
                  <span className="flex items-center gap-1.5 text-muted text-sm">
                    {noteIcon}
                    Some required checks run on GitHub and aren&apos;t shown here.
                  </span>
                ) : (
                  `${pr.failingChecks} failing · ${pr.pendingChecks} pending`
                );
                const awaitingBlock = awaiting.length > 0 ? (
                  <div className="flex flex-wrap gap-1 items-center mt-1">
                    <svg aria-hidden="true" className="shrink-0 text-warning" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M6 3.5v2.75l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-xs text-muted">Awaiting:</span>
                    {awaiting.map((name) => (
                      <span
                        key={name}
                        className="bg-warning/10 text-warning ring-1 ring-inset ring-warning/30 rounded px-1.5 py-0.5 text-xs font-medium"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : null;
                const detail = awaiting.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {chipsBlock}
                    {awaitingBlock}
                  </div>
                ) : chipsBlock;
                return (
                  <PrRow
                    title={pr.title}
                    repo={pr.repo}
                    number={pr.number}
                    url={pr.url}
                    since={pr.stuckSince}
                    now={new Date()}
                    draft={pr.isDraft}
                    accent="danger"
                    detail={detail}
                    suggestion={suggestStuck(pr)}
                  />
                );
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
