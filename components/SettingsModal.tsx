"use client";

import {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { normalizeAll } from "@/lib/tracked-checks";
import type { TrackedChecks, TrackedCheck, StoredCheck } from "@/lib/tracked-checks";
import { RepoCombobox } from "./RepoCombobox";
import { POLL_INTERVAL_OPTIONS } from "@/lib/notify";
import {
  PROJECT_URL,
  PROJECT_LABEL,
  appVersion,
  isNewerVersion,
  releaseUrl,
} from "@/lib/project";
import {
  THEMES,
  applyTheme,
  getMode,
  getServerMode,
  getServerTheme,
  getTheme,
  modeLabel,
  subscribeToTheme,
} from "@/lib/theme";

export interface SettingsModalProps {
  availableRepos: string[];
  /** Owner logins — the personal account and every org. Scopes the repo
   * search, and is the list the owner defaults are offered for. */
  owners?: string[];
  value: TrackedChecks;
  onChange: (next: TrackedChecks) => void;
  open: boolean;
  onClose: () => void;
  showBots: boolean;
  onShowBotsChange: (v: boolean) => void;
  hideReacted: boolean;
  onHideReactedChange: (v: boolean) => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (v: boolean) => void;
  pollInterval: number;
  onPollIntervalChange: (ms: number) => void;
  /** Owned by the Dashboard: the browser never re-renders us when the user
   * answers its prompt, so the answer has to arrive as a prop. */
  notifPermission: NotificationPermission;
  onEnableNotifications: () => void;
  onTestNotification: () => void;
}

// Comments stays first: it is the section the modal opens on, and the one most
// often wanted. Appearance sits with About at the end, where the settings stop
// being about what the dashboard shows and start being about how it looks.
const SECTIONS = [
  { id: "comments", label: "Comments" },
  { id: "auto-refresh", label: "Auto refresh" },
  { id: "tracked-checks", label: "Tracked checks" },
  { id: "appearance", label: "Appearance" },
  { id: "about", label: "About" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// A tracked check is a name plus whether it blocks the merge, so adding one
// asks both questions at once: type the name, answer the box, press Add. The
// list below is the same two controls per row, which is what makes an existing
// check editable rather than something you have to delete and retype.
type OverrideRow = { id: number; repo: string };

// Row identity only has to be unique within one open modal.
let rowIdCounter = 0;
function nextRowId() {
  return ++rowIdCounter;
}

function CheckList({
  scope,
  checks,
  onChange,
}: {
  scope: string;
  checks: StoredCheck[] | undefined;
  onChange: (next: TrackedCheck[]) => void;
}) {
  // The rows are held locally so a name can pass through empty on its way to a
  // new one; only named checks are pushed up. The modal unmounts when it
  // closes, so this is re-seeded from props every time it opens.
  const [items, setItems] = useState<TrackedCheck[]>(() => normalizeAll(checks));
  const [draft, setDraft] = useState("");
  const [draftRequired, setDraftRequired] = useState(true);

  function commit(next: TrackedCheck[]) {
    setItems(next);
    // Names are trimmed on the way out, not while typing — a name with a space
    // in it has to survive being typed. Storage keeps one entry per name, so a
    // rename passing through a name that already exists can't leave two.
    const seen = new Set<string>();
    onChange(
      next
        .map((c) => ({ ...c, name: c.name.trim() }))
        .filter((c) => c.name !== "" && !seen.has(c.name) && seen.add(c.name)),
    );
  }

  function add() {
    const name = draft.trim();
    if (!name || items.some((c) => c.name === name)) return;
    commit([...items, { name, required: draftRequired }]);
    setDraft("");
    setDraftRequired(true);
  }

  const fieldClass =
    "min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent";
  const boxClass = "h-4 w-4 rounded border-border bg-surface accent-accent";

  return (
    <div className="space-y-1.5">
      {items.map((check, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            aria-label={`Check ${i + 1} for ${scope}`}
            value={check.name}
            onChange={(e) =>
              commit(items.map((c, j) => (j === i ? { ...c, name: e.target.value } : c)))
            }
            className={fieldClass}
          />
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted select-none">
            <input
              type="checkbox"
              checked={check.required}
              aria-label={`${check.name} is required for ${scope}`}
              onChange={(e) =>
                commit(
                  items.map((c, j) => (j === i ? { ...c, required: e.target.checked } : c)),
                )
              }
              className={boxClass}
            />
            Required
          </label>
          <button
            type="button"
            aria-label={`Remove ${check.name} from ${scope}`}
            onClick={() => commit(items.filter((_, j) => j !== i))}
            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M11 3L3 11M3 3l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={`New check for ${scope}`}
          placeholder="e.g. qa/smoke"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={fieldClass}
        />
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted select-none">
          <input
            type="checkbox"
            checked={draftRequired}
            aria-label={`New check is required for ${scope}`}
            onChange={(e) => setDraftRequired(e.target.checked)}
            className={boxClass}
          />
          Required
        </label>
        <SettingButton onClick={add} className="shrink-0 py-1.5" ariaLabel={`Add check to ${scope}`}>
          Add
        </SettingButton>
      </div>
    </div>
  );
}

function SettingCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border bg-surface accent-accent"
      />
      {children}
    </label>
  );
}

function SettingButton({
  onClick,
  className = "",
  ariaLabel,
  children,
}: {
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`min-h-[44px] cursor-pointer rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:brightness-[var(--hover-brightness)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${className}`}
    >
      {children}
    </button>
  );
}

/** What the check found, in one sentence. Every branch that names a release
 * links to it, because the next thing anyone wants is the release notes. */
function UpdateResult({ latest, version }: { latest: string | null; version?: string }) {
  if (!latest) return <>No published release yet.</>;
  // releaseUrl builds the tag back from a bare version; tagName arrives with
  // the `v` already on it.
  const link = (text: string) => (
    <a
      href={releaseUrl(latest.replace(/^v/, ""))}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2 hover:brightness-110"
    >
      {text}
    </a>
  );
  // A dev build has no version inlined, so there is nothing to compare against.
  // Naming the latest release still answers most of the question.
  if (!version) return <>Latest release is {link(latest)}.</>;
  if (isNewerVersion(latest, version)) {
    return (
      <>
        {link(`${latest} is available`)} — you&apos;re on v{version}.
      </>
    );
  }
  return <>You&apos;re on the latest version.</>;
}

export function SettingsModal({
  availableRepos,
  owners = [],
  value,
  onChange,
  open,
  onClose,
  showBots,
  onShowBotsChange,
  hideReacted,
  onHideReactedChange,
  autoRefresh,
  onAutoRefreshChange,
  pollInterval,
  onPollIntervalChange,
  notifPermission,
  onEnableNotifications,
  onTestNotification,
}: SettingsModalProps) {
  // Read inside the component, not at module scope, so tests can stub it.
  const version = appVersion();

  // Asked for, never volunteered: a dashboard that phones home on open would
  // spend the user's rate limit to answer a question they didn't ask.
  const [update, setUpdate] = useState<
    | { status: "idle" | "checking" | "error" }
    | { status: "done"; latest: string | null }
  >({ status: "idle" });

  async function checkForUpdates() {
    setUpdate({ status: "checking" });
    try {
      const res = await fetch("/api/latest-release");
      if (!res.ok) throw new Error(String(res.status));
      const { tagName } = await res.json();
      setUpdate({ status: "done", latest: typeof tagName === "string" ? tagName : null });
    } catch {
      setUpdate({ status: "error" });
    }
  }
  // The family is set here, the ground in the header. Both live on <html>, so
  // this stays in step with the header button without either owning the state.
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);
  const mode = useSyncExternalStore(subscribeToTheme, getMode, getServerMode);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<SectionId, HTMLButtonElement | null>>>({});

  const [section, setSection] = useState<SectionId>(SECTIONS[0].id);

  // An override row is just the repo it targets; its checks live in `value`,
  // where CheckList reads and writes them. The id is what keeps a row's
  // CheckList with that row: keyed by position, removing a row would hand its
  // check list to whichever row moved up into its place.
  const [rows, setRows] = useState<OverrideRow[]>(() =>
    Object.keys(value.repos).map((repo) => ({ id: nextRowId(), repo })),
  );

  // Re-seed local drafts from props each time the modal opens, so a parent
  // that hydrates `value` after mount (e.g. from localStorage) is reflected
  // and edits never silently drop previously stored config. Done during
  // render (React's documented "adjust state on prop change" pattern) rather
  // than in an effect, and keyed on `open` transitions only so we never
  // clobber a raw draft the user is actively typing.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRows(Object.keys(value.repos).map((repo) => ({ id: nextRowId(), repo })));
      setSection(SECTIONS[0].id);
      // A result from the last time the modal was open is stale by an unknown
      // amount; better to offer the check again than to show an old answer.
      setUpdate({ status: "idle" });
    }
  }

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus management: focus close button when modal opens
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  function setOrgChecks(orgLogin: string, checks: TrackedCheck[]) {
    onChange({ ...value, orgs: { ...value.orgs, [orgLogin]: checks } });
  }

  function setRepoChecks(repo: string, checks: TrackedCheck[]) {
    onChange({ ...value, repos: { ...value.repos, [repo]: checks } });
  }

  /** Renaming the repo moves the checks with it — they were named for this
   * override, not for the repo that happened to be typed first. One row per
   * repo is the invariant, so pointing a row at a repo another row already
   * holds joins the two lists rather than overwriting the older one. */
  function handleRowChange(index: number, repo: string) {
    const previous = rows[index].repo;
    const clash = rows.findIndex((r, i) => i !== index && r.repo === repo);
    setRows(
      rows
        .map((r, i) => (i === index ? { ...r, repo } : r))
        .filter((_, i) => i !== clash),
    );
    const repos = { ...value.repos };
    const carried = normalizeAll(repos[previous]);
    const existing = clash >= 0 ? normalizeAll(repos[repo]) : [];
    delete repos[previous];
    const seen = new Set(existing.map((c) => c.name));
    repos[repo] = [...existing, ...carried.filter((c) => !seen.has(c.name))];
    onChange({ ...value, repos });
  }

  function addRow() {
    setRows([...rows, { id: nextRowId(), repo: "" }]);
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
    const repos = { ...value.repos };
    delete repos[rows[index].repo];
    onChange({ ...value, repos });
  }

  // Arrow keys move between sections. The menu is a horizontal strip below the
  // `sm` breakpoint and a vertical column above it, so both axes are wired.
  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (step === 0) return;
    e.preventDefault();
    const current = SECTIONS.findIndex((s) => s.id === section);
    const next = SECTIONS[(current + step + SECTIONS.length) % SECTIONS.length];
    setSection(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16"
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-background shadow-xl"
      >
        {/* Header row */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 id="settings-title" className="font-semibold text-foreground">Settings</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Menu + the one visible section. Only the section scrolls, so the
            menu and the close button stay put however long the content is. */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* No aria-orientation: the menu is a vertical column at sm and up
              and a horizontal strip below it, and there is no responsive way
              to say so. Arrow keys move on both axes regardless. */}
          <div
            role="tablist"
            aria-label="Settings sections"
            onKeyDown={handleMenuKeyDown}
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-6 pb-3 sm:w-52 sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r sm:pr-3 sm:pb-6"
          >
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                ref={(el) => {
                  tabRefs.current[s.id] = el;
                }}
                type="button"
                role="tab"
                id={`settings-tab-${s.id}`}
                aria-selected={section === s.id}
                // Only the selected section is mounted, so only the selected
                // tab has a panel to point at.
                aria-controls={section === s.id ? "settings-panel" : undefined}
                tabIndex={section === s.id ? 0 : -1}
                onClick={() => setSection(s.id)}
                className={`min-h-[44px] cursor-pointer whitespace-nowrap rounded-md px-3 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                  section === s.id
                    ? "bg-accent text-background"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id="settings-panel"
            aria-labelledby={`settings-tab-${section}`}
            tabIndex={0}
            className="min-w-0 flex-1 overflow-y-auto px-6 pt-4 pb-6 sm:pt-0"
          >
            {section === "appearance" && (
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-3 text-sm text-muted">
                  A theme brings its own colours and typefaces. Each swatch below
                  is that theme rendering itself on your current ground.
                </legend>
                <div className="flex flex-col gap-2">
                  {THEMES.map((t) => (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border bg-surface px-3 py-2 transition-colors hover:brightness-[var(--hover-brightness)] ${
                        theme === t.id ? "border-accent" : "border-border"
                      }`}
                    >
                      <input
                        type="radio"
                        name="prison-theme"
                        value={t.id}
                        checked={theme === t.id}
                        onChange={() => applyTheme(t.id)}
                        className="h-4 w-4 shrink-0 accent-accent"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {t.label}
                        </span>
                        {/* Naming both grounds is what makes the header button
                            legible: it says "Switch to Aurora Night", and this
                            is where you learn Night is one of Aurora's two. */}
                        <span className="text-xs text-muted">
                          {t.light} · {t.dark}
                          {theme === t.id && ` — on ${modeLabel(theme, mode)}`}
                        </span>
                      </span>
                      {/* Stamped with the pair, so globals.css resolves that
                          palette's variables in here: the ground, the typeface
                          and the four hues are the real ones, not a copy that
                          can drift. Decorative — the text above names it all. */}
                      <span
                        data-theme={t.id}
                        data-mode={mode}
                        aria-hidden="true"
                        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5"
                      >
                        <span className="font-sans text-xs font-semibold text-foreground">
                          Aa
                        </span>
                        <span className="h-3.5 w-3.5 rounded-full bg-accent" />
                        <span className="h-3.5 w-3.5 rounded-full bg-success" />
                        <span className="h-3.5 w-3.5 rounded-full bg-warning" />
                        <span className="h-3.5 w-3.5 rounded-full bg-danger" />
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  The button in the header switches between a theme&apos;s two
                  grounds.
                </p>
              </fieldset>
            )}

            {section === "comments" && (
              <div className="space-y-2">
                <p className="mb-3 text-sm text-muted">
                  What shows up in <strong className="font-medium text-foreground">Comments awaiting your reply</strong>.
                </p>
                <SettingCheckbox checked={showBots} onChange={onShowBotsChange}>
                  Show bot comments
                </SettingCheckbox>
                <SettingCheckbox checked={hideReacted} onChange={onHideReactedChange}>
                  Hide comments I reacted to
                </SettingCheckbox>
              </div>
            )}

            {section === "auto-refresh" && (
              <div>
                <SettingCheckbox checked={autoRefresh} onChange={onAutoRefreshChange}>
                  Auto refresh
                </SettingCheckbox>
                <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                  <span>Check</span>
                  <select
                    value={pollInterval}
                    onChange={(e) => onPollIntervalChange(Number(e.target.value))}
                    disabled={!autoRefresh}
                    aria-label="Auto refresh interval"
                    className="min-h-[36px] rounded-md border border-border bg-surface px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {POLL_INTERVAL_OPTIONS.map((o) => (
                      <option key={o.ms} value={o.ms}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs text-muted">
                  On this schedule PRison re-checks the dashboard and tells you
                  what moved — a PR that became ready, checks that went red,
                  changes requested, a review asked of you, a new reply, or one
                  of your PRs getting merged. Works while a PRison tab is open;
                  there is no background service.
                </p>
                {/* All three only apply while auto refresh is on: with it off
                    nothing polls, so there is no tab badge to promise and no
                    notification to test. */}
                {autoRefresh && notifPermission === "default" && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-muted">
                      Your browser hasn&apos;t been asked yet, so you&apos;ll get
                      the tab badge but no desktop notification.
                    </p>
                    <SettingButton onClick={onEnableNotifications}>
                      Enable notifications
                    </SettingButton>
                  </div>
                )}
                {autoRefresh && notifPermission === "denied" && (
                  <p className="mt-3 text-xs text-muted">
                    Notifications are blocked in your browser — you&apos;ll still
                    get the tab badge.
                  </p>
                )}
                {autoRefresh && notifPermission === "granted" && (
                  <div className="mt-3">
                    <SettingButton onClick={onTestNotification}>
                      Send a test notification
                    </SettingButton>
                    {/* The browser having permission is only half the chain:
                        the operating system decides separately whether the
                        browser may show anything, and it refuses in silence.
                        Without this line a swallowed notification is
                        indistinguishable from a broken button. */}
                    <p className="mt-2 text-xs text-muted">
                      Nothing appeared? Your browser has permission, so check
                      that your operating system allows notifications from it —
                      and that Do Not Disturb or a Focus mode isn&apos;t on.
                    </p>
                  </div>
                )}
              </div>
            )}

            {section === "tracked-checks" && (
              <div>
                <p className="mb-6 text-sm text-muted">
                  Name the checks each PR needs (e.g. a manual qa/smoke). We&apos;ll show
                  them as Awaiting until they report — handy for gates GitHub
                  doesn&apos;t expose. Tick{" "}
                  <strong className="font-medium text-foreground">Required</strong> and the
                  check holds the PR out of Ready to merge; leave it unticked and the
                  check is shown for information and blocks nothing.
                </p>

                {/* Owner defaults — organizations *and* the personal account.
                    A default is keyed by the owner segment of `owner/repo`,
                    which is the login for a personal repo, so resolution has
                    always handled these; only this list left them out, and a
                    personal repo's only recourse was a per-repo override. */}
                {owners.length > 0 && (
                  <section className="mb-6">
                    <h4 className="mb-2 text-sm font-medium text-foreground">
                      Owner defaults
                    </h4>
                    <div className="space-y-4">
                      {owners.map((owner) => (
                        <div key={owner} className="flex flex-col gap-2">
                          <span className="text-sm text-muted">{owner}</span>
                          <CheckList
                            scope={owner}
                            checks={value.orgs[owner]}
                            onChange={(checks) => setOrgChecks(owner, checks)}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Repository overrides */}
                <section>
                  <h4 className="mb-2 text-sm font-medium text-foreground">
                    Repository overrides
                  </h4>
                  <p className="mb-3 text-xs text-muted">
                    A repo override replaces the owner default for that repo.
                  </p>
                  {availableRepos.length === 0 && rows.length === 0 && (
                    <p className="mb-3 text-xs text-muted">
                      No repositories loaded yet &mdash; you can search any repo by name below.
                    </p>
                  )}
                  <div className="mb-3 space-y-4">
                    {rows.map((row, index) => (
                      <div key={row.id} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <RepoCombobox
                            value={row.repo}
                            onChange={(next) => handleRowChange(index, next)}
                            suggestions={availableRepos}
                            owners={owners}
                          />
                          <button
                            type="button"
                            aria-label="Remove repo override"
                            onClick={() => removeRow(index)}
                            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            <svg
                              aria-hidden="true"
                              width="14"
                              height="14"
                              viewBox="0 0 14 14"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M11 3L3 11M3 3l8 8"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </div>
                        {/* A check belongs to a repo, so there is nothing to
                            add one to until the row names one. */}
                        {row.repo.trim() !== "" && (
                          <div className="border-l border-border pl-3">
                            <CheckList
                              key={row.repo}
                              scope={row.repo}
                              checks={value.repos[row.repo]}
                              onChange={(checks) => setRepoChecks(row.repo, checks)}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <SettingButton onClick={addRow} className="py-1.5">
                    Add override
                  </SettingButton>
                </section>
              </div>
            )}

            {section === "about" && (
              <div className="space-y-3 text-sm text-muted">
                <p className="text-base font-semibold text-foreground">
                  PRison{version ? ` v${version}` : ""}
                </p>
                <p>
                  A read-only GitHub dashboard for the pull requests waiting on
                  you — and how long they&apos;ve been waiting. It runs on your
                  own machine and never writes anything back to GitHub.
                </p>
                <p>
                  <a
                    href={PROJECT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-2 hover:brightness-110"
                  >
                    {PROJECT_LABEL}
                  </a>{" "}
                  — open source, MIT licensed. Issues and pull requests welcome.
                </p>
                <div className="flex flex-col gap-2">
                  <SettingButton onClick={checkForUpdates} className="self-start">
                    Check for updates
                  </SettingButton>
                  {/* aria-live: the answer arrives after the click, and the
                      button's own label doesn't change to announce it. */}
                  <p aria-live="polite" className="text-xs">
                    {update.status === "checking" && "Checking…"}
                    {update.status === "error" &&
                      "Couldn't reach GitHub. Try again in a moment."}
                    {update.status === "done" && <UpdateResult latest={update.latest} version={version} />}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
