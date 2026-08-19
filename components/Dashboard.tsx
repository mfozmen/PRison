"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from "react";
import type { Org, StuckPr, ReviewRequest, ReadyPr, PrComment, ClosedPr, ReviewedPr } from "@/lib/types";
import { sortByAgeAsc, sortByAgeDesc, relativeAge } from "@/lib/prioritize";
import { parseTerms, matches } from "@/lib/search";
import { suggestStuck, suggestReview, suggestReady, suggestComment, needsReview, stuckGroupKeys, reviewDecisionLabel, MERGE_CONFLICT_LABEL } from "@/lib/suggest";
import { PrList } from "./PrList";
import { SummaryTiles } from "./SummaryTiles";
import { SectionIndex } from "./SectionIndex";
import { PrRow } from "./PrRow";
import { ClosedPrRow } from "./ClosedPrRow";
import { ReviewedPrRow } from "./ReviewedPrRow";
import { ArchiveSection } from "./ArchiveSection";
import { Header } from "./Header";
import { SettingsModal } from "./SettingsModal";
import { type TrackedChecks, EMPTY_TRACKED, parseTracked, awaitingChecks, checkRequirement } from "@/lib/tracked-checks";
import {
  type IgnoredChecks,
  EMPTY_IGNORED,
  parseIgnored,
  isIgnoredCheck,
  ignoreCheck,
  unignoreCheck,
  readyDespiteIgnored,
  readyFromStuck,
} from "@/lib/ignored-checks";
import { CheckChip } from "./CheckChip";
import {
  DEFAULT_POLL_INTERVAL_MS,
  parsePollInterval,
  snapshotStatuses,
  diffStatuses,
  withBadge,
  withoutBadge,
  showChangeNotification,
  showTestNotification,
  notificationPermission,
  requestNotificationPermission,
  SNAPSHOT_KEY,
  serializeSnapshot,
  parseSnapshot,
  type StatusSnapshot,
} from "@/lib/notify";
import {
  ACTIVITY_KEY,
  appendEvents,
  parseActivity,
  unseenCount,
  markAllSeen,
  type ActivityEntry,
} from "@/lib/activity";

export interface DashboardProps {
  orgs: Org[];
  login: string;
}

// "" means "All organizations" — the lists span every repo the token can see
// (the user's personal account plus all accessible orgs). Selecting an org
// narrows the view.
const ALL = "";

// Client-side page size for both history sections: initial rows shown and the
// "Load more" increment. Each list is fetched up front (search first: 50), so
// this only governs how much is revealed at once.
const ARCHIVE_PAGE_SIZE = 15;

// Every label names the resulting set rather than an action, because one of
// three buttons cannot rely on you inferring its current state the way a lone
// "Hide drafts" toggle could.
type DraftFilter = "all" | "only" | "none";
const DRAFT_FILTERS: { value: DraftFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "only", label: "Only drafts" },
  { value: "none", label: "No drafts" },
];

export function Dashboard({ orgs, login }: DashboardProps) {
  const [selectedOrg, setSelectedOrg] = useState<string>(ALL);
  const [hydrated, setHydrated] = useState(false);
  const [draftFilter, setDraftFilter] = useState<DraftFilter>("all");
  // Bots author the large majority of unanswered review threads, so they are
  // hidden by default; the filter is client-side to keep the toggle instant.
  const [showBots, setShowBots] = useState(false);
  // Reacting with an emoji is how the user acknowledges a comment without replying,
  // so reacted threads are hidden by default; client-side to keep the toggle instant.
  const [hideReacted, setHideReacted] = useState(true);
  const [groupBy, setGroupBy] = useState<"flat" | "repo" | "check">("flat");
  // Component state, never persisted — the rule the section folds follow: a
  // query that outlived the sitting would hide work tomorrow morning with no
  // memory that you were the one who hid it.
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pollInterval, setPollInterval] = useState(DEFAULT_POLL_INTERVAL_MS);
  // Held here rather than read during render: the browser re-renders nothing
  // when the user answers its permission prompt, so the answer has to be
  // captured and pushed down. Seeded after mount — never during SSR.
  const [notifPermission, setNotifPermission] =
    useState<NotificationPermission>("denied");
  // Stamped on every completed fetch (manual or silent). Null until the first
  // one lands, so the server render has nothing time-dependent in it.
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  // Ticks once a minute so the "Updated Xm ago" label ages on its own.
  const [nowTick, setNowTick] = useState(0);

  const [tracked, setTracked] = useState<TrackedChecks>(EMPTY_TRACKED);
  const [ignored, setIgnored] = useState<IgnoredChecks>(EMPTY_IGNORED);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [stuckPrs, setStuckPrs] = useState<StuckPr[]>([]);
  const [reviewReqs, setReviewReqs] = useState<ReviewRequest[]>([]);
  const [readyPrs, setReadyPrs] = useState<ReadyPr[]>([]);
  const [comments, setComments] = useState<PrComment[]>([]);
  const [closedPrs, setClosedPrs] = useState<ClosedPr[]>([]);
  const [reviewedPrs, setReviewedPrs] = useState<ReviewedPr[]>([]);
  const [stuckError, setStuckError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [closedError, setClosedError] = useState<string | null>(null);
  const [reviewedError, setReviewedError] = useState<string | null>(null);
  // Closed PRs are history, not a work queue, so the section starts collapsed;
  // closedVisible drives the client-side "Load more" (15 at a time).
  const [closedOpen, setClosedOpen] = useState(false);
  const [closedVisible, setClosedVisible] = useState(ARCHIVE_PAGE_SIZE);
  // Same shape as the closed history: a look-back list, so it starts collapsed
  // and reveals a page at a time.
  const [reviewedOpen, setReviewedOpen] = useState(false);
  const [reviewedVisible, setReviewedVisible] = useState(ARCHIVE_PAGE_SIZE);
  const [partial, setPartial] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Tracks the most recently requested org so stale in-flight responses are
  // discarded instead of overwriting the current view.
  const latestOrgRef = useRef<string>(ALL);
  // What every item was doing the last time the user had it on screen. Merged
  // in whenever something changes, so a new scope's initial items are marked
  // seen by their first (non-silent) fetch and only genuine transitions after
  // that count as news.
  const seenStatusRef = useRef<StatusSnapshot>(new Map());
  // The snapshot outlives the tab, so a change that lands while PRison is
  // closed is still news when it opens. Without this the feed could only ever
  // report what a live poll happened to watch happen: a review that arrived
  // overnight was already the current state by morning, and the first fetch
  // absorbed it silently. Armed by hydration when a stored snapshot came back,
  // spent by the first fetch that lands.
  const catchUpRef = useRef(false);
  // Set once any endpoint has answered, alongside the staleness stamp. A ref
  // rather than state: it is written in the same synchronous block as the data
  // setters, so the commit that carries the results already sees it, and it
  // must not cause a render of its own.
  const landedRef = useRef(false);
  // Bumped in the same state batch as a silent poll's results, so the commit
  // where it changes is guaranteed to carry that poll's data — an interleaving
  // commit can't consume the signal the way a ref flag could.
  const [pollGen, setPollGen] = useState(0);
  const lastPollGenRef = useRef(0);
  // Everything the polls have detected, newest first. One unseen count comes
  // out of it and drives both the bell badge and the tab title, so the two can
  // never disagree about how much is waiting.
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const unseen = unseenCount(activity);

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
        const [stuckResult, reviewResult, readyResult, commentsResult, closedResult, reviewedResult] = await Promise.allSettled([
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
            // This route runs two searches and answers 200 when only one of
            // them came back — a truncated list, which the silent-poll guard
            // below has to treat like an outright failure.
            const incomplete = r.headers?.get?.("X-Incomplete") === "1";
            const items = (await r.json()) as PrComment[];
            return { items, partial, incomplete };
          }),
          fetch(`/api/closed-prs${qs}`).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ClosedPr[];
            return { items, partial };
          }),
          fetch(`/api/reviewed-prs${qs}`).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ReviewedPr[];
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
        if ([stuckResult, reviewResult, readyResult, commentsResult, closedResult, reviewedResult].some((r) => r.status === "fulfilled")) {
          setLastRefreshedAt(new Date().toISOString());
          landedRef.current = true;
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
        // A 200 that dropped a whole search is a failure wearing a success's
        // clothes: replacing the list with it would wipe every own-PR thread
        // off the screen, and the poll after it would then announce them all
        // over again as new.
        if (
          !silent ||
          (commentsResult.status === "fulfilled" && !commentsResult.value.incomplete)
        ) {
          setCommentsError(
            commentsResult.status === "rejected"
              ? "Failed to load comments. Please retry."
              : // Reached only when the viewer asked for this refresh (a silent
                // poll skips the whole branch on an incomplete answer). Saying
                // nothing here would render "No comments awaiting your reply" —
                // a confident claim built on half a list.
                commentsResult.value.incomplete
                ? "Some comment threads couldn't be loaded. Please retry."
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
        if (!silent || reviewedResult.status === "fulfilled") {
          setReviewedError(
            reviewedResult.status === "rejected"
              ? "Failed to load reviewed PRs. Please retry."
              : null,
          );
          setReviewedPrs(reviewedResult.status === "fulfilled" ? reviewedResult.value.items : []);
        }
        // Fresh list for this scope, so collapse the reveal back to the first
        // page — but never on a silent poll, which refreshes in place and must
        // not fold a "Load more" expansion the user is reading.
        if (!silent) {
          setClosedVisible(ARCHIVE_PAGE_SIZE);
          setReviewedVisible(ARCHIVE_PAGE_SIZE);
        }
        const anyPartial =
          (stuckResult.status === "fulfilled" && stuckResult.value.partial) ||
          (reviewResult.status === "fulfilled" && reviewResult.value.partial) ||
          (readyResult.status === "fulfilled" && readyResult.value.partial) ||
          // An incomplete answer sets X-Partial too. When the viewer asked for
          // this refresh the comments section says so itself, and counting it
          // here as well would put two banners and two Retry buttons on one
          // failure — but a silent poll leaves that section silent on purpose,
          // so there the global banner is the only signal left.
          (commentsResult.status === "fulfilled" &&
            commentsResult.value.partial &&
            !(commentsResult.value.incomplete && !silent)) ||
          (closedResult.status === "fulfilled" && closedResult.value.partial) ||
          (reviewedResult.status === "fulfilled" && reviewedResult.value.partial);
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
    const storedDraftFilter = localStorage.getItem("prison.draftFilter");
    // The old two-state key. Read as a fallback so anyone who had drafts hidden
    // keeps them hidden across the upgrade; never written again.
    const storedHideDrafts = localStorage.getItem("prison.hideDrafts");
    const storedShowBots = localStorage.getItem("prison.showBots");
    const storedHideReacted = localStorage.getItem("prison.hideReacted");
    const storedGroupBy = localStorage.getItem("prison.groupBy");
    const storedAutoRefresh = localStorage.getItem("prison.autoRefresh");
    const storedPollInterval = localStorage.getItem("prison.pollInterval");
    const storedTracked = localStorage.getItem("prison.trackedChecks");
    const storedIgnored = localStorage.getItem("prison.ignoredChecks");
    const storedClosedOpen = localStorage.getItem("prison.closedOpen");
    const storedReviewedOpen = localStorage.getItem("prison.reviewedOpen");
    const storedActivity = localStorage.getItem(ACTIVITY_KEY);
    // Refs, not state: the detection effect reads them, and a restored
    // snapshot must be in place before the first fetch lands or that fetch
    // diffs against nothing and the catch-up has no baseline.
    seenStatusRef.current = parseSnapshot(localStorage.getItem(SNAPSHOT_KEY));
    // Only with a baseline. A first-ever run has none, and letting it report
    // would write the entire board into the feed as news.
    catchUpRef.current = seenStatusRef.current.size > 0;
    startTransition(() => {
      setNotifPermission(notificationPermission());
      setActivity(parseActivity(storedActivity));
      if (
        stored === ALL ||
        stored === login ||
        (stored && orgs.some((o) => o.login === stored))
      ) {
        setSelectedOrg(stored);
      }
      if (DRAFT_FILTERS.some((f) => f.value === storedDraftFilter)) {
        setDraftFilter(storedDraftFilter as DraftFilter);
      } else if (storedHideDrafts === "true") {
        setDraftFilter("none");
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
      if (storedReviewedOpen === "true") {
        setReviewedOpen(true);
      }
      // "blocker" (old value) falls through → stays "flat" (default)
      setTracked(parseTracked(storedTracked));
      setIgnored(parseIgnored(storedIgnored));
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
    localStorage.setItem("prison.draftFilter", draftFilter);
  }, [draftFilter, hydrated]);

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
    localStorage.setItem("prison.ignoredChecks", JSON.stringify(ignored));
  }, [ignored, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.closedOpen", String(closedOpen));
  }, [closedOpen, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.reviewedOpen", String(reviewedOpen));
  }, [reviewedOpen, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.autoRefresh", String(autoRefresh));
  }, [autoRefresh, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.pollInterval", String(pollInterval));
  }, [pollInterval, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
  }, [activity, hydrated]);

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

  // The title badge follows the same count the bell shows, so it survives a
  // return to the tab. It used to clear on focus, which is the moment *before*
  // the user has had a chance to read anything — the count reached zero without
  // ever having been looked at. Opening the activity panel clears it now.
  useEffect(() => {
    const base = withoutBadge(document.title);
    document.title = unseen > 0 ? withBadge(base, unseen) : base;
  }, [unseen]);

  // nowTick is only a re-render trigger — it makes the label age between
  // fetches instead of freezing at whatever it said when the data landed.
  const lastRefreshedLabel = useMemo(() => {
    if (!lastRefreshedAt) return null;
    const age = relativeAge(lastRefreshedAt, new Date());
    return age === "0m" ? "Updated just now" : `Updated ${age} ago`;
  }, [lastRefreshedAt, nowTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Request notification permission only on an explicit enable (a user
  // gesture) — restoring the setting from localStorage must not prompt.
  const handleEnableNotifications = useCallback(() => {
    void requestNotificationPermission()
      .then(setNotifPermission)
      .catch(() => setNotifPermission(notificationPermission()));
  }, []);

  // Permission can be revoked in site settings without a reload, which would
  // leave a Test button that silently does nothing. Re-read it on the click so
  // the pane falls back to the blocked hint instead.
  const handleTestNotification = useCallback(() => {
    setNotifPermission(notificationPermission());
    showTestNotification();
  }, []);

  // Opening the panel is the only thing that marks the feed read — see the
  // title-badge effect for why returning to the tab deliberately doesn't.
  const handleOpenActivity = useCallback(() => {
    setActivity(markAllSeen);
  }, []);

  const handleClearActivity = useCallback(() => setActivity([]), []);

  // Same in reverse: unblocking PRison in site settings is a change nothing in
  // the page can hear, so the pane would keep claiming it is blocked. Opening
  // Settings is the moment that reading matters, so take it fresh then.
  const handleOpenSettings = useCallback(() => {
    setNotifPermission(notificationPermission());
    setSettingsOpen(true);
  }, []);

  const handleAutoRefreshChange = useCallback(
    (on: boolean) => {
      setAutoRefresh(on);
      if (on) handleEnableNotifications();
    },
    [handleEnableNotifications],
  );

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
  // A PR the stuck list holds only because a check the user threw out went red
  // belongs with the mergeable ones — that is what calling a check broken is
  // for. Drafts are never promoted: the ready list has none by construction,
  // and a draft cannot be merged however green it is.
  // A PR can arrive in both payloads — the stuck query keeps the BLOCKED ones
  // the ready query also claims — so a promotion has to check it is not
  // repeating what the ready list already says, or the row is drawn twice.
  const readyIds = new Set(readyPrs.map((pr) => pr.id));
  const promotedReady = stuckPrs
    .filter((pr) => !pr.isDraft && !readyIds.has(pr.id) && readyDespiteIgnored(pr, ignored))
    .map(readyFromStuck);
  const sortedReady = sortByAgeAsc([...readyPrs, ...promotedReady], (pr) => pr.readySince);

  // Client-side arbitration for BLOCKED+SUCCESS+APPROVED PRs: each such PR lands
  // in exactly one list based on whether its tracked checks are present in the rollup.
  // If awaiting checks are absent → stuck (with awaiting chips); if all present → ready.
  // Ignoring a check says the name means nothing on this repo any more, so the
  // wait for it ends with it: an awaiting chip for a check the user threw out
  // would announce exactly the thing they asked never to hear about again.
  const awaitingOn = (repo: string, checkNames: string[]) =>
    awaitingChecks(repo, checkNames, tracked).filter((c) => !isIgnoredCheck(repo, c.name, ignored));

  const isAwaiting = (repo: string, checkNames: string[]) =>
    awaitingOn(repo, checkNames).some((c) => c.required);

  const toggleIgnore = (repo: string, name: string) =>
    setIgnored((cfg) =>
      isIgnoredCheck(repo, name, cfg) ? unignoreCheck(repo, name, cfg) : ignoreCheck(repo, name, cfg),
    );

  // A check GitHub did report. It keeps its own colours unless the user has
  // said something about it: a check they marked as unable to block the merge,
  // and one they threw out entirely, are both drawn muted and dashed — a red
  // job that holds nothing up should not read like one that does. A name they
  // never mentioned keeps its colours, because the muted style means "not
  // blocking" and claiming that of an unknown check invents knowledge PRison
  // does not have.
  const checkChip = (repo: string, name: string, tone: "danger" | "warning", key: string) => {
    const thrownOut = isIgnoredCheck(repo, name, ignored);
    const notRequired = checkRequirement(repo, name, tracked) === "optional";
    return (
      <CheckChip
        key={key}
        name={name}
        tone={thrownOut || notRequired ? "muted" : tone}
        ignored={thrownOut}
        description={!thrownOut && notRequired ? `${name} — not required` : undefined}
        onToggleIgnore={() => toggleIgnore(repo, name)}
      />
    );
  };

  // One home for the rule, because three lists apply it and three copies is how
  // they stop agreeing.
  const matchesDraft = (isDraft: boolean) =>
    draftFilter === "all" || (draftFilter === "only") === isDraft;

  const sortedStuckAll = sortedStuck.filter((pr) => matchesDraft(pr.isDraft));
  // A BLOCKED+approved+green PR with no awaiting tracked checks is already in the ready
  // list; exclude it from stuck so it doesn't appear in both lists.
  const promotedIds = new Set(promotedReady.map((pr) => pr.id));
  const visibleStuck = sortedStuckAll.filter(
    (pr) => !(pr.readyViaBlocked && !isAwaiting(pr.repo, pr.checkNames)) && !promotedIds.has(pr.id),
  );
  const visibleReviews = sortedReviews.filter((req) => matchesDraft(req.isDraft));
  // Drafts are already excluded server-side (parseReadyPrs drops drafts), so
  // "No drafts" is a no-op here and "Only drafts" can only ever come up empty —
  // correctly, since a draft cannot be merged. The empty message says so rather
  // than leaving a permanently blank section looking broken.
  // A BLOCKED+approved+green PR with awaiting tracked checks belongs in stuck, not here.
  const visibleReady = sortedReady.filter(
    (pr) => !(pr.viaBlocked && isAwaiting(pr.repo, pr.checkNames)),
  );

  // A PR the viewer is being asked to review AGAIN is not history — it is back
  // in the work queue, and GitHub reports it under both searches. Waiting-on-you
  // wins, so no PR sits in two lists.
  const reviewRequestIds = new Set(sortedReviews.map((req) => req.id));
  const sortedReviewedAll = sortByAgeDesc(
    reviewedPrs.filter((pr) => !reviewRequestIds.has(pr.id)),
    (pr) => pr.reviewedAt,
  );
  const sortedReviewed = sortedReviewedAll.filter((pr) => matchesDraft(pr.isDraft));

  // Comments on the viewer's own PRs are only shown for PRs the dashboard is
  // currently showing, so the column can never point at a PR that isn't on
  // screen. Derived from the lists AFTER arbitration, which is why it lives
  // here and not in the route.
  //
  // Two lists, not three: "Waiting on your review" cannot contribute. A comment
  // reaching the check below came from one of /api/pr-comments' two legs, and
  // neither can land on a PR in that list — the own leg searches author:@me,
  // which review-requested:@me excludes because GitHub will not request a review
  // from a PR's own author, and every row the reviewed leg emits carries
  // viewerStarted, which short-circuits the check before it gets here.
  //
  // And it would still be redundant if that first half ever turned out to have a
  // hole: a comment from the own leg is on an author:@me PR, and the two lists
  // below search author:@me too, so the review list has nothing of its own to
  // contribute either way.
  //
  // It used to be included defensively, with a test that fabricated the payload
  // to cover it. Both are gone: defence against an input the route cannot emit
  // is a claim nobody can check, and a test that manufactures the input to prove
  // the claim only checks itself.
  const visiblePrIds = new Set([
    ...visibleStuck.map((pr) => pr.id),
    ...visibleReady.map((pr) => pr.id),
  ]);
  const visibleComments = sortByAgeAsc(
    comments.filter(
      (c) =>
        // A thread the viewer raised on someone else's PR needs no list to
        // justify it — it is waiting on them either way, and tying it to the
        // reviewed list would have hidden it whenever that list failed or
        // filtered the PR out.
        (c.viewerStarted || visiblePrIds.has(c.prId)) &&
        (showBots || !c.isBot) &&
        !(hideReacted && c.viewerReacted),
    ),
    (c) => c.commentedAt,
  );

  // Newest-close first; the section renders only the first closedVisible rows.
  const sortedClosed = sortByAgeDesc(closedPrs, (pr) => pr.endedAt);

  // The search box narrows what is on screen, and every count on the board is
  // derived from these — so the tiles, the section index and each header follow
  // without being told.
  //
  // Deliberately downstream of the visible* lists rather than folded into them:
  // change detection reads visible*, and a query is a way of looking rather
  // than a statement about what interests you. Filtering the snapshot would
  // make every row you typed past "vanish", then report the lot as news the
  // moment you cleared the box.
  const terms = parseTerms(query);
  const shownReady = visibleReady.filter((pr) =>
    matches(terms, pr.title, pr.repo, pr.number, pr.checkNames),
  );
  const shownReviews = visibleReviews.filter((req) =>
    matches(terms, req.title, req.repo, req.number, req.author),
  );
  const shownStuck = visibleStuck.filter((pr) =>
    // Check names are the useful half here: "which of mine is integration-tests
    // red on" is a question the board can answer and could not be asked.
    matches(terms, pr.title, pr.repo, pr.number, pr.checkNames),
  );
  const shownComments = visibleComments.filter((c) =>
    matches(terms, c.preview, c.repo, c.number, c.author, c.path),
  );
  const shownReviewed = sortedReviewed.filter((pr) =>
    matches(terms, pr.title, pr.repo, pr.number, pr.author),
  );
  const shownClosed = sortedClosed.filter((pr) =>
    matches(terms, pr.title, pr.repo, pr.number),
  );

  // A section emptied by the query must not read like a section that is
  // legitimately empty: "no PRs waiting on your review" is good news, "none of
  // them match" is not.
  const emptyText = (base: string) =>
    terms.length > 0 ? `Nothing here matches “${query.trim()}”` : base;

  // Change detection, against the visible (filtered) lists — a hidden bot
  // comment, a reacted thread, or a filtered draft must never announce itself.
  // The closed list is passed whole rather than as its rendered slice: the
  // section is collapsed by default, and a merge is worth hearing about
  // regardless of whether it happens to be on screen.
  // What counts is a *status* change, not just a new id: a PR that goes from
  // stuck to ready keeps its id, and that transition is the whole point.
  // Runs after every commit: ordinary commits (filter toggles, manual
  // refreshes, org switches) just mark what's on screen as seen; only the
  // commit that carries a silent poll's results (pollGen changed) records
  // anything. That guard is what keeps the first load from writing the whole
  // board into the feed, since every item reads as new against an empty
  // snapshot.
  //
  // No dependency array on purpose. The one the rule suggests lists the visible
  // lists, which are rebuilt on every render and so carry a fresh identity each
  // time — it would silence the rule without changing when this runs. The
  // recording terminates by guard instead: lastPollGenRef is advanced before
  // setActivity, so the render it causes finds the guard closed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const prev = seenStatusRef.current;
    const visible = snapshotStatuses({
      ready: visibleReady,
      stuck: visibleStuck,
      reviews: visibleReviews,
      comments: visibleComments,
      closed: sortedClosed,
      reviewed: sortedReviewed,
    });
    const events = diffStatuses(prev, visible);
    // Unconditionally, including when nothing was reported: diffStatuses
    // deliberately swallows a fall back to waiting, and leaving the old status
    // on record would then swallow the *next* failure too, because it would
    // match what we last saw. The union keeps ids that have left the board, so
    // an item that flaps out and back still doesn't re-announce itself.
    const merged = new Map(prev);
    // Re-inserting an existing key keeps its ORIGINAL slot in a Map, so a plain
    // union orders the snapshot by when an id was FIRST seen. Past the stored
    // bound that evicts the wrong end: a PR that has sat on the board since
    // before the oldest thousand ids is dropped while ids long gone from it
    // survive, and the next open reports that still-visible PR as news. Deleting
    // first moves everything currently on screen to the end, so what falls off
    // is what really is stale.
    for (const [id, event] of visible) {
      merged.delete(id);
      merged.set(id, event);
    }
    seenStatusRef.current = merged;
    // The union differs from what it grew out of exactly when some visible item
    // is new or has moved — the same test, over the handful of items on screen
    // rather than over the whole accumulated snapshot. This effect has no
    // dependency array and so runs on every commit, including the ones that
    // only ticked an age label; serializing a thousand ids each time to find
    // out nothing changed is work for its own sake.
    const moved = [...visible].some(([id, event]) => {
      const seen = prev.get(id);
      return !seen || seen.status !== event.status || seen.at !== event.at;
    });
    if (hydrated && moved) {
      localStorage.setItem(SNAPSHOT_KEY, serializeSnapshot(merged));
    }
    // The first fetch after a mount that restored a snapshot reports too: what
    // changed while PRison was closed is exactly what the user came to find
    // out. Spent on the first fetch that LANDED — not the first one that
    // happened to bring visible rows: a first load where every endpoint
    // rejected leaves it armed, so Retry still reports what moved, while a
    // board that is legitimately empty spends it and a later org switch can
    // never be mistaken for the catch-up and replay everything into the feed.
    // A desktop notification still needs an unfocused tab, so opening the app
    // doesn't notify about what it is already showing.
    const catchUp = catchUpRef.current && landedRef.current;
    if (catchUp) catchUpRef.current = false;
    if (pollGen !== lastPollGenRef.current || catchUp) {
      lastPollGenRef.current = pollGen;
      if (events.length > 0) {
        // Recorded whether or not the tab is focused: the feed is a timeline,
        // and something that moved while the user was looking still belongs in
        // it. The notification keeps the focus condition — it exists to
        // interrupt, and interrupting someone already looking is noise.
        setActivity((log) => appendEvents(log, events, new Date()));
        // This poll's events only. The accumulated history has a home now, and
        // re-announcing everything still unseen would repeat older events on
        // every poll, since unseen no longer clears when the tab regains focus.
        if (!document.hasFocus()) showChangeNotification(events);
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
        onOpenSettings={handleOpenSettings}
        activity={activity}
        onOpenActivity={handleOpenActivity}
        onClearActivity={handleClearActivity}
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
        availableRepos={availableRepos}
        owners={repoOwners}
        value={tracked}
        onChange={setTracked}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        showBots={showBots}
        onShowBotsChange={setShowBots}
        hideReacted={hideReacted}
        onHideReactedChange={setHideReacted}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={handleAutoRefreshChange}
        pollInterval={pollInterval}
        onPollIntervalChange={setPollInterval}
        notifPermission={notifPermission}
        onEnableNotifications={handleEnableNotifications}
        onTestNotification={handleTestNotification}
        ignored={ignored}
        onIgnoredChange={setIgnored}
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
          {/* Drafts get filtered constantly — often enough that burying this in
              Settings cost two clicks every time. It lives here, in the same
              visual language as the group-by buttons, and as three buttons
              rather than a cycling one so every state is a single click and a
              screen reader can read the whole set at once. */}
          <div role="group" aria-label="Drafts" className="flex rounded-md">
            {DRAFT_FILTERS.map(({ value, label }, i) => (
              <button
                key={value}
                type="button"
                aria-pressed={draftFilter === value}
                onClick={() => setDraftFilter(value)}
                className={`min-h-[44px] cursor-pointer px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                  i === 0 ? "rounded-l-md" : ""
                } ${i === DRAFT_FILTERS.length - 1 ? "rounded-r-md" : ""} ${
                  draftFilter === value
                    ? "bg-accent text-background"
                    : "bg-surface text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* type="search" for the browser's own clear affordance rather than a
              hand-built one; Escape is the keyboard half of the same thing. A
              filter you cannot see the end of is one you forget is on. */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            aria-label="Search the board"
            placeholder="Search title, repo, author, check…"
            className="min-h-[44px] w-full rounded-md bg-surface px-4 text-sm text-foreground placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:w-64"
          />
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
            className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md bg-surface px-4 text-sm font-medium text-foreground hover:brightness-[var(--hover-brightness)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${lastRefreshedAt ? "" : "ml-auto"}`}
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
        {/* Counts of the visible lists, so a tile can never disagree with the
            list under it. Each list is sorted oldest-first, so its head is its
            own longest wait — no scan, and no age without a queue to own it. */}
        <SummaryTiles
          waiting={{
            count: shownReviews.length,
            oldest: shownReviews[0]?.requestedAt,
          }}
          stuck={{
            count: shownStuck.length,
            oldest: shownStuck[0]?.stuckSince,
          }}
          replies={{
            count: shownComments.length,
            oldest: shownComments[0]?.commentedAt,
          }}
          now={new Date()}
        />
        {/* Where everything is, in the order it appears — including the two
            histories at the foot of the board, which is the whole point: they
            are the sections nothing above could reach. Counts match each
            section's own header, so the visible lists for the work queues and
            the fetched totals for the archives, exactly as the headers do. */}
        <SectionIndex
          sections={[
            { id: "ready-to-merge", label: "Ready to merge", count: shownReady.length },
            { id: "comments-awaiting-reply", label: "Comments awaiting your reply", count: shownComments.length },
            { id: "waiting-on-your-review", label: "PRs waiting on your review", count: shownReviews.length },
            { id: "stuck-on-checks", label: "PRs stuck on checks", count: shownStuck.length },
            { id: "recently-reviewed", label: "Recently reviewed", count: shownReviewed.length },
            { id: "recently-closed", label: "Recently merged / closed", count: shownClosed.length },
          ]}
        />
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
            id="ready-to-merge"
            items={shownReady}
            emptyMessage={emptyText(
              draftFilter === "only"
                ? "Drafts are never ready to merge"
                : "Nothing ready to merge",
            )}
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
                // A PR promoted here over a red check still says so — muted,
                // because the user already answered for it, but said: a card
                // with nothing on it would read as spotlessly green.
                detail={
                  pr.needsUpdate || pr.ignoredChecks?.length ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {pr.needsUpdate && (
                        <span className="bg-warning/10 text-warning ring-1 ring-inset ring-warning/30 rounded px-1.5 py-0.5 text-xs font-medium">
                          Needs update
                        </span>
                      )}
                      {pr.ignoredChecks?.map((name) => (
                        <CheckChip
                          key={`ignored-${name}`}
                          name={name}
                          tone="muted"
                          ignored
                          onToggleIgnore={() => toggleIgnore(pr.repo, name)}
                        />
                      ))}
                    </div>
                  ) : undefined
                }
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
            id="comments-awaiting-reply"
            items={shownComments}
            emptyMessage={emptyText("No comments awaiting your reply 🎉")}
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
                    {/* A review body has no file, so without this it would read
                        as an inline thread whose path failed to load — and the
                        two are answered in different places. */}
                    {c.source === "review" && (
                      <span className="inline-flex items-center rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-border">
                        Review comment
                      </span>
                    )}
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
        {/* Two columns, paired by subject rather than stacked as rows: other
            people's PRs on the left (the ones you owe a review, then the ones
            you have already reviewed), your own on the right (blocked, then
            finished). It is the split the queries already make —
            review-requested/reviewed-by against author — so each history sits
            directly under the queue it is the history of.

            It is also why they are columns and not a second grid row: a row is
            as tall as its tallest cell, so expanding one list used to push the
            unrelated section on the other side down with it.  */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Other people's PRs: the review queue, then what you reviewed. */}
          <div className="flex flex-col gap-6">
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
                id="waiting-on-your-review"
                items={shownReviews}
                emptyMessage={emptyText("No PRs waiting on your review 🎉")}
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
            <ArchiveSection
              title="Recently reviewed"
              id="recently-reviewed"
              count={shownReviewed.length}
              countTestId="reviewed-count-badge"
              open={reviewedOpen}
              onToggle={() => setReviewedOpen((o) => !o)}
              error={reviewedError}
              onRetry={() => fetchData(selectedOrg)}
            >
              {shownReviewed.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-background/40 px-4 py-6 text-center text-sm text-muted">
                  {emptyText("No PRs you have reviewed are still open")}
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    {shownReviewed.slice(0, reviewedVisible).map((pr) => (
                      <li key={pr.id}>
                        <ReviewedPrRow pr={pr} now={new Date()} />
                      </li>
                    ))}
                  </ul>
                  {shownReviewed.length > reviewedVisible && (
                    <button
                      type="button"
                      onClick={() => setReviewedVisible((v) => v + ARCHIVE_PAGE_SIZE)}
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-surface px-4 text-sm font-medium text-foreground hover:brightness-[var(--hover-brightness)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      Load more (showing {reviewedVisible} of {shownReviewed.length})
                    </button>
                  )}
                </>
              )}
            </ArchiveSection>
          </div>
          {/* Your own PRs: what is blocked, then what is finished. */}
          <div className="flex flex-col gap-6">
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
                id="stuck-on-checks"
                items={shownStuck}
                emptyMessage={emptyText("No PRs stuck on checks 🎉")}
                keyExtractor={(pr) => pr.id}
                countAccent="danger"
                groupBy={groupBy === "repo" ? (pr) => pr.repo : undefined}
                groupKeys={
                  groupBy === "check"
                    ? (pr) => stuckGroupKeys(pr, tracked, ignored)
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
                  const awaiting = awaitingOn(pr.repo, pr.checkNames);
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
                  // Conflicts used to be an either/or with the check chips — a
                  // muted sentence shown only when the PR had no check names at
                  // all. One red check was enough to hide the fact that the branch
                  // will not merge, which is the harder blocker of the two: a
                  // check can go green on its own, a conflict cannot. So it is a
                  // chip like the others, first in the row, in danger's colours.
                  const conflicted = pr.mergeState === "DIRTY";
                  const conflictChip = conflicted ? (
                    <span
                      key="conflict"
                      className="inline-flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-xs font-medium text-danger ring-1 ring-inset ring-danger/30"
                    >
                      <svg aria-hidden="true" className="shrink-0" width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.5 2.5v7M8.5 2.5v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        <path d="M2 4.5 4 6.5m0-2L2 6.5M7 4.5l2 2m0-2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      {MERGE_CONFLICT_LABEL}
                    </span>
                  ) : null;
                  let detail: React.ReactNode;
                  if (conflicted || hasNames || hasAwaiting || reviewNeeded) {
                    detail = (
                      <div className="flex flex-wrap gap-1 items-center">
                        {conflictChip}
                        {showFailingNames.map((name, i) =>
                          checkChip(pr.repo, name, "danger", `fail-${i}-${name}`),
                        )}
                        {showPendingNames.map((name, i) =>
                          checkChip(pr.repo, name, "warning", `pend-${i}-${name}`),
                        )}
                        {overflow > 0 && (
                          <span className="text-xs text-muted">+{overflow} more</span>
                        )}
                        {hasAwaiting &&
                          awaiting.map(({ name, required }) => (
                            <CheckChip
                              key={`await-${name}`}
                              name={name}
                              tone={required ? "warning" : "muted"}
                              ignored={false}
                              description={
                                required ? `Awaiting required check: ${name}` : `Awaiting: ${name}`
                              }
                              onToggleIgnore={() => toggleIgnore(pr.repo, name)}
                              icon={
                                <svg aria-hidden="true" className="shrink-0" width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
                                  <path d="M6 3.5v2.75l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              }
                            />
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
            <ArchiveSection
              title="Recently merged / closed"
              id="recently-closed"
              count={shownClosed.length}
              countTestId="closed-count-badge"
              open={closedOpen}
              onToggle={() => setClosedOpen((o) => !o)}
              error={closedError}
              onRetry={() => fetchData(selectedOrg)}
            >
              {shownClosed.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-background/40 px-4 py-6 text-center text-sm text-muted">
                  {emptyText("No closed PRs")}
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    {shownClosed.slice(0, closedVisible).map((pr) => (
                      <li key={pr.id}>
                        <ClosedPrRow pr={pr} now={new Date()} />
                      </li>
                    ))}
                  </ul>
                  {shownClosed.length > closedVisible && (
                    <button
                      type="button"
                      onClick={() => setClosedVisible((v) => v + ARCHIVE_PAGE_SIZE)}
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-surface px-4 text-sm font-medium text-foreground hover:brightness-[var(--hover-brightness)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      Load more (showing {closedVisible} of {shownClosed.length})
                    </button>
                  )}
                </>
              )}
            </ArchiveSection>
          </div>
        </div>
      </main>
    </div>
  );
}
