"use client";

import type { Budget } from "@/lib/github/budget";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useTransition,
} from "react";
import type {
  Org,
  StuckPr,
  ReviewRequest,
  ReadyPr,
  PrComment,
  ClosedPr,
  ReviewedPr,
  AwaitingPr,
} from "@/lib/types";
import { sortByAgeAsc, sortByAgeDesc, relativeAge } from "@/lib/prioritize";
import { isValidRepo } from "@/lib/github/validate";
import { parseTerms, matches } from "@/lib/search";
import {
  suggestStuck,
  unresolvedLabel,
  suggestReview,
  suggestReady,
  suggestComment,
  needsReview,
  stuckGroupKeys,
  reviewDecisionLabel,
  MERGE_CONFLICT_LABEL,
} from "@/lib/suggest";
import { PrList } from "./PrList";
import { NextMove, SIZE, type NextMoveItem } from "./NextMove";
import { PrRow } from "./PrRow";
import { AwaitingDetail } from "./AwaitingDetail";
import { reminderText } from "@/lib/reminder";
import {
  reviewMinutes, minutesLabel, sizeTone, stuckMinutes,
  REPLY_MINUTES, MERGE_MINUTES, TIME_BUDGETS, type TimeBudget,
} from "@/lib/estimate";
import { SnoozeMenu, SnoozedFold } from "./Snooze";
import { limitState, limitLabel, parseLimits, type Limits } from "@/lib/limits";
import { WeekCard } from "./WeekCard";
import type { ReviewFact } from "@/lib/week";

import { isSnoozed, parseSnoozes, pruneSnoozes, snoozeFor, type Snoozes, type SnoozeChoice } from "@/lib/snooze";
import { ClosedPrRow } from "./ClosedPrRow";
import { ReviewedPrRow } from "./ReviewedPrRow";
import { ArchiveSection } from "./ArchiveSection";
import { Header } from "./Header";
import { SettingsModal } from "./SettingsModal";
import {
  type TrackedChecks,
  EMPTY_TRACKED,
  parseTracked,
  awaitingChecks,
  checkRequirement,
} from "@/lib/tracked-checks";
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
import { isSeen, parseSeen, type SeenComments } from "@/lib/seen-comments";
import { CheckChip } from "./CheckChip";
import {
  DEFAULT_POLL_INTERVAL_MS,
  shouldAnnounceInterval,
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

// The look back is asked once in this long per scope, not on every refresh.
const WEEK_TTL_MS = 12 * 3_600_000;
const WEEK_KEY = "prison.week";

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

// "flat" keeps its name for the stored preference; on the tier board it means
// each queue's column as-is, so that is what the button says.
const GROUP_BYS: { value: "flat" | "repo" | "check"; label: string }[] = [
  { value: "flat", label: "By queue" },
  { value: "repo", label: "By repo" },
  { value: "check", label: "By check" },
];

/** A review's estimate with the size behind it, so the guess shows its working. */
function sizeText(
  req: { additions?: number; deletions?: number; changedFiles?: number },
  minutes: number,
): string {
  const lines = (req.additions ?? 0) + (req.deletions ?? 0);
  const files = req.changedFiles ?? 0;
  return `${minutesLabel(minutes)} · ${lines.toLocaleString("en-US")} ${lines === 1 ? "line" : "lines"} · ${files} ${files === 1 ? "file" : "files"}`;
}

/** Same precedence the server applies in resolveScope: repo:owner/name already
 * names its owner, so sending an org beside it could only agree or contradict. */
function scopeQuery(org: string, repo: string, login: string): string {
  return repo
    ? `?repo=${encodeURIComponent(repo)}`
    : org === login
      ? `?user=${encodeURIComponent(login)}`
      : org
        ? `?org=${encodeURIComponent(org)}`
        : "";
}

/** "3 PRs · oldest 2d" under a column's count; just the unit when it is empty. */
function caption(count: number, unit: string, oldest: string | undefined): string {
  return oldest && count > 0 ? `${unit} · oldest ${relativeAge(oldest, new Date())}` : unit;
}

/** A header's number, or null when the header wasn't there to read.
 *
 * An empty string counts as absent, because Number("") is 0 and a header
 * that says nothing would otherwise report a refresh that cost nothing. */
function number(header: string | null | undefined): number | null {
  if (header === null || header === undefined || header.trim() === "")
    return null;
  const value = Number(header);
  return Number.isFinite(value) ? value : null;
}

/** The clock time a spent budget returns at, in the reader's own timezone —
 * "at 13:56" is the answer; an ISO string in UTC is a second puzzle. */
function budgetTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "the top of the hour"
    : at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Dashboard({ orgs, login }: DashboardProps) {
  const [selectedOrg, setSelectedOrg] = useState<string>(ALL);
  // "" means every repo in the current org scope. A repo narrows the search
  // itself rather than the rendered rows: the window is first:50, so filtering
  // client-side would leave a busy account's focused repo outside it entirely
  // and show an empty board that looks like a repo with nothing open.
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [draftFilter, setDraftFilter] = useState<DraftFilter>("all");
  // Bots author the large majority of unanswered review threads, so they are
  // hidden by default; the filter is client-side to keep the toggle instant.
  const [showBots, setShowBots] = useState(false);
  // Off until asked for: this is the one thing in here that reaches the
  // network for PRison's own sake rather than the user's work.
  const [updateChecks, setUpdateChecks] = useState(false);
  // Reacting with an emoji is how the user acknowledges a comment without replying,
  // so reacted threads are hidden by default; client-side to keep the toggle instant.
  const [hideReacted, setHideReacted] = useState(true);
  // The same acknowledgement without leaving a trace on GitHub: marked on the
  // board, kept in this browser. Hidden by default, like reacted threads.
  const [seen, setSeen] = useState<SeenComments>({});
  const [hideSeen, setHideSeen] = useState(true);
  const [groupBy, setGroupBy] = useState<"flat" | "repo" | "check">("flat");
  // Component state, never persisted — the rule the section folds follow: a
  // query that outlived the sitting would hide work tomorrow morning with no
  // memory that you were the one who hid it.
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // "/" jumps to the search box, the convention GitHub itself uses — but never
  // while typing somewhere else, where "/" is just a character.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // A dialog or panel on top owns the keyboard; never pull focus out from under it.
      if (document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"], [role="region"][aria-label="Activity"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [pollInterval, setPollInterval] = useState(DEFAULT_POLL_INTERVAL_MS);
  // undefined = the budget is fine. A string is when it comes back; null is a
  // spent budget GitHub did not put a time on.
  const [budgetSpent, setBudgetSpent] = useState<string | null | undefined>(
    undefined,
  );
  // What the last refresh cost, and what GitHub said was left after it. Asked
  // for because a budget nobody can see is one nobody can spend deliberately.
  const [budget, setBudget] = useState<Budget | null>(null);
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
  const [awaitingPrs, setAwaitingPrs] = useState<AwaitingPr[]>([]);
  const [stuckError, setStuckError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [closedError, setClosedError] = useState<string | null>(null);
  const [reviewedError, setReviewedError] = useState<string | null>(null);
  const [awaitingError, setAwaitingError] = useState<string | null>(null);
  // The row whose reminder was just copied, so its button can say so.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Closed PRs are history, not a work queue, so the section starts collapsed;
  // closedVisible drives the client-side "Load more" (15 at a time).
  const [closedOpen, setClosedOpen] = useState(false);
  // Next move ids the user stepped past this sitting. Not persisted: Skip is
  // "not this one right now", and tomorrow it may well be the right one.
  const [skipped, setSkipped] = useState<string[]>([]);
  // How long the user said they have; null ("Any") is the longest wait first.
  const [timeBudget, setTimeBudget] = useState<TimeBudget>(null);
  // Items put off until a time or until they change; see lib/snooze.
  const [snoozes, setSnoozes] = useState<Snoozes>({});
  // How long each queue may wait before it is late; empty is off.
  const [limits, setLimits] = useState<Limits>({});
  // The weekly look back; null until it has loaded.
  const [week, setWeek] = useState<ReviewFact[] | null>(null);
  const [weekError, setWeekError] = useState(false);
  const [closedVisible, setClosedVisible] = useState(ARCHIVE_PAGE_SIZE);
  // Same shape as the closed history: a look-back list, so it starts collapsed
  // and reveals a page at a time.
  const [reviewedOpen, setReviewedOpen] = useState(false);
  const [reviewedVisible, setReviewedVisible] = useState(ARCHIVE_PAGE_SIZE);
  const [partial, setPartial] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Tracks the most recently requested scope so stale in-flight responses are
  // discarded instead of overwriting the current view. It holds "org|repo", not
  // the org alone: switching repo inside one org leaves the org half unchanged,
  // and a slow answer for the previous repo would be accepted as current.
  const latestScopeRef = useRef<string>(`${ALL}|`);
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
    (org: string, repo = "", silent = false) => {
      latestScopeRef.current = `${org}|${repo}`;
      // Same precedence the server applies in resolveScope: repo:owner/name
      // already names its owner, so sending an org beside it could only agree
      // or contradict.
      const qs = scopeQuery(org, repo, login);
      const run = async () => {
        // A 429 is the hourly point budget, spent — the same wall for every
        // list, so it is recorded once for the run rather than once per list.
        let spent: string | null | undefined = undefined;
        // The refresh's price is the sum of its queries; what is left is
        // whatever the last one to reach GitHub saw, which is the smallest.
        let cost = 0;
        let remaining: number | null = null;
        let resetAt: string | null = null;
        const noteBudget = (r: {
          status: number;
          headers?: { get?: (h: string) => string | null };
        }) => {
          if (r.status === 429)
            spent = r.headers?.get?.("X-RateLimit-Reset") ?? null;
          // A missing header is not a zero: Number(null) is 0, and a route
          // that never priced itself would otherwise report a free refresh
          // and an allowance of nothing.
          const priced = number(r.headers?.get?.("X-Cost"));
          const left = number(r.headers?.get?.("X-Budget-Remaining"));
          if (priced !== null) cost += priced;
          if (left !== null) {
            remaining = remaining === null ? left : Math.min(remaining, left);
          }
          resetAt = r.headers?.get?.("X-Budget-Reset") ?? resetAt;
        };
        const [
          stuckResult,
          reviewResult,
          readyResult,
          commentsResult,
          closedResult,
          reviewedResult,
          awaitingResult,
        ] = await Promise.allSettled([
          fetch(`/api/stuck-prs${qs}`).then(async (r) => {
            noteBudget(r);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as StuckPr[];
            return { items, partial };
          }),
          fetch(`/api/review-requests${qs}`).then(async (r) => {
            noteBudget(r);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ReviewRequest[];
            return { items, partial };
          }),
          fetch(`/api/ready-to-merge${qs}`).then(async (r) => {
            noteBudget(r);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ReadyPr[];
            return { items, partial };
          }),
          fetch(`/api/pr-comments${qs}`).then(async (r) => {
            noteBudget(r);
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
            noteBudget(r);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ClosedPr[];
            return { items, partial };
          }),
          fetch(`/api/reviewed-prs${qs}`).then(async (r) => {
            noteBudget(r);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const items = (await r.json()) as ReviewedPr[];
            return { items, partial };
          }),
          fetch(`/api/awaiting-reviewers${qs}`).then(async (r) => {
            noteBudget(r);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const partial = r.headers?.get?.("X-Partial") === "1";
            const body = await r.json();
            // Only rows that carry their reviewers: anything else is not this
            // route's answer, and drawing it would claim a wait it can't show.
            const items = (Array.isArray(body) ? body : []).filter(
              (pr: AwaitingPr) => Array.isArray(pr?.reviewers),
            ) as AwaitingPr[];
            return { items, partial };
          }),
        ]);

        if (latestScopeRef.current !== `${org}|${repo}`) return;

        setBudgetSpent(spent);
        if (remaining !== null && resetAt !== null)
          setBudget({ cost, remaining, resetAt });

        // Mark this commit for the detection effect below, which diffs the
        // *visible* (filtered) lists rather than these raw results — so a
        // badge or notification always maps to an item actually on screen.
        // Batched with the data setters, so they land in the same commit.
        if (silent) setPollGen((g) => g + 1);

        // The label answers "how stale is what I'm looking at", so it only
        // moves when something actually landed. A fetch where every endpoint
        // rejected refreshed nothing, and claiming otherwise would hide the
        // staleness the label exists to show.
        if (
          [
            stuckResult,
            reviewResult,
            readyResult,
            commentsResult,
            closedResult,
            reviewedResult,
            awaitingResult,
          ].some((r) => r.status === "fulfilled")
        ) {
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
          setStuckPrs(
            stuckResult.status === "fulfilled" ? stuckResult.value.items : [],
          );
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
          setReadyPrs(
            readyResult.status === "fulfilled" ? readyResult.value.items : [],
          );
        }
        // A 200 that dropped a whole search is a failure wearing a success's
        // clothes: replacing the list with it would wipe every own-PR thread
        // off the screen, and the poll after it would then announce them all
        // over again as new.
        if (
          !silent ||
          (commentsResult.status === "fulfilled" &&
            !commentsResult.value.incomplete)
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
          setComments(
            commentsResult.status === "fulfilled"
              ? commentsResult.value.items
              : [],
          );
        }
        if (!silent || closedResult.status === "fulfilled") {
          setClosedError(
            closedResult.status === "rejected"
              ? "Failed to load closed PRs. Please retry."
              : null,
          );
          setClosedPrs(
            closedResult.status === "fulfilled" ? closedResult.value.items : [],
          );
        }
        if (!silent || reviewedResult.status === "fulfilled") {
          setReviewedError(
            reviewedResult.status === "rejected"
              ? "Failed to load reviewed PRs. Please retry."
              : null,
          );
          setReviewedPrs(
            reviewedResult.status === "fulfilled"
              ? reviewedResult.value.items
              : [],
          );
        }
        if (!silent || awaitingResult.status === "fulfilled") {
          setAwaitingError(
            awaitingResult.status === "rejected"
              ? "Failed to load PRs waiting on reviewers. Please retry."
              : null,
          );
          setAwaitingPrs(
            awaitingResult.status === "fulfilled" ? awaitingResult.value.items : [],
          );
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
          (reviewedResult.status === "fulfilled" &&
            reviewedResult.value.partial) ||
          (awaitingResult.status === "fulfilled" && awaitingResult.value.partial);
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
    const storedRepo = localStorage.getItem("prison.repo");
    const storedDraftFilter = localStorage.getItem("prison.draftFilter");
    // The old two-state key. Read as a fallback so anyone who had drafts hidden
    // keeps them hidden across the upgrade; never written again.
    const storedHideDrafts = localStorage.getItem("prison.hideDrafts");
    const storedShowBots = localStorage.getItem("prison.showBots");
    const storedUpdateChecks = localStorage.getItem("prison.updateChecks");
    const storedHideReacted = localStorage.getItem("prison.hideReacted");
    const storedSeen = localStorage.getItem("prison.seenComments");
    const storedHideSeen = localStorage.getItem("prison.hideSeen");
    const storedGroupBy = localStorage.getItem("prison.groupBy");
    const storedAutoRefresh = localStorage.getItem("prison.autoRefresh");
    const storedPollInterval = localStorage.getItem("prison.pollInterval");
    const storedTracked = localStorage.getItem("prison.trackedChecks");
    const storedIgnored = localStorage.getItem("prison.ignoredChecks");
    const storedClosedOpen = localStorage.getItem("prison.closedOpen");
    const storedReviewedOpen = localStorage.getItem("prison.reviewedOpen");
    const storedTimeBudget = localStorage.getItem("prison.timeBudget");
    const storedSnoozes = localStorage.getItem("prison.snoozes");
    const storedLimits = localStorage.getItem("prison.limits");
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
      // Shape-checked rather than matched against a list: the repos a user can
      // reach are not known here, and a stored value the server rejects is a
      // 400 on the next refresh rather than something to guess at.
      if (storedRepo && isValidRepo(storedRepo)) {
        setSelectedRepo(storedRepo);
      }
      if (DRAFT_FILTERS.some((f) => f.value === storedDraftFilter)) {
        setDraftFilter(storedDraftFilter as DraftFilter);
      } else if (storedHideDrafts === "true") {
        setDraftFilter("none");
      }
      if (storedShowBots === "true") {
        setShowBots(true);
      }
      if (storedUpdateChecks === "true") {
        setUpdateChecks(true);
      }
      if (storedHideReacted === "false") {
        setHideReacted(false);
      }
      if (storedHideSeen === "false") {
        setHideSeen(false);
      }
      setSeen(parseSeen(storedSeen));
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
      const budgetChoice = TIME_BUDGETS.find((b) => b !== null && String(b) === storedTimeBudget);
      if (budgetChoice) setTimeBudget(budgetChoice);
      setSnoozes(parseSnoozes(storedSnoozes));
      setLimits(parseLimits(storedLimits));
      // "blocker" (old value) falls through → stays "flat" (default)
      setTracked(parseTracked(storedTracked));
      setIgnored(parseIgnored(storedIgnored));
      setHydrated(true);
    });
  }, [startTransition, orgs, login]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.org", selectedOrg);
    localStorage.setItem("prison.repo", selectedRepo);
    fetchData(selectedOrg, selectedRepo);
  }, [selectedOrg, selectedRepo, hydrated, fetchData]);

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
    localStorage.setItem("prison.updateChecks", String(updateChecks));
  }, [updateChecks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.hideReacted", String(hideReacted));
  }, [hideReacted, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.hideSeen", String(hideSeen));
  }, [hideSeen, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.seenComments", JSON.stringify(seen));
  }, [seen, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.groupBy", groupBy);
  }, [groupBy, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.timeBudget", String(timeBudget));
  }, [timeBudget, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.snoozes", JSON.stringify(snoozes));
  }, [snoozes, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.limits", JSON.stringify(limits));
  }, [limits, hydrated]);

  // The look back changes slowly and costs a query, so it is cached per scope
  // and asked again only when the copy is half a day old.
  useEffect(() => {
    if (!hydrated) return;
    const qs = scopeQuery(selectedOrg, selectedRepo, login);
    let cached: { login?: string; qs?: string; at?: number; facts?: ReviewFact[] } = {};
    try {
      cached = JSON.parse(localStorage.getItem(WEEK_KEY) ?? "{}");
    } catch {
      cached = {};
    }
    // Keyed by who as well as where: the all-organizations scope is the same empty
    // string for every account, and one person must never see another’s reviews.
    const fresh =
      cached.login === login && cached.qs === qs && typeof cached.at === "number" && Date.now() - cached.at < WEEK_TTL_MS;
    if (fresh && Array.isArray(cached.facts)) {
      const facts = cached.facts;
      startTransition(() => {
        setWeek(facts);
        setWeekError(false);
      });
      return;
    }
    let live = true;
    fetch(`/api/my-week${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.json();
        const facts = (Array.isArray(body) ? body : []) as ReviewFact[];
        if (!live) return;
        localStorage.setItem(WEEK_KEY, JSON.stringify({ login, qs, at: Date.now(), facts }));
        setWeek(facts);
        setWeekError(false);
      })
      .catch(() => {
        if (live) setWeekError(true);
      });
    return () => {
      live = false;
    };
  }, [hydrated, selectedOrg, selectedRepo, login, startTransition]);

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

  // Told to the server as well as to localStorage: the menu-bar plugin has no
  // browser to read this out of, and a plugin on its own schedule is how one
  // account spends an hourly budget twice over. Skipped on the load that only
  // read the value back, which would write for nothing — and would overwrite a
  // newer choice made in another tab.
  const announcedIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("prison.pollInterval", String(pollInterval));
    const announce = shouldAnnounceInterval(
      announcedIntervalRef.current,
      pollInterval,
    );
    announcedIntervalRef.current = pollInterval;
    if (!announce) return;
    // Nothing on screen depends on the answer: the dashboard keeps its own
    // copy either way, and a server that refuses this is one the plugin will
    // simply ask for the old number.
    fetch("/api/poll-interval", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ms: pollInterval }),
    }).catch(() => {});
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
    const id = setInterval(() => fetchData(selectedOrg, selectedRepo, true), pollInterval);
    return () => clearInterval(id);
  }, [hydrated, autoRefresh, pollInterval, selectedOrg, selectedRepo, fetchData]);

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
    ]),
  ).sort();

  // Owner logins (personal + orgs) used to scope the repo search to repos the
  // user can access.
  const repoOwners = [login, ...orgs.map((o) => o.login)];

  // An org switch drops the repo. Keeping it would leave the board showing one
  // owner's repo under a control naming another, and the org select is the one
  // thing on the page that must never be able to lie about what is shown.
  const handleOrgChange = (org: string) => {
    setSelectedOrg(org);
    setSelectedRepo("");
  };

  const sortedStuck = sortByAgeAsc(stuckPrs, (pr) => pr.stuckSince);
  const sortedReviews = sortByAgeAsc(reviewReqs, (req) => req.requestedAt);
  // Ignoring a check says the name means nothing on this repo any more, so the
  // wait for it ends with it: an awaiting chip for a check the user threw out
  // would announce exactly the thing they asked never to hear about again.
  const awaitingOn = (repo: string, checkNames: string[]) =>
    awaitingChecks(repo, checkNames, tracked).filter(
      (c) => !isIgnoredCheck(repo, c.name, ignored),
    );

  const isAwaiting = (repo: string, checkNames: string[]) =>
    awaitingOn(repo, checkNames).some((c) => c.required);

  const toggleIgnore = (repo: string, name: string) =>
    setIgnored((cfg) =>
      isIgnoredCheck(repo, name, cfg)
        ? unignoreCheck(repo, name, cfg)
        : ignoreCheck(repo, name, cfg),
    );

  // A PR the stuck list holds only because a check the user threw out went red
  // belongs with the mergeable ones — that is what calling a check broken is
  // for. Drafts are never promoted: the ready list has none by construction,
  // and a draft cannot be merged however green it is.
  // A PR can arrive in both payloads — the stuck query keeps the BLOCKED ones
  // the ready query also claims — so a promotion has to check it is not
  // repeating what the ready list already says, or the row is drawn twice.
  const readyIds = new Set(readyPrs.map((pr) => pr.id));
  const promotedReady = stuckPrs
    .filter(
      (pr) =>
        !pr.isDraft &&
        !readyIds.has(pr.id) &&
        // Ignoring answers for the checks GitHub reported. It says nothing
        // about one the user is still waiting for, and a PR cannot be ready
        // while a required tracked check has not reported — the same rule the
        // ready list already applies to the PRs it is handed.
        !isAwaiting(pr.repo, pr.checkNames) &&
        readyDespiteIgnored(pr, ignored),
    )
    .map(readyFromStuck);
  const sortedReady = sortByAgeAsc(
    [...readyPrs, ...promotedReady],
    (pr) => pr.readySince,
  );

  // Client-side arbitration for BLOCKED+SUCCESS+APPROVED PRs: each such PR lands
  // in exactly one list based on whether its tracked checks are present in the rollup.
  // If awaiting checks are absent → stuck (with awaiting chips); if all present → ready.

  // A check GitHub did report. It keeps its own colours unless the user has
  // said something about it: a check they marked as unable to block the merge,
  // and one they threw out entirely, are both drawn muted and dashed — a red
  // job that holds nothing up should not read like one that does. A name they
  // never mentioned keeps its colours, because the muted style means "not
  // blocking" and claiming that of an unknown check invents knowledge PRison
  // does not have.
  const checkChip = (
    repo: string,
    name: string,
    tone: "danger" | "warning",
    key: string,
  ) => {
    const thrownOut = isIgnoredCheck(repo, name, ignored);
    const notRequired = checkRequirement(repo, name, tracked) === "optional";
    return (
      <CheckChip
        key={key}
        name={name}
        tone={thrownOut || notRequired ? "muted" : tone}
        ignored={thrownOut}
        description={
          !thrownOut && notRequired ? `${name} — not required` : undefined
        }
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
  const awaitingIds = new Set(awaitingPrs.map((pr) => pr.id));
  // Held only by a review: nothing red or running that the user still counts,
  // no conflict, no open conversation, no tracked check outstanding. Such a PR
  // waits on a person, and "Waiting on others" says who; with any other
  // blocker it is the author's move, and it stays stuck.
  const heldOnlyByReview = (pr: StuckPr) =>
    awaitingIds.has(pr.id) &&
    !pr.isDraft &&
    pr.failing.every((name) => isIgnoredCheck(pr.repo, name, ignored)) &&
    pr.pending.every((name) => isIgnoredCheck(pr.repo, name, ignored)) &&
    pr.mergeState !== "DIRTY" &&
    pr.unresolvedThreads === 0 &&
    !isAwaiting(pr.repo, pr.checkNames);
  const visibleStuck = sortedStuckAll.filter(
    (pr) =>
      !(pr.readyViaBlocked && !isAwaiting(pr.repo, pr.checkNames)) &&
      !promotedIds.has(pr.id) &&
      !heldOnlyByReview(pr),
  );
  const visibleReviews = sortedReviews.filter((req) =>
    matchesDraft(req.isDraft),
  );
  // Drafts are already excluded server-side (parseReadyPrs drops drafts), so
  // "No drafts" is a no-op here and "Only drafts" can only ever come up empty —
  // correctly, since a draft cannot be merged. The empty message says so rather
  // than leaving a permanently blank section looking broken.
  // A BLOCKED+approved+green PR with awaiting tracked checks belongs in stuck, not here.
  const visibleReady = sortedReady.filter(
    (pr) => !(pr.viaBlocked && isAwaiting(pr.repo, pr.checkNames)),
  );
  // Not the viewer's move, so never counted in "N things want you" and never a
  // Next move. A PR another list already holds is said there: ready to merge
  // is a move the author can make now, and stuck names a blocker of its own.
  const ownListIds = new Set([
    ...visibleStuck.map((pr) => pr.id),
    ...visibleReady.map((pr) => pr.id),
  ]);
  const visibleAwaiting = sortByAgeAsc(
    awaitingPrs.filter((pr) => !ownListIds.has(pr.id) && matchesDraft(pr.isDraft)),
    (pr) => pr.waitingSince,
  );

  // A PR the viewer is being asked to review AGAIN is not history — it is back
  // in the work queue, and GitHub reports it under both searches. Waiting-on-you
  // wins, so no PR sits in two lists.
  const reviewRequestIds = new Set(sortedReviews.map((req) => req.id));
  const sortedReviewedAll = sortByAgeDesc(
    reviewedPrs.filter((pr) => !reviewRequestIds.has(pr.id)),
    (pr) => pr.reviewedAt,
  );
  const sortedReviewed = sortedReviewedAll.filter((pr) =>
    matchesDraft(pr.isDraft),
  );

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
        !(hideReacted && c.viewerReacted) &&
        !(hideSeen && isSeen(c, seen)),
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

  // What "it changed" means for each queue: a stuck PR's last push and its
  // blockers, a review's (re-)request, a thread's last comment, a ready PR's
  // last push. Any of these moving wakes a snooze early.
  const stuckMark = (pr: StuckPr) =>
    [pr.stuckSince, pr.mergeState, pr.reviewDecision, ...pr.failing, ...pr.pending].join("|");
  const marks = new Map<string, string>([
    ...visibleStuck.map((pr): [string, string] => [pr.id, stuckMark(pr)]),
    ...visibleReviews.map((r): [string, string] => [r.id, r.requestedAt]),
    ...visibleComments.map((c): [string, string] => [c.id, c.commentedAt]),
    ...visibleReady.map((pr): [string, string] => [pr.id, pr.readySince]),
  ]);
  const snoozeNow = new Date();
  const asleep = (id: string) => isSnoozed(snoozes[id], marks.get(id) ?? "", snoozeNow);
  // Forget what has woken or left the board, once a load has landed: before
  // that every list is empty and would wipe the lot.
  if (lastRefreshedAt) {
    const pruned = pruneSnoozes(snoozes, marks, snoozeNow);
    if (Object.keys(pruned).length !== Object.keys(snoozes).length) setSnoozes(pruned);
  }
  const snooze = (id: string, choice: SnoozeChoice) =>
    setSnoozes((prev) => ({ ...prev, [id]: snoozeFor(choice, marks.get(id) ?? "", new Date()) }));
  const wake = (id: string) =>
    setSnoozes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  const foldOf = <T extends { id: string; repo: string; number: number }>(items: T[], title: (t: T) => string) =>
    items
      .filter((t) => asleep(t.id))
      .map((t) => ({ id: t.id, title: title(t), repo: t.repo, number: t.number, snooze: snoozes[t.id] }));
  const shownReady = visibleReady.filter((pr) =>
    !asleep(pr.id) && matches(terms, pr.title, pr.repo, pr.number, pr.checkNames),
  );
  const shownReviews = visibleReviews.filter((req) =>
    !asleep(req.id) && matches(terms, req.title, req.repo, req.number, req.author),
  );
  const shownStuck = visibleStuck.filter((pr) =>
    !asleep(pr.id) &&
    // Check names are the useful half here: "which of mine is integration-tests
    // red on" is a question the board can answer and could not be asked.
    matches(terms, pr.title, pr.repo, pr.number, pr.checkNames),
  );
  const shownComments = visibleComments.filter((c) =>
    !asleep(c.id) &&
    matches(terms, c.preview, c.repo, c.number, c.author, c.path),
  );
  const shownReviewed = sortedReviewed.filter((pr) =>
    matches(terms, pr.title, pr.repo, pr.number, pr.author),
  );
  const shownClosed = sortedClosed.filter((pr) =>
    matches(terms, pr.title, pr.repo, pr.number),
  );
  const shownAwaiting = visibleAwaiting.filter((pr) =>
    matches(terms, pr.title, pr.repo, pr.number, pr.reviewers.map((r) => r.name)),
  );

  // A section emptied by the query must not read like a section that is
  // legitimately empty: "no PRs waiting on your review" is good news, "none of
  // them match" is not.
  const emptyText = (base: string) =>
    terms.length > 0 ? `Nothing here matches “${query.trim()}”` : base;

  // Everything on the four queues, oldest wait first: the Next move strip
  // points at the head of this, Skip steps along it. Built from the shown
  // lists, so a search or the draft filter moves it too.
  const owed =
    shownStuck.length + shownReviews.length + shownComments.length + shownReady.length;
  const allMoves: NextMoveItem[] = sortByAgeAsc(
    [
      ...shownStuck.map((pr): NextMoveItem => ({
        id: pr.id, title: pr.title, repo: pr.repo, number: pr.number, url: pr.url,
        since: pr.stuckSince, suggestion: suggestStuck(pr), tone: "danger",
        minutes: stuckMinutes(pr),
        reasons: [
          ...(pr.mergeState === "DIRTY" ? [{ label: MERGE_CONFLICT_LABEL }] : []),
          ...pr.failing.map((name) => ({ label: name, mono: true })),
          ...(pr.reviewDecision === "CHANGES_REQUESTED" ? [{ label: "Changes requested" }] : []),
        ],
      })),
      ...shownReviews.map((req): NextMoveItem => {
        const minutes = reviewMinutes(req);
        return {
          id: req.id, title: req.title, repo: req.repo, number: req.number, url: req.url,
          since: req.requestedAt, suggestion: suggestReview(req), tone: "accent",
          reasons: [{ label: `blocking @${req.author}`, mono: true }],
          // An unmeasured review is treated as a long one: fitting it into five
          // minutes on a guess would be the wrong kind of optimism.
          minutes: minutes ?? 60,
          size: minutes === null ? undefined : { label: sizeText(req, minutes), tone: sizeTone(minutes) },
        };
      }),
      ...shownComments.map((c): NextMoveItem => ({
        id: c.id, title: c.preview, repo: c.repo, number: c.number, url: c.url,
        since: c.commentedAt, suggestion: suggestComment(c), tone: "warning",
        minutes: REPLY_MINUTES,
        reasons: [{ label: c.author, mono: true }, ...(c.path ? [{ label: c.path, mono: true }] : [])],
      })),
      ...shownReady.map((pr): NextMoveItem => ({
        id: pr.id, title: pr.title, repo: pr.repo, number: pr.number, url: pr.url,
        since: pr.readySince, suggestion: suggestReady(pr), tone: "success",
        minutes: MERGE_MINUTES,
      })),
    ],
    (item) => item.since,
  );
  const fitting = timeBudget === null ? allMoves : allMoves.filter((m) => m.minutes <= timeBudget);
  const fits = fitting.length > 0;
  const nextMoves = fits ? fitting : allMoves;
  // Only skips that still point at something count: a PR that was skipped,
  // then resolved, must not come back already skipped, and a gone id must not
  // throw off when the round wraps.
  const liveSkipped = skipped.filter((id) => nextMoves.some((m) => m.id === id));
  // Forget the gone ones for good (React's "adjust state while rendering"
  // pattern), so the same id reappearing after a refresh starts unskipped.
  if (liveSkipped.length !== skipped.length) setSkipped(liveSkipped);
  const nextMove = nextMoves.find((m) => !liveSkipped.includes(m.id)) ?? nextMoves[0];
  const limitNow = new Date();
  const lateCount = [
    ...shownStuck.map((pr) => limitState(pr.stuckSince, limits.stuck, limitNow)),
    ...shownReviews.map((r) => limitState(r.requestedAt, limits.review, limitNow)),
    ...shownComments.map((c) => limitState(c.commentedAt, limits.reply, limitNow)),
    ...shownAwaiting.map((pr) => limitState(pr.waitingSince, limits.others, limitNow)),
  ].filter((l) => l?.state === "late").length;
  // "· limit 1 day" on a column's caption, once a limit is set for it.
  const withLimit = (text: string, hours: number | undefined) =>
    hours ? `${text} · limit ${limitLabel(hours)}` : text;
  const updatedSinceCount = shownReviewed.filter((pr) => pr.updatedSince).length;
  const mergedCount = shownClosed.filter((pr) => pr.merged).length;

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
    // Never a desktop notification, whether or not the tab is focused: what
    // the catch-up reports is by definition old, and a browser reloads a tab
    // on its own — a discarded one Chrome restores in the background is not
    // the user opening PRison. A banner is a claim that something just
    // happened; the feed and the bell say what changed without dating it.
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
        if (!catchUp && !document.hasFocus()) showChangeNotification(events);
      }
    }
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        orgs={orgs}
        selectedOrg={selectedOrg}
        onOrgChange={handleOrgChange}
        selectedRepo={selectedRepo}
        onRepoChange={setSelectedRepo}
        repoOwners={repoOwners}
        login={login}
        onOpenSettings={handleOpenSettings}
        activity={activity}
        onOpenActivity={handleOpenActivity}
        onClearActivity={handleClearActivity}
        checkUpdates={updateChecks}
      />
      {/* A spent budget is the cause of every list failing, and its own notice
          says so. Six "failed to load — Retry" banners under it would each
          offer the one action that cannot work. */}
      {budgetSpent === undefined &&
        budget !== null &&
        budget.remaining <= budget.cost * 2 && (
          <div className="mx-auto w-full max-w-[1424px] px-4 sm:px-6 lg:px-8 pt-4">
            <div
              role="status"
              className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
            >
              ⚠ GitHub&apos;s hourly API budget is nearly spent —{" "}
              {budget.remaining.toLocaleString()} points left, and a refresh
              costs about {budget.cost} points. It comes back at{" "}
              {budgetTime(budget.resetAt)}; refreshing less often, in Settings →
              Auto refresh, is what keeps it from running out.
            </div>
          </div>
        )}
      {budgetSpent !== undefined && (
        <div className="mx-auto w-full max-w-[1424px] px-4 sm:px-6 lg:px-8 pt-4">
          <div
            role="status"
            className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
          >
            ⏳ GitHub&apos;s API budget for this account is spent
            {budgetSpent
              ? ` — PRison can ask again at ${budgetTime(budgetSpent)}`
              : ""}
            . Retrying before then fails the same way. Refreshing less often, in
            Settings → Auto refresh, is what keeps it from running out.
          </div>
        </div>
      )}
      {partial && (
        <div className="mx-auto w-full max-w-[1424px] px-4 sm:px-6 lg:px-8 pt-4">
          <div
            role="status"
            className="flex items-center justify-between rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
          >
            <span>⚠ Some data couldn&apos;t be loaded — Retry</span>
            <button
              type="button"
              onClick={() => fetchData(selectedOrg, selectedRepo)}
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
        hideSeen={hideSeen}
        onHideSeenChange={setHideSeen}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={handleAutoRefreshChange}
        pollInterval={pollInterval}
        onPollIntervalChange={setPollInterval}
        notifPermission={notifPermission}
        budget={budget}
        onEnableNotifications={handleEnableNotifications}
        onTestNotification={handleTestNotification}
        ignored={ignored}
        onIgnoredChange={setIgnored}
        updateChecks={updateChecks}
        onUpdateChecksChange={setUpdateChecks}
        limits={limits}
        onLimitsChange={setLimits}
      />
      <main className="mx-auto flex w-full max-w-[1424px] flex-1 flex-col gap-7 px-4 py-8 sm:px-6 lg:px-8">
        {isPending && (
          <p
            className="flex items-center gap-2 text-sm text-muted"
            aria-live="polite"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Loading&hellip;
          </p>
        )}
        {nextMove && (
          <NextMove
            item={nextMove}
            now={new Date()}
            position={nextMoves.indexOf(nextMove) + 1}
            total={nextMoves.length}
            canSkip={nextMoves.length > 1}
            budget={timeBudget}
            onBudget={(b) => {
              setTimeBudget(b);
              // A new budget is a new round: old skips belonged to the old one.
              setSkipped([]);
            }}
            fits={fits}
            onSkip={() =>
              // Skipping the last one starts the round again rather than
              // leaving the strip with nothing to point at. Built from the live
              // skips, so stale ids are dropped on every Skip.
              setSkipped(
                liveSkipped.length + 1 >= nextMoves.length ? [] : [...liveSkipped, nextMove.id],
              )
            }
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          {/* Not before the first load lands: "Nothing wants you" over a board
              that simply hasn't arrived yet is the one wrong thing to say. */}
          {(owed > 0 || lastRefreshedAt) && (
            <h1 className="mr-3 text-[22px] font-bold leading-tight tracking-[-0.02em] text-foreground">
              {owed === 0
                ? "Nothing wants you"
                : `${owed} ${owed === 1 ? "thing wants" : "things want"} you`}
            </h1>
          )}
          {lateCount > 0 && (
            <span className="-ml-3 mr-3 rounded-md bg-danger px-2 py-1 text-[13px] font-semibold leading-none text-background">
              {lateCount} late
            </span>
          )}
          <div role="group" aria-label="Group by" className="flex rounded-full border border-border bg-surface p-1">
            {GROUP_BYS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={groupBy === value}
                onClick={() => setGroupBy(value)}
                className={`min-h-[36px] cursor-pointer rounded-full px-4 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                  groupBy === value
                    ? "bg-foreground font-semibold text-background"
                    : "font-medium text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Drafts get filtered constantly — often enough that burying this in
              Settings cost two clicks every time. It lives here, in the same
              visual language as the group-by buttons, and as three buttons
              rather than a cycling one so every state is a single click and a
              screen reader can read the whole set at once. */}
          <div role="group" aria-label="Drafts" className="flex rounded-full border border-border bg-surface p-1">
            {DRAFT_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={draftFilter === value}
                onClick={() => setDraftFilter(value)}
                className={`min-h-[36px] cursor-pointer rounded-full px-4 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                  draftFilter === value
                    ? "bg-foreground font-semibold text-background"
                    : "font-medium text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* type="search" for the browser's own clear affordance rather than a
              hand-built one; Escape is the keyboard half of the same thing. A
              filter you cannot see the end of is one you forget is on. */}
          <label className="flex h-10 w-full min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-muted focus-within:ring-2 focus-within:ring-accent sm:min-w-48 sm:max-w-[280px]">
            <svg aria-hidden="true" className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              aria-label="Search the board"
              aria-keyshortcuts="/"
              placeholder="Search title, repo, author, check…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
            />
            <kbd aria-hidden="true" className="shrink-0 rounded-md border border-border px-1.5 py-px font-mono text-xs leading-[normal] text-muted">
              /
            </kbd>
          </label>
          {/* Deliberately not a live region: the label re-renders every minute
              as it ages, and announcing "Updated 4m ago" on a loop would talk
              over everything else for as long as the tab is open. */}
          {lastRefreshedAt && (
            <p
              className="ml-auto text-[13px] text-muted"
              title={new Date(lastRefreshedAt).toLocaleString()}
            >
              {lastRefreshedLabel}
            </p>
          )}
          <button
            type="button"
            onClick={() => fetchData(selectedOrg, selectedRepo)}
            disabled={isPending}
            className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:brightness-[var(--hover-brightness)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${lastRefreshedAt ? "" : "ml-auto"}`}
          >
            <svg
              aria-hidden="true"
              className={`shrink-0 ${isPending ? "animate-spin" : ""}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Refresh
          </button>
        </div>
        {/* Two groups, left to right. First your own PRs by stage: held back
            (stuck), waiting on a reviewer, ready to merge. Then the queues where
            someone waits on you: a review, a reply. At three columns the first
            row is your PRs and the second is everyone else's.

            Columns, not rows: a row is as tall as its tallest cell, and each
            queue grows on its own. Grouping by repo or check happens inside each
            column, so the queue a PR belongs to never changes with the view. */}
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <div className="flex flex-col gap-3">
            {budgetSpent === undefined && stuckError && (
              <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                <span>{stuckError}</span>
                <button
                  onClick={() => fetchData(selectedOrg, selectedRepo)}
                  className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
                >
                  Retry
                </button>
              </div>
            )}
            <PrList
              title="Stuck on checks"
              id="stuck-on-checks"
              items={shownStuck}
              emptyMessage={emptyText("No PRs stuck on checks 🎉")}
              keyExtractor={(pr) => pr.id}
              tone="danger"
              caption={withLimit(caption(shownStuck.length, "PRs", shownStuck[0]?.stuckSince), limits.stuck)}
              description="Your PRs that CI or reviewers are holding back."
              footer={<SnoozedFold items={foldOf(visibleStuck, (pr) => pr.title)} onWake={wake} />}
              highlighted={nextMove?.tone === "danger"}
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
                const hasNames =
                  pr.failing.length > 0 || pr.pending.length > 0;
                const totalNames = pr.failing.length + pr.pending.length;
                // Only truncate when there are more than 4 names total; otherwise
                // show every name. The "+N more" count is derived from what is
                // actually rendered so lopsided check lists never hide a chip
                // without an indicator.
                const truncate = totalNames > 4;
                const showFailingNames = truncate
                  ? pr.failing.slice(0, 2)
                  : pr.failing;
                const showPendingNames = truncate
                  ? pr.pending.slice(0, 2)
                  : pr.pending;
                const overflow =
                  totalNames -
                  (showFailingNames.length + showPendingNames.length);
                const awaiting = awaitingOn(pr.repo, pr.checkNames);
                const hasAwaiting = awaiting.length > 0;
                // A green PR can still be BLOCKED waiting on a code-owner review;
                // surface that instead of mislabeling it as pending CI. Colour it
                // with the repo's status vocabulary: CHANGES_REQUESTED is a negative
                // signal (danger/red), REVIEW_REQUIRED is merely waiting (warning/amber).
                const reviewNeeded = needsReview(pr.reviewDecision);
                const changesRequested =
                  pr.reviewDecision === "CHANGES_REQUESTED";
                const reviewChip = reviewNeeded ? (
                  <span
                    key="review"
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                      changesRequested
                        ? "bg-danger/10 text-danger"
                        : "bg-warning/10 text-warning"
                    }`}
                  >
                    {reviewDecisionLabel(pr.reviewDecision)}
                  </span>
                ) : null;
                const noteSpan = (text: string) => (
                  <span className="text-sm text-muted">{text}</span>
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
                    className="inline-flex items-center gap-1 rounded-md bg-danger/[0.12] px-2 py-0.5 text-xs font-medium text-danger"
                  >
                    {MERGE_CONFLICT_LABEL}
                  </span>
                ) : null;
                let detail: React.ReactNode;
                if (conflicted || hasNames || hasAwaiting || reviewNeeded) {
                  detail = (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {conflictChip}
                      {showFailingNames.map((name, i) =>
                        checkChip(
                          pr.repo,
                          name,
                          "danger",
                          `fail-${i}-${name}`,
                        ),
                      )}
                      {showPendingNames.map((name, i) =>
                        checkChip(
                          pr.repo,
                          name,
                          "warning",
                          `pend-${i}-${name}`,
                        ),
                      )}
                      {overflow > 0 && (
                        <span className="text-xs text-muted">
                          +{overflow} more
                        </span>
                      )}
                      {hasAwaiting &&
                        awaiting.map(({ name, required }) => (
                          <CheckChip
                            key={`await-${name}`}
                            name={name}
                            tone={required ? "warning" : "muted"}
                            ignored={false}
                            description={
                              required
                                ? `Awaiting required check: ${name}`
                                : `Awaiting: ${name}`
                            }
                            onToggleIgnore={() => toggleIgnore(pr.repo, name)}
                          />
                        ))}
                      {reviewChip}
                    </div>
                  );
                } else if (pr.blocked && pr.unresolvedThreads > 0) {
                  // Named rather than guessed at: a repo with "require
                  // conversation resolution" reports this as BLOCKED with
                  // every check green, which is indistinguishable from a
                  // hidden required check unless the threads are counted.
                  detail = noteSpan(
                    `${unresolvedLabel(pr.unresolvedThreads)} — GitHub won't merge until they're resolved.`,
                  );
                } else if (pr.blocked) {
                  detail = noteSpan(
                    "Some required checks run on GitHub and aren't shown here.",
                  );
                } else {
                  // Nothing to say about a PR with no checks at all (a fresh draft):
                  // "0 failing · 0 pending" is a line of noise.
                  detail = pr.failingChecks || pr.pendingChecks
                    ? `${pr.failingChecks} failing · ${pr.pendingChecks} pending`
                    : undefined;
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
                    kind={
                      conflicted || pr.failing.length > 0 || changesRequested
                        ? "fail"
                        : pr.pending.length > 0 || hasAwaiting || reviewNeeded
                          ? "pending"
                          : "idle"
                    }
                    marked={nextMove?.id === pr.id}
                    detail={detail}
                    suggestion={suggestStuck(pr)}
                    aside={<SnoozeMenu title={pr.title} onSnooze={(c) => snooze(pr.id, c)} />}
                    limit={limitState(pr.stuckSince, limits.stuck, limitNow)}
                  />
                );
              }}
            />
          </div>
          <div className="flex flex-col gap-3">
            {budgetSpent === undefined && awaitingError && (
              <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                <span>{awaitingError}</span>
                <button
                  onClick={() => fetchData(selectedOrg, selectedRepo)}
                  className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
                >
                  Retry
                </button>
              </div>
            )}
            <PrList
              title="Waiting on others"
              id="waiting-on-others"
              items={shownAwaiting}
              emptyMessage={emptyText("None of your PRs is waiting on a reviewer")}
              keyExtractor={(pr) => pr.id}
              tone="accent"
              caption={withLimit(caption(shownAwaiting.length, "PRs", shownAwaiting[0]?.waitingSince), limits.others)}
              description="Your PRs that wait on someone else's review. The ball is in their court."
              groupBy={groupBy === "repo" ? (pr) => pr.repo : undefined}
              groupHref={
                groupBy === "repo"
                  ? (repo) => `https://github.com/${repo}`
                  : undefined
              }
              renderRow={(pr) => (
                <PrRow
                  title={pr.title}
                  repo={pr.repo}
                  number={pr.number}
                  url={pr.url}
                  since={pr.waitingSince}
                  now={new Date()}
                  draft={pr.isDraft}
                  kind="others"
                  suggestion={{ text: "Open on GitHub", href: pr.url }}
                  limit={limitState(pr.waitingSince, limits.others, limitNow)}
                  detail={
                    <AwaitingDetail
                      pr={pr}
                      now={new Date()}
                      copied={copiedId === pr.id}
                      onCopy={() => {
                        // A clipboard the browser refuses (an insecure origin,
                        // a denied permission) leaves the button as it was.
                        void navigator.clipboard
                          ?.writeText(reminderText(pr, new Date()))
                          .then(() => {
                            setCopiedId(pr.id);
                            setTimeout(() => setCopiedId((id) => (id === pr.id ? null : id)), 2000);
                          })
                          .catch(() => {});
                      }}
                    />
                  }
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-3">
            {budgetSpent === undefined && readyError && (
              <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                <span>{readyError}</span>
                <button
                  onClick={() => fetchData(selectedOrg, selectedRepo)}
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
              tone="success"
              caption={caption(shownReady.length, "PRs", shownReady[0]?.readySince)}
              description="Approved, green, mergeable. One click each."
              footer={<SnoozedFold items={foldOf(visibleReady, (pr) => pr.title)} onWake={wake} />}
              highlighted={nextMove?.tone === "success"}
              renderRow={(pr) => (
                <PrRow
                  title={pr.title}
                  repo={pr.repo}
                  number={pr.number}
                  url={pr.url}
                  since={pr.readySince}
                  now={new Date()}
                  suggestion={suggestReady(pr)}
                  kind="ready"
                  marked={nextMove?.id === pr.id}
                  aside={<SnoozeMenu title={pr.title} onSnooze={(c) => snooze(pr.id, c)} />}
                  // A PR promoted here over a red check still says so — muted,
                  // because the user already answered for it, but said: a card
                  // with nothing on it would read as spotlessly green.
                  detail={
                    pr.needsUpdate || pr.ignoredChecks?.length ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {pr.needsUpdate && (
                          <span className="rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium leading-[normal] text-warning">
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
          <div className="flex flex-col gap-3">
            {budgetSpent === undefined && reviewError && (
              <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                <span>{reviewError}</span>
                <button
                  onClick={() => fetchData(selectedOrg, selectedRepo)}
                  className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
                >
                  Retry
                </button>
              </div>
            )}
            <PrList
              title="Waiting on your review"
              id="waiting-on-your-review"
              items={shownReviews}
              emptyMessage={emptyText("No PRs waiting on your review 🎉")}
              keyExtractor={(req) => req.id}
              tone="accent"
              caption={withLimit(caption(shownReviews.length, "PRs", shownReviews[0]?.requestedAt), limits.review)}
              description="Teammates blocked until you review."
              footer={<SnoozedFold items={foldOf(visibleReviews, (r) => r.title)} onWake={wake} />}
              highlighted={nextMove?.tone === "accent"}
              groupBy={groupBy === "repo" ? (req) => req.repo : undefined}
              groupHref={
                groupBy === "repo"
                  ? (repo) => `https://github.com/${repo}`
                  : undefined
              }
              renderRow={(req) => (
                <PrRow
                  title={req.title}
                  repo={req.repo}
                  number={req.number}
                  url={req.url}
                  since={req.requestedAt}
                  now={new Date()}
                  draft={req.isDraft}
                  kind="review"
                  byline={`@${req.author}`}
                  marked={nextMove?.id === req.id}
                  suggestion={suggestReview(req)}
                  aside={<SnoozeMenu title={req.title} onSnooze={(c) => snooze(req.id, c)} />}
                  limit={limitState(req.requestedAt, limits.review, limitNow)}
                  detail={(() => {
                    const minutes = reviewMinutes(req);
                    return minutes === null ? undefined : (
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold leading-[normal] ${SIZE[sizeTone(minutes)]}`}>
                        {sizeText(req, minutes)}
                      </span>
                    );
                  })()}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-3">
            {budgetSpent === undefined && commentsError && (
              <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                <span>{commentsError}</span>
                <button
                  onClick={() => fetchData(selectedOrg, selectedRepo)}
                  className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
                >
                  Retry
                </button>
              </div>
            )}
            <PrList
              title="Awaiting your reply"
              id="comments-awaiting-reply"
              items={shownComments}
              emptyMessage={emptyText("No comments awaiting your reply 🎉")}
              keyExtractor={(c) => c.id}
              tone="warning"
              caption={withLimit(caption(shownComments.length, "threads", shownComments[0]?.commentedAt), limits.reply)}
              description="Someone asked you something. Answer or mark seen."
              footer={<SnoozedFold items={foldOf(visibleComments, (c) => c.preview)} onWake={wake} />}
              highlighted={nextMove?.tone === "warning"}
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
                  kind="reply"
                  byline={c.author}
                  aside={
                <span className="flex gap-1.5">
                <SnoozeMenu title={c.preview} onSnooze={(choice) => snooze(c.id, choice)} />
                <button
                  type="button"
                  onClick={() =>
                    setSeen((prev) => {
                      const next = { ...prev };
                      if (isSeen(c, prev)) delete next[c.id];
                      else next[c.id] = c.commentedAt;
                      return next;
                    })
                  }
                  aria-label={isSeen(c, seen) ? "Unmark as seen" : "Mark as seen"}
                  title={isSeen(c, seen) ? "Seen — click to bring it back" : "Mark as seen — hides it until a new reply"}
                  className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isSeen(c, seen)
                      ? "border-success/40 bg-success/15 text-success hover:bg-success/25"
                      : "border-border bg-transparent text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {isSeen(c, seen) ? (
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="m8 12.5 2.5 2.5L16 9.5" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
                </span>
                  }
                  marked={nextMove?.id === c.id}
                  limit={limitState(c.commentedAt, limits.reply, limitNow)}
                  clampTitle
                  detail={
                    <span className="flex flex-wrap items-center gap-1.5">
                      {/* A review body has no file, so without this it would read
                          as an inline thread whose path failed to load — and the
                          two are answered in different places. */}
                      {c.source === "review" && (
                        <span className="rounded-md bg-border px-1.5 py-0.5 text-xs font-medium text-muted">
                          Review comment
                        </span>
                      )}
                      {c.source === "conversation" && (
                        <span className="rounded-md bg-border px-1.5 py-0.5 text-xs font-medium text-muted">
                          Conversation
                        </span>
                      )}
                      {c.path && (
                        <span className="min-w-0 truncate font-mono text-xs text-muted">
                          {c.path}
                        </span>
                      )}

                    </span>
                  }
                />
              )}
            />
          </div>
        </div>
        {/* History: looking back, not work to do. Your review verdicts beside
            your finished PRs, quieter than the columns above on purpose. */}
        <section aria-labelledby="history-heading" className="flex flex-col gap-4 pt-3">
          <div className="flex items-center gap-3">
            <h2 id="history-heading" className="text-xs font-semibold tracking-[0.1em] text-muted">
              HISTORY
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            <span className="text-[13px] text-muted">Looking back, not work to do</span>
          </div>
          <WeekCard facts={week} now={new Date()} error={weekError} />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <ArchiveSection
              title="Recently reviewed"
              id="recently-reviewed"
              count={shownReviewed.length}
              countTestId="reviewed-count-badge"
              open={reviewedOpen}
              onToggle={() => setReviewedOpen((o) => !o)}
              error={budgetSpent === undefined ? reviewedError : null}
              onRetry={() => fetchData(selectedOrg, selectedRepo)}
              summary={
                updatedSinceCount > 0 && (
                  <span className="font-semibold text-accent">
                    {updatedSinceCount} updated since
                  </span>
                )
              }
            >
              {shownReviewed.length === 0 ? (
                <p className="my-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                  {emptyText("No PRs you have reviewed are still open")}
                </p>
              ) : (
                <>
                  <ul className="flex flex-col divide-y divide-border">
                    {shownReviewed.slice(0, reviewedVisible).map((pr) => (
                      <li key={pr.id}>
                        <ReviewedPrRow pr={pr} now={new Date()} />
                      </li>
                    ))}
                  </ul>
                  {shownReviewed.length > reviewedVisible && (
                    <button
                      type="button"
                      onClick={() =>
                        setReviewedVisible((v) => v + ARCHIVE_PAGE_SIZE)
                      }
                      className="mb-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:brightness-[var(--hover-brightness)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      Load more (showing {reviewedVisible} of{" "}
                      {shownReviewed.length})
                    </button>
                  )}
                </>
              )}
            </ArchiveSection>
            <ArchiveSection
              title="Recently merged / closed"
              id="recently-closed"
              count={shownClosed.length}
              countTestId="closed-count-badge"
              open={closedOpen}
              onToggle={() => setClosedOpen((o) => !o)}
              error={budgetSpent === undefined ? closedError : null}
              onRetry={() => fetchData(selectedOrg, selectedRepo)}
              summary={
                shownClosed.length > 0 &&
                `${mergedCount} merged · ${shownClosed.length - mergedCount} closed`
              }
            >
              {shownClosed.length === 0 ? (
                <p className="my-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                  {emptyText("No closed PRs")}
                </p>
              ) : (
                <>
                  <ol className="flex flex-col pb-1 pt-3">
                    {shownClosed.slice(0, closedVisible).map((pr, i, shown) => (
                      <li key={pr.id}>
                        <ClosedPrRow pr={pr} now={new Date()} last={i === shown.length - 1} />
                      </li>
                    ))}
                  </ol>
                  {shownClosed.length > closedVisible && (
                    <button
                      type="button"
                      onClick={() =>
                        setClosedVisible((v) => v + ARCHIVE_PAGE_SIZE)
                      }
                      className="mb-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:brightness-[var(--hover-brightness)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      Load more (showing {closedVisible} of {shownClosed.length}
                      )
                    </button>
                  )}
                </>
              )}
            </ArchiveSection>
          </div>
        </section>
      </main>
    </div>
  );
}
