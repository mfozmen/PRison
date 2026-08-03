"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from "react";
import type { Org, StuckPr, ReviewRequest, ReadyPr, PrComment, ClosedPr } from "@/lib/types";
import { sortByAgeAsc, sortByAgeDesc, relativeAge } from "@/lib/prioritize";
import { suggestStuck, suggestReview, suggestReady, suggestComment, needsReview, stuckGroupKeys, reviewDecisionLabel } from "@/lib/suggest";
import { PrList } from "./PrList";
import { PrRow } from "./PrRow";
import { ClosedPrRow } from "./ClosedPrRow";
import { Header } from "./Header";
import { SettingsModal } from "./SettingsModal";
import { type TrackedChecks, EMPTY_TRACKED, parseTracked, awaitingChecks } from "@/lib/tracked-checks";
import {
  DEFAULT_POLL_INTERVAL_MS,
  parsePollInterval,
  collectIds,
  countNewIds,
  withBadge,
  withoutBadge,
  showNewItemsNotification,
  maybeRequestNotificationPermission,
} from "@/lib/notify";

export interface DashboardProps {
  orgs: Org[];
  login: string;
}

// "" means "All organizations" — the lists span every repo the token can see
// (the user's personal account plus all accessible orgs). Selecting an org
// narrows the view.
const ALL = "";

// Client-side page size for the closed-PR list: initial rows shown and the
// "Load more" increment. The whole list is fetched up front (see CLOSED_PRS_QUERY,
// first: 50), so this only governs how much is revealed at once.
const CLOSED_PAGE_SIZE = 15;

export function Dashboard({ orgs, login }: DashboardProps) {
  const [selectedOrg, setSelectedOrg] = useState<string>(ALL);
  const [hydrated, setHydrated] = useState(false);
  const [hideDrafts, setHideDrafts] = useState(false);
  // Bots author the large majority of unanswered review threads, so they are
  // hidden by default; the filter is client-side to keep the toggle instant.
  const [showBots, setShowBots] = useState(false);
  // Reacting with an emoji is how the user acknowledges a comment without replying,
  // so reacted threads are hidden by default; client-side to keep the toggle instant.
  const [hideReacted, setHideReacted] = useState(true);
  const [groupBy, setGroupBy] = useState<"flat" | "repo" | "check">("flat");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pollInterval, setPollInterval] = useState(DEFAULT_POLL_INTERVAL_MS);
  // Stamped on every completed fetch (manual or silent). Null until the first
  // one lands, so the server render has nothing time-dependent in it.
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  // Ticks once a minute so the "Updated Xm ago" label ages on its own.
  const [nowTick, setNowTick] = useState(0);

  const [tracked, setTracked] = useState<TrackedChecks>(EMPTY_TRACKED);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [stuckPrs, setStuckPrs] = useState<StuckPr[]>([]);
  const [reviewReqs, setReviewReqs] = useState<ReviewRequest[]>([]);
  const [readyPrs, setReadyPrs] = useState<ReadyPr[]>([]);
  const [comments, setComments] = useState<PrComment[]>([]);
  const [closedPrs, setClosedPrs] = useState<ClosedPr[]>([]);
  const [stuckError, setStuckError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [closedError, setClosedError] = useState<string | null>(null);
  // Closed PRs are history, not a work queue, so the section starts collapsed;
  // closedVisible drives the client-side "Load more" (15 at a time).
  const [closedOpen, setClosedOpen] = useState(false);
  const [closedVisible, setClosedVisible] = useState(CLOSED_PAGE_SIZE);
  const [partial, setPartial] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Tracks the most recently requested org so stale in-flight responses are
  // discarded instead of overwriting the current view.
  const latestOrgRef = useRef<string>(ALL);
  // Ids the user has already had on screen; unioned whenever new ids become
  // visible, so items that flap out and back never re-notify and a new scope's
  // initial items are marked seen by their first (non-silent) fetch.
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Bumped in the same state batch as a silent poll's results, so the commit
  // where it changes is guaranteed to carry that poll's data — an interleaving
  // commit can't consume the signal the way a ref flag could.
  const [pollGen, setPollGen] = useState(0);
  const lastPollGenRef = useRef(0);
  // Running total of unseen new items across polls while the tab is unfocused,
  // so the badge shows the accumulated count, not just the last poll's delta.
  const unseenCountRef = useRef(0);

  const fetchData = useCallback(
    (org: string, silent = false) => {
      latestOrgRef.current = org;
      const qs =
        org === login
          ? `?user=${encodeURIComponent(login)}`
          : org
            ? `?org=${encodeURIComponent(org)}`
            : "";
      const run = async () => {
        const [stuckResult, reviewResult, readyResult, commentsResult, closedResult] = await Promise.allSettled([
          fetch(`/api/stuck-prs${qs}`).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as StuckPr[];
            return { items, partial };
          }),
          fetch(`/api/review-requests${qs}`).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ReviewRequest[];
            return { items, partial };
          }),
          fetch(`/api/ready-to-merge${qs}`).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ReadyPr[];
            return { items, partial };
          }),
          fetch(`/api/pr-comments${qs}`).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as PrComment[];
            return { items, partial };
          }),
          fetch(`/api/closed-prs${qs}`).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ClosedPr[];
            return { items, partial };
          }),
        ]);

        if (latestOrgRef.current !== org) return;

        // Mark this commit for the detection effect below, which diffs the
        // *visible* (filtered) lists rather than these raw results — so a
        // badge or notification always maps to an item actually on screen.
        // Batched with the data setters, so they land in the same commit.
        if (silent) setPollGen((g) => g + 1);

        // The label answers "how stale is what I'm looking at", so it only
        // moves when something actually landed. A fetch where every endpoint
        // rejected refreshed nothing, and claiming otherwise would hide the
        // staleness the label exists to show.
        if ([stuckResult, reviewResult, readyResult, commentsResult, closedResult].some((r) => r.status === "fulfilled")) {
          setLastRefreshedAt(new Date().toISOString());
        }

        // A silent poll runs unattended, so a rejected endpoint must not
        // clobber the good list already on screen or raise an error banner
        // nobody asked for — it keeps the previous state and self-heals on
        // the next successful poll. User-initiated fetches keep reporting
        // failures loudly.
        if (!silent || stuckResult.status === "fulfilled") {
          setStuckError(
            stuckResult.status === "rejected"
              ? "Failed to load stuck PRs. Please retry."
              : null,
          );
          setStuckPrs(stuckResult.status === "fulfilled" ? stuckResult.value.items : []);
        }
        if (!silent || reviewResult.status === "fulfilled") {
          setReviewError(
            reviewResult.status === "rejected"
              ? "Failed to load review requests. Please retry."
              : null,
          );
          setReviewReqs(
            reviewResult.status === "fulfilled" ? reviewResult.value.items : [],
          );
        }
        if (!silent || readyResult.status === "fulfilled") {
          setReadyError(
            readyResult.status === "rejected"
              ? "Failed to load ready-to-merge PRs. Please retry."
              : null,
          );
          setReadyPrs(readyResult.status === "fulfilled" ? readyResult.value.items : []);
        }
        if (!silent || commentsResult.status === "fulfilled") {
          setCommentsError(
            commentsResult.status === "rejected"
              ? "Failed to load comments. Please retry."
              : null,
          );
          setComments(commentsResult.status === "fulfilled" ? commentsResult.value.items : []);
        }
        if (!silent || closedResult.status === "fulfilled") {
          setClosedError(
            closedResult.status === "rejected"
              ? "Failed to load closed PRs. Please retry."
              : null,
          );
          setClosedPrs(closedResult.status === "fulfilled" ? closedResult.value.items : []);
        }
        // Fresh list for this scope, so collapse the reveal back to the first
        // page — but never on a silent poll, which refreshes in place and must
        // not fold a "Load more" expansion the user is reading.
        if (!silent) setClosedVisible(CLOSED_PAGE_SIZE);
        const anyPartial =
          (stuckResult.status === "fulfilled" && stuckResult.value.partial) ||
          (reviewResult.status === "fulfilled" && reviewResult.value.partial) ||
          (readyResult.status === "fulfilled" && readyResult.value.partial) ||
          (commentsResult.status === "fulfilled" && commentsResult.value.partial) ||
          (closedResult.status === "fulfilled" && closedResult.value.partial);
        setPartial(anyPartial);
      };
      // Silent polls skip the transition so isPending (the "Loading…" banner
      // and the Refresh button's disabled state) never flashes every interval.
      if (silent) void run();
      else startTransition(run);
    },
    [startTransition, login],
  );

  // Apply the persisted selection after mount (client-only) to avoid a
  // hydration mismatch on the controlled filter.
  useEffect(() => {
    const stored = localStorage.getItem("prison.org");
    const storedHideDrafts = localStorage.getItem("prison.hideDrafts");
    const storedShowBots = localStorage.getItem("prison.showBots");
    const storedHideReacted = localStorage.getItem("prison.hideReacted");
    const storedGroupBy = localStorage.getItem("prison.groupBy");
    const storedAutoRefresh = localStorage.getItem("prison.autoRefresh");
    const storedPollInterval = localStorage.getItem("prison.pollInterval");
    const storedTracked = localStorage.getItem("prison.trackedChecks");
    const storedClosedOpen = localStorage.getItem("prison.closedOpen");
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
      if (storedShowBots === "true") {
        setShowBots(true);
      }
      if (storedHideReacted === "false") {
        setHideReacted(false);
      }
      if (storedGroupBy === "repo" || storedGroupBy === "check") {
        setGroupBy(storedGroupBy);
      }
      if (storedAutoRefresh === "true") {
        setAutoRefresh(true);
      }
      setPollInterval(parsePollInterval(storedPollInterval));
      if (storedClosedOpen === "true") {
        setClosedOpen(true);
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
    localStorage.setItem("prison.showBots", String(showBots));
  }, [showBots, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.hideReacted", String(hideReacted));
  }, [hideReacted, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.groupBy", groupBy);
  }, [groupBy, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.trackedChecks", JSON.stringify(tracked));
  }, [tracked, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.closedOpen", String(closedOpen));
  }, [closedOpen, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.autoRefresh", String(autoRefresh));
  }, [autoRefresh, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.pollInterval", String(pollInterval));
  }, [pollInterval, hydrated]);

  // Auto refresh: poll silently at the chosen interval. Keeps polling while
  // the tab is hidden — that's the point (badge + desktop notification). No
  // immediate fire, so it never double-fetches with the org effect above.
  useEffect(() => {
    if (!hydrated || !autoRefresh) return;
    const id = setInterval(() => fetchData(selectedOrg, true), pollInterval);
    return () => clearInterval(id);
  }, [hydrated, autoRefresh, pollInterval, selectedOrg, fetchData]);

  // Age the "Updated Xm ago" label without a fetch. Only runs once there is
  // something to age.
  useEffect(() => {
    if (!lastRefreshedAt) return;
    const id = setInterval(() => setNowTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [lastRefreshedAt]);

  // Returning to the tab means the new items are on screen: clear the badge.
  useEffect(() => {
    const clear = () => {
      unseenCountRef.current = 0;
      document.title = withoutBadge(document.title);
    };
    const onVisibility = () => {
      if (!document.hidden) clear();
    };
    window.addEventListener("focus", clear);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", clear);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // nowTick is only a re-render trigger — it makes the label age between
  // fetches instead of freezing at whatever it said when the data landed.
  const lastRefreshedLabel = useMemo(() => {
    if (!lastRefreshedAt) return null;
    const age = relativeAge(lastRefreshedAt, new Date());
    return age === "0m" ? "Updated just now" : `Updated ${age} ago`;
  }, [lastRefreshedAt, nowTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Request notification permission only on an explicit enable (a user
  // gesture) — restoring the setting from localStorage must not prompt.
  const handleAutoRefreshChange = useCallback((on: boolean) => {
    setAutoRefresh(on);
    if (on) maybeRequestNotificationPermission();
  }, []);

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

  // Client-side arbitration for BLOCKED+SUCCESS+APPROVED PRs: each such PR lands
  // in exactly one list based on whether its tracked checks are present in the rollup.
  // If awaiting checks are absent → stuck (with awaiting chips); if all present → ready.
  const isAwaiting = (repo: string, checkNames: string[]) =>
    awaitingChecks(repo, checkNames, tracked).length > 0;

  const sortedStuckAll = hideDrafts ? sortedStuck.filter((pr) => !pr.isDraft) : sortedStuck;
  // A BLOCKED+approved+green PR with no awaiting tracked checks is already in the ready
  // list; exclude it from stuck so it doesn't appear in both lists.
  const visibleStuck = sortedStuckAll.filter(
    (pr) => !(pr.readyViaBlocked && !isAwaiting(pr.repo, pr.checkNames)),
  );
  const visibleReviews = hideDrafts ? sortedReviews.filter((req) => !req.isDraft) : sortedReviews;
  // Drafts are already excluded server-side (parseReadyPrs drops drafts); hideDrafts is a no-op here.
  // A BLOCKED+approved+green PR with awaiting tracked checks belongs in stuck, not here.
  const visibleReady = sortedReady.filter(
    (pr) => !(pr.viaBlocked && isAwaiting(pr.repo, pr.checkNames)),
  );

  // Comments are only shown for PRs the dashboard is currently showing, so the
  // column can never point at a PR that isn't on screen. Derived from the two
  // author-owned lists AFTER arbitration, which is why it lives here and not in
  // the route.
  const visiblePrIds = new Set([
    ...visibleStuck.map((pr) => pr.id),
    ...visibleReady.map((pr) => pr.id),
  ]);
  const visibleComments = sortByAgeAsc(
    comments.filter(
      (c) =>
        visiblePrIds.has(c.prId) &&
        (showBots || !c.isBot) &&
        !(hideReacted && c.viewerReacted),
    ),
    (c) => c.commentedAt,
  );

  // Newest-close first; the section renders only the first closedVisible rows.
  const sortedClosed = sortByAgeDesc(closedPrs, (pr) => pr.endedAt);

  // New-item detection, against the visible (filtered) lists — a hidden bot
  // comment, a reacted thread, or a filtered draft must never announce itself.
  // Closed PRs are history, not a work queue, so they never notify. Runs after
  // every commit: ordinary commits (filter toggles, manual refreshes, org
  // switches) just mark what's on screen as seen; only the commit that carries
  // a silent poll's results (pollGen changed) while the tab is unfocused may
  // badge and notify — when focused the user sees the live update, and a badge
  // set while focused would never clear.
  useEffect(() => {
    const prev = seenIdsRef.current;
    const visible = collectIds([visibleStuck, visibleReviews, visibleReady, visibleComments]);
    const newCount = countNewIds(prev, visible);
    if (newCount > 0) {
      seenIdsRef.current = new Set([...prev, ...visible]);
    }
    if (pollGen !== lastPollGenRef.current) {
      lastPollGenRef.current = pollGen;
      if (newCount > 0 && !document.hasFocus()) {
        unseenCountRef.current += newCount;
        document.title = withBadge(document.title, unseenCountRef.current);
        showNewItemsNotification(unseenCountRef.current);
      }
    }
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        orgs={orgs}
        selectedOrg={selectedOrg}
        onOrgChange={setSelectedOrg}
        login={login}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {partial && (
        <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 pt-4">
          <div
            role="status"
            className="flex items-center justify-between rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
          >
            <span>⚠ Some data couldn&apos;t be loaded — Retry</span>
            <button
              type="button"
              onClick={() => fetchData(selectedOrg)}
              className="ml-4 cursor-pointer rounded bg-warning/20 px-3 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/30"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <SettingsModal
        orgs={orgs}
        availableRepos={availableRepos}
        owners={repoOwners}
        value={tracked}
        onChange={setTracked}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hideDrafts={hideDrafts}
        onHideDraftsChange={setHideDrafts}
        showBots={showBots}
        onShowBotsChange={setShowBots}
        hideReacted={hideReacted}
        onHideReactedChange={setHideReacted}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={handleAutoRefreshChange}
        pollInterval={pollInterval}
        onPollIntervalChange={setPollInterval}
      />
      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-8 px-4 sm:px-6 lg:px-8 py-8">
        {isPending && (
          <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Loading&hellip;
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
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
          {/* Deliberately not a live region: the label re-renders every minute
              as it ages, and announcing "Updated 4m ago" on a loop would talk
              over everything else for as long as the tab is open. */}
          {lastRefreshedAt && (
            <p
              className="ml-auto text-sm text-muted"
              title={new Date(lastRefreshedAt).toLocaleString()}
            >
              {lastRefreshedLabel}
            </p>
          )}
          <button
            type="button"
            onClick={() => fetchData(selectedOrg)}
            disabled={isPending}
            className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md bg-surface px-4 text-sm font-medium text-foreground hover:brightness-95 dark:hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${lastRefreshedAt ? "" : "ml-auto"}`}
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
                detail={pr.needsUpdate ? (
                  <span className="bg-warning/10 text-warning ring-1 ring-inset ring-warning/30 rounded px-1.5 py-0.5 text-xs font-medium">
                    Needs update
                  </span>
                ) : undefined}
              />
            )}
          />
        </div>
        {/* Comments awaiting your reply — full width: an inbox row needs room for
            the comment preview AND the file path, which a grid column would clip. */}
        <div className="flex flex-col gap-4">
          {commentsError && (
            <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <span>{commentsError}</span>
              <button
                onClick={() => fetchData(selectedOrg)}
                className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
              >
                Retry
              </button>
            </div>
          )}
          <PrList
            title="Comments awaiting your reply"
            items={visibleComments}
            emptyMessage="No comments awaiting your reply 🎉"
            keyExtractor={(c) => c.id}
            countAccent="warning"
            groupBy={groupBy === "repo" ? (c) => c.repo : undefined}
            groupHref={
              groupBy === "repo"
                ? (repo) => `https://github.com/${repo}`
                : undefined
            }
            renderRow={(c) => (
              <PrRow
                title={c.preview}
                repo={c.repo}
                number={c.number}
                url={c.url}
                since={c.commentedAt}
                now={new Date()}
                suggestion={suggestComment(c)}
                accent="warning"
                clampTitle
                detail={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
                      <svg aria-hidden="true" className="shrink-0" width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M1 10c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      {c.author}
                    </span>
                    {c.path && (
                      <span className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-muted ring-1 ring-inset ring-border">
                        <svg aria-hidden="true" className="shrink-0" width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6.5 1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.5L6.5 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                          <path d="M6.5 1v3.5H10" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                        {c.path}
                      </span>
                    )}
                  </span>
                }
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
                  ? (pr) => stuckGroupKeys(pr, tracked)
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
                const hasAwaiting = awaiting.length > 0;
                // A green PR can still be BLOCKED waiting on a code-owner review;
                // surface that instead of mislabeling it as pending CI. Colour it
                // with the repo's status vocabulary: CHANGES_REQUESTED is a negative
                // signal (danger/red), REVIEW_REQUIRED is merely waiting (warning/amber).
                const reviewNeeded = needsReview(pr.reviewDecision);
                const changesRequested = pr.reviewDecision === "CHANGES_REQUESTED";
                const reviewChip = reviewNeeded ? (
                  <span
                    key="review"
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      changesRequested
                        ? "bg-danger/10 text-danger ring-danger/30"
                        : "bg-warning/10 text-warning ring-warning/30"
                    }`}
                  >
                    <svg aria-hidden="true" className="shrink-0" width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M1 10c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    {reviewDecisionLabel(pr.reviewDecision)}
                  </span>
                ) : null;
                const noteIcon = (
                  <svg aria-hidden="true" className="shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M7 6v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                );
                const noteSpan = (text: string) => (
                  <span className="flex items-center gap-1.5 text-muted text-sm">
                    {noteIcon}
                    {text}
                  </span>
                );
                let detail: React.ReactNode;
                if (!hasNames && pr.mergeState === "DIRTY") {
                  detail = noteSpan("Has merge conflicts — resolve them on GitHub.");
                } else if (hasNames || hasAwaiting || reviewNeeded) {
                  detail = (
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
                      {hasAwaiting &&
                        awaiting.map((name) => (
                          <span
                            key={`await-${name}`}
                            aria-label={`Awaiting: ${name}`}
                            title={`Awaiting: ${name}`}
                            className="inline-flex items-center gap-1 rounded border border-dashed border-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted"
                          >
                            <svg aria-hidden="true" className="shrink-0" width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                              <path d="M6 3.5v2.75l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {name}
                          </span>
                        ))}
                      {reviewChip}
                    </div>
                  );
                } else if (pr.blocked) {
                  detail = noteSpan("Some required checks run on GitHub and aren't shown here.");
                } else {
                  detail = `${pr.failingChecks} failing · ${pr.pendingChecks} pending`;
                }
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
        {/* Recently merged / closed — history, collapsed by default. Not a PrList:
            its count badge would show the sliced (revealed) count, but the header
            shows how many were fetched — the most recent up to CLOSED_PRS_QUERY's
            first: 50, not necessarily the user's all-time total. */}
        <div className="flex flex-col gap-4">
          <button
            type="button"
            aria-expanded={closedOpen}
            onClick={() => setClosedOpen((o) => !o)}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <svg
              aria-hidden="true"
              className={`shrink-0 text-muted transition-transform ${closedOpen ? "rotate-90" : ""}`}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M4 2.5 8 6l-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Recently merged / closed
            </h2>
            <span
              data-testid="closed-count-badge"
              className="rounded-full bg-border px-2 py-0.5 font-mono text-xs tabular-nums text-foreground ring-1 ring-inset ring-border"
            >
              {sortedClosed.length}
            </span>
          </button>
          {closedError && (
            <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <span>{closedError}</span>
              <button
                onClick={() => fetchData(selectedOrg)}
                className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
              >
                Retry
              </button>
            </div>
          )}
          {closedOpen &&
            (sortedClosed.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-background/40 px-4 py-6 text-center text-sm text-muted">
                No closed PRs
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {sortedClosed.slice(0, closedVisible).map((pr) => (
                    <li key={pr.id}>
                      <ClosedPrRow pr={pr} now={new Date()} />
                    </li>
                  ))}
                </ul>
                {sortedClosed.length > closedVisible && (
                  <button
                    type="button"
                    onClick={() => setClosedVisible((v) => v + CLOSED_PAGE_SIZE)}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-surface px-4 text-sm font-medium text-foreground hover:brightness-95 dark:hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  >
                    Load more (showing {closedVisible} of {sortedClosed.length})
                  </button>
                )}
              </>
            ))}
        </div>
      </main>
    </div>
  );
}
