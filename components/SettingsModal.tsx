"use client";

import type { Budget } from "@/lib/github/budget";
import {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { normalizeAll } from "@/lib/tracked-checks";
import type { TrackedChecks, TrackedCheck, StoredCheck } from "@/lib/tracked-checks";
import { EMPTY_IGNORED, type IgnoredChecks } from "@/lib/ignored-checks";
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
  /** What the last refresh cost and what is left of the hour, as GitHub
   * reported it. Null until a refresh has answered. */
  budget?: Budget | null;
  onEnableNotifications: () => void;
  onTestNotification: () => void;
  /** Check names written off as broken. Mostly filled from the board — the
   * chip's own menu is where a bad check is met — so this panel is where the
   * user finds out what they did there, and takes it back. */
  ignored?: IgnoredChecks;
  onIgnoredChange?: (next: IgnoredChecks) => void;
}

// Comments stays first: it is the section the modal opens on, and the one most
// often wanted. Appearance sits with About at the end, where the settings stop
// being about what the dashboard shows and start being about how it looks.
const SECTIONS = [
  { id: "comments", label: "Comments" },
  { id: "auto-refresh", label: "Auto refresh" },
  { id: "tracked-checks", label: "Tracked checks" },
  { id: "ignored-checks", label: "Ignored checks" },
  { id: "appearance", label: "Appearance" },
  { id: "about", label: "About" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// A tracked check is a name plus whether it blocks the merge, so adding one
// asks both questions at once: type the name, answer the box, press Add. The
// list below is the same two controls per row, which is what makes an existing
// check editable rather than something you have to delete and retype.
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

/** The names ignored in one scope: an owner or a single repo. Plain strings —
 * there is nothing to say about a check you have written off beyond its name. */
function NameList({
  scope,
  names,
  onChange,
  addLabel,
}: {
  scope: string;
  names: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
}) {
  const [draft, setDraft] = useState("");

  // Trimmed on the way out, never while typing, and one entry per name — the
  // same rules the tracked list edits under, for the same reasons.
  function commit(next: string[]) {
    const seen = new Set<string>();
    onChange(next.map((n) => n.trim()).filter((n) => n !== "" && !seen.has(n) && seen.add(n)));
  }

  function add() {
    const name = draft.trim();
    if (!name || names.includes(name)) return;
    commit([...names, name]);
    setDraft("");
  }

  const fieldClass =
    "min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-1.5">
      {names.map((name, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            aria-label={`Ignored check ${i + 1} for ${scope}`}
            value={name}
            onChange={(e) => commit(names.map((n, j) => (j === i ? e.target.value : n)))}
            className={fieldClass}
          />
          <button
            type="button"
            aria-label={`Remove ${name} from ${scope}`}
            onClick={() => commit(names.filter((_, j) => j !== i))}
            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={`New ignored check for ${scope}`}
          placeholder="e.g. nightly-e2e"
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
        <SettingButton onClick={add} className="shrink-0 py-1.5" ariaLabel={addLabel}>
          Ignore
        </SettingButton>
      </div>
    </div>
  );
}

/** A scope the check panels edit one at a time: an owner default, or one
 * repo. Stacking every scope made the panel as tall as the config was wide;
 * picking one keeps it the height of a single list. */
type Scope = { kind: "owner" | "repo"; key: string };

const scopeId = (s: Scope) => `${s.kind}:${s.key}`;

/** The picker and its one visible list. Both check panels use it, so the two
 * settings that answer the same question — for which repos? — are worked the
 * same way. Owners are always offered (a default is what a repo falls back
 * to); repos are the ones already configured, plus any picked this session. */
function ScopeEditor({
  label,
  owners,
  repos,
  availableRepos,
  count,
  onAddRepo,
  onRemoveRepo,
  removeLabel,
  ownerGroupLabel,
  children,
}: {
  label: string;
  owners: string[];
  /** Repos the store already holds something for. */
  repos: string[];
  availableRepos: string[];
  /** How many names a scope holds. Shown on its option, so the picker keeps
   * the overview the stacked lists used to give, and it decides which scope
   * the panel opens on. */
  count: (scope: Scope) => number;
  onAddRepo?: (repo: string) => void;
  onRemoveRepo: (repo: string) => void;
  /** What removing a repo scope means here — an override dropped, or a repo's
   * ignore list cleared. The button says Remove either way; this is what a
   * screen reader hears it do. */
  removeLabel: (repo: string) => string;
  /** What an owner scope means in this panel: a default the repos fall back
   * to, or an ignore that covers all of them. The picker must not contradict
   * the sentence under it. */
  ownerGroupLabel: string;
  children: (scope: Scope) => ReactNode;
}) {
  // A repo stays on the list once picked, even while its list is empty —
  // otherwise removing the last check would take the scope out from under the
  // user mid-edit.
  const pickerRef = useRef<HTMLSelectElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const repoScopes: Scope[] = Array.from(new Set([...repos, ...picked])).map(
    (key): Scope => ({ kind: "repo", key }),
  );
  const scopes: Scope[] = [...owners.map((key): Scope => ({ kind: "owner", key })), ...repoScopes];

  // Opening on an empty owner default would hide the one scope the user did
  // configure behind a picker they have not noticed yet.
  const current =
    scopes.find((s) => scopeId(s) === selected) ??
    scopes.find((s) => count(s) > 0) ??
    scopes[0];

  // Pin whatever we landed on, so the fallback above only ever decides where
  // the panel opens. Emptying a list row by row would otherwise drop its
  // count to zero — and, for a repo, take the scope off the list entirely —
  // moving the panel somewhere else mid-edit. A repo is held open the same
  // way one picked from the combobox is.
  if (current && selected !== scopeId(current)) {
    setSelected(scopeId(current));
    // Duplicates are harmless — the scope list is deduped — and this runs
    // once, since the next render finds the scope by the id just pinned.
    if (current.kind === "repo") setPicked((p) => [...p, current.key]);
  }

  const optionLabel = (s: Scope) => {
    const n = count(s);
    return n > 0 ? `${s.key} (${n})` : s.key;
  };

  // The combobox only reports a repo it actually resolved, so there is no
  // empty name to guard against here.
  function addRepo(name: string) {
    setPicked((p) => (p.includes(name) ? p : [...p, name]));
    setSelected(scopeId({ kind: "repo", key: name }));
    setAdding(false);
    onAddRepo?.(name);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {current && (
          <select
            ref={pickerRef}
            aria-label={label}
            value={scopeId(current)}
            onChange={(e) => setSelected(e.target.value)}
            className="min-h-[44px] min-w-0 flex-1 cursor-pointer rounded-md border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {owners.length > 0 && (
              <optgroup label={ownerGroupLabel}>
                {owners.map((owner) => (
                  <option key={owner} value={scopeId({ kind: "owner", key: owner })}>
                    {optionLabel({ kind: "owner", key: owner })}
                  </option>
                ))}
              </optgroup>
            )}
            {repoScopes.length > 0 && (
              <optgroup label="Repositories">
                {repoScopes.map((s) => (
                  <option key={s.key} value={scopeId(s)}>
                    {optionLabel(s)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        {!adding && (
          <SettingButton onClick={() => setAdding(true)} className="shrink-0 py-1.5">
            Add repository
          </SettingButton>
        )}
        {current?.kind === "repo" && (
          <SettingButton
            onClick={() => {
              setPicked((p) => p.filter((r) => r !== current.key));
              setSelected(null);
              onRemoveRepo(current.key);
              // The button goes with the scope it removed; without this the
              // keyboard lands on <body>, a page away from what it was doing.
              pickerRef.current?.focus();
            }}
            className="shrink-0 py-1.5"
            ariaLabel={removeLabel(current.key)}
          >
            Remove
          </SettingButton>
        )}
      </div>

      {adding && (
        <div className="mb-4 flex items-center gap-2">
          <RepoCombobox value="" onChange={addRepo} suggestions={availableRepos} owners={owners} />
          <SettingButton onClick={() => setAdding(false)} className="shrink-0 py-1.5">
            Cancel
          </SettingButton>
        </div>
      )}

      {current ? (
        children(current)
      ) : (
        <p className="text-xs text-muted">
          No owners loaded yet &mdash; add a repository by name to configure one.
        </p>
      )}
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
  budget = null,
  onEnableNotifications,
  onTestNotification,
  ignored = EMPTY_IGNORED,
  onIgnoredChange = () => {},
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

  /** An empty list is not a scope: leaving `{"acme/web": []}` behind would keep
   * drawing a heading for a repo that ignores nothing. */
  // Only the repos that actually ignore something: the list is written by the
  // board, not chosen here, so there is no empty row to fill in.
  const ignoredRepos = Object.keys(ignored.repos);

  function setIgnoredIn(bucket: "orgs" | "repos", scope: string, names: string[]) {
    const next = { ...ignored[bucket] };
    if (names.length > 0) next[scope] = names;
    else delete next[scope];
    onIgnoredChange({ ...ignored, [bucket]: next });
  }

  /** A repo override goes away with its checks: the list was named for that
   * override, and leaving it behind would keep gating a repo the user just
   * said they no longer track separately. */
  function removeRepo(repo: string) {
    const repos = { ...value.repos };
    delete repos[repo];
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
                {budget && (
                  // The allowance is hourly and shared with every other client
                  // signed in as you, so an interval is a spending decision.
                  // It was an invisible one until this line.
                  <p className="mt-2 text-xs text-muted">
                    That refresh cost{" "}
                    <strong className="font-medium text-foreground">{budget.cost} points</strong> of
                    GitHub&apos;s hourly allowance;{" "}
                    <strong className="font-medium text-foreground">
                      {budget.remaining.toLocaleString()}
                    </strong>{" "}
                    are left until it returns to full. The allowance is per account, so anything
                    else signed in as you spends from the same pocket.
                  </p>
                )}
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

                {/* Owner defaults cover organizations *and* the personal
                    account: a default is keyed by the owner segment of
                    `owner/repo`, which is the login for a personal repo. */}
                <ScopeEditor
                  label="Tracked checks scope"
                  owners={owners}
                  repos={Object.keys(value.repos)}
                  availableRepos={availableRepos}
                  count={(s) =>
                    normalizeAll(s.kind === "owner" ? value.orgs[s.key] : value.repos[s.key]).length
                  }
                  onAddRepo={(repo) => setRepoChecks(repo, normalizeAll(value.repos[repo]))}
                  onRemoveRepo={removeRepo}
                  removeLabel={(repo) => `Remove ${repo} override`}
                  ownerGroupLabel="Owner defaults"
                >
                  {(scope) => (
                    <div>
                      <p className="mb-3 text-xs text-muted">
                        {scope.kind === "owner"
                          ? "The default for every repo this owner has, unless the repo has its own list."
                          : "Replaces the owner default for this repo."}
                      </p>
                      <CheckList
                        key={scopeId(scope)}
                        scope={scope.key}
                        checks={
                          scope.kind === "owner" ? value.orgs[scope.key] : value.repos[scope.key]
                        }
                        onChange={(checks) =>
                          scope.kind === "owner"
                            ? setOrgChecks(scope.key, checks)
                            : setRepoChecks(scope.key, checks)
                        }
                      />
                    </div>
                  )}
                </ScopeEditor>
              </div>
            )}

            {section === "ignored-checks" && (
              <div>
                <p className="mb-6 text-sm text-muted">
                  A check that is broken rather than failing. An ignored check still
                  shows on the card &mdash; muted, never red &mdash; but it stops holding
                  the PR out of{" "}
                  <strong className="font-medium text-foreground">Ready to merge</strong>,
                  and it never gets a bucket of its own under By check. Right-click a
                  check on the board to ignore it; it lands here, under its repo.
                </p>

                <ScopeEditor
                  label="Ignored checks scope"
                  owners={owners}
                  repos={ignoredRepos}
                  availableRepos={availableRepos}
                  count={(s) =>
                    ((s.kind === "owner" ? ignored.orgs[s.key] : ignored.repos[s.key]) ?? []).length
                  }
                  onRemoveRepo={(repo) => setIgnoredIn("repos", repo, [])}
                  removeLabel={(repo) => `Stop ignoring everything for ${repo}`}
                  ownerGroupLabel="Owner-wide"
                >
                  {(scope) => (
                    <div>
                      <p className="mb-3 text-xs text-muted">
                        {scope.kind === "owner"
                          ? "Ignored on every repo the owner has — for a check that is broken everywhere, not on one repo."
                          : "Ignored on this repo. An owner-wide entry still applies on top of it."}
                      </p>
                      <NameList
                        key={scopeId(scope)}
                        scope={scope.key}
                        names={
                          (scope.kind === "owner"
                            ? ignored.orgs[scope.key]
                            : ignored.repos[scope.key]) ?? []
                        }
                        onChange={(names) =>
                          setIgnoredIn(scope.kind === "owner" ? "orgs" : "repos", scope.key, names)
                        }
                        addLabel={`Ignore for ${scope.key}`}
                      />
                    </div>
                  )}
                </ScopeEditor>
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
