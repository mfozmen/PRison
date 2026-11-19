"use client";

import type { Budget } from "@/lib/github/budget";
import {
  useState,
  useEffect,
  useRef,
  useId,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { normalizeAll } from "@/lib/tracked-checks";
import type {
  TrackedChecks,
  TrackedCheck,
  StoredCheck,
} from "@/lib/tracked-checks";
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
  hideSeen: boolean;
  onHideSeenChange: (v: boolean) => void;
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
  updateChecks?: boolean;
  onUpdateChecksChange?: (v: boolean) => void;
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
  const [items, setItems] = useState<TrackedCheck[]>(() =>
    normalizeAll(checks),
  );
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
              commit(
                items.map((c, j) =>
                  j === i ? { ...c, name: e.target.value } : c,
                ),
              )
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
                  items.map((c, j) =>
                    j === i ? { ...c, required: e.target.checked } : c,
                  ),
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
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
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
        <SettingButton
          onClick={add}
          className="shrink-0 py-1.5"
          ariaLabel={`Add check to ${scope}`}
        >
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
    onChange(
      next
        .map((n) => n.trim())
        .filter((n) => n !== "" && !seen.has(n) && seen.add(n)),
    );
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
            onChange={(e) =>
              commit(names.map((n, j) => (j === i ? e.target.value : n)))
            }
            className={fieldClass}
          />
          <button
            type="button"
            aria-label={`Remove ${name} from ${scope}`}
            onClick={() => commit(names.filter((_, j) => j !== i))}
            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
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
        <SettingButton
          onClick={add}
          className="shrink-0 py-1.5"
          ariaLabel={addLabel}
        >
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
  const scopes: Scope[] = [
    ...owners.map((key): Scope => ({ kind: "owner", key })),
    ...repoScopes,
  ];

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
                  <option
                    key={owner}
                    value={scopeId({ kind: "owner", key: owner })}
                  >
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
          <SettingButton
            onClick={() => setAdding(true)}
            className="shrink-0 py-1.5"
          >
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
          <RepoCombobox
            value=""
            onChange={addRepo}
            suggestions={availableRepos}
            owners={owners}
          />
          <SettingButton
            onClick={() => setAdding(false)}
            className="shrink-0 py-1.5"
          >
            Cancel
          </SettingButton>
        </div>
      )}

      {current ? (
        children(current)
      ) : (
        <p className="text-xs text-muted">
          No owners loaded yet &mdash; add a repository by name to configure
          one.
        </p>
      )}
    </div>
  );
}

// A row with a switch on the right. Still a native checkbox underneath, so the
// keyboard, the form semantics and every "checkbox" query keep working; only
// its paint is a switch.
function SettingCheckbox({
  checked,
  onChange,
  help,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: ReactNode;
  children: ReactNode;
}) {
  // The help line describes the switch rather than naming it, so a screen
  // reader hears "Show bot comments, checkbox" and then the explanation.
  const id = useId();
  return (
    <label className="flex cursor-pointer select-none items-center gap-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block text-[15px] font-medium text-foreground">{children}</span>
        {help && <span id={`${id}-help`} className="mt-0.5 block text-[13px] text-muted">{help}</span>}
      </span>
      <input
        type="checkbox"
        aria-labelledby={`${id}-label`}
        aria-describedby={help ? `${id}-help` : undefined}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="relative h-[26px] w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-border transition-colors before:absolute before:top-[3px] before:left-[3px] before:h-5 before:w-5 before:rounded-full before:bg-foreground before:transition-transform checked:bg-accent checked:before:translate-x-[18px] checked:before:bg-background focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      />
    </label>
  );
}

/** The six sections, each with the status dot the board uses for its kind. */
const SECTION_DOT: Record<SectionId, string> = {
  comments: "bg-warning",
  "auto-refresh": "bg-accent",
  "tracked-checks": "bg-danger",
  "ignored-checks": "bg-muted",
  appearance: "bg-success",
  about: "bg-muted",
};

/** What the search box can find. Toggles work in the results; everything with
 * more to it than a switch opens its section instead. */
type SearchEntry = {
  section: SectionId;
  label: string;
  help: string;
  kind: "toggle" | "open" | "action";
  toggle?: "showBots" | "hideReacted" | "hideSeen" | "autoRefresh" | "updateChecks";
};

const SEARCH_INDEX: SearchEntry[] = [
  { section: "comments", label: "Show bot comments", help: "Bots write most review comments; they stay hidden unless you ask", kind: "toggle", toggle: "showBots" },
  { section: "comments", label: "Hide comments I reacted to", help: "A reaction dismisses a thread, the same as replying", kind: "toggle", toggle: "hideReacted" },
  { section: "comments", label: "Hide comments I marked as seen", help: "They come back when someone replies", kind: "toggle", toggle: "hideSeen" },
  { section: "auto-refresh", label: "Auto refresh", help: "Checks GitHub on a schedule while a PRison tab is open", kind: "toggle", toggle: "autoRefresh" },
  { section: "auto-refresh", label: "Refresh interval", help: "How often auto refresh checks: minutes, hourly", kind: "open" },
  { section: "auto-refresh", label: "Desktop notifications", help: "Notify about changes that land while you're on another tab", kind: "open" },
  { section: "tracked-checks", label: "Tracked checks", help: "Checks a PR needs, shown as Awaiting until they report", kind: "open" },
  { section: "ignored-checks", label: "Ignored checks", help: "Broken checks that stop holding PRs out of Ready to merge", kind: "open" },
  { section: "appearance", label: "Theme", help: "Colours and typefaces, light and dark", kind: "open" },
  { section: "about", label: "Tell me when a newer version is out", help: "Asks GitHub once a day, without your token", kind: "toggle", toggle: "updateChecks" },
  { section: "about", label: "Check for updates", help: "Ask GitHub for the latest release now", kind: "action" },
];

/** The label with the first occurrence of the query marked. */
function Highlight({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accent/30 px-px text-inherit">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
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
function UpdateResult({
  latest,
  version,
}: {
  latest: string | null;
  version?: string;
}) {
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
  hideSeen,
  onHideSeenChange,
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
  updateChecks = false,
  onUpdateChecksChange = () => {},
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
      setUpdate({
        status: "done",
        latest: typeof tagName === "string" ? tagName : null,
      });
    } catch {
      setUpdate({ status: "error" });
    }
  }
  // The family is set here, the ground in the header. Both live on <html>, so
  // this stays in step with the header button without either owning the state.
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getTheme,
    getServerTheme,
  );
  const mode = useSyncExternalStore(subscribeToTheme, getMode, getServerMode);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The jump pill last used; every section is on the page, this only marks it.
  const [section, setSection] = useState<SectionId>(SECTIONS[0].id);
  // Typing turns the page into a list of matching settings; empty is the page.
  const [query, setQuery] = useState("");
  // Which ground the theme previews show; null follows the current one.
  const [previewMode, setPreviewMode] = useState<"light" | "dark" | null>(null);

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
      setQuery("");
      setPreviewMode(null);
      // A result from the last time the modal was open is stale by an unknown
      // amount; better to offer the check again than to show an old answer.
      setUpdate({ status: "idle" });
    }
  }

  // Escape clears a search before it closes anything: the first press takes
  // you back to every setting, the second closes. "/" jumps to the search box,
  // as it does on the board, unless you are typing somewhere.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (query) setQuery("");
        else onClose();
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, query]);


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

  function setIgnoredIn(
    bucket: "orgs" | "repos",
    scope: string,
    names: string[],
  ) {
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

  // Jumping is a scroll, not a switch: every section stays on the page. The
  // scroll waits a frame so a section that was hidden behind search results is
  // back on the page first. (Optional call: jsdom has no scrollIntoView.)
  function jump(id: SectionId) {
    setSection(id);
    setQuery("");
    requestAnimationFrame(() =>
      document.getElementById(`settings-${id}`)?.scrollIntoView?.({ block: "start" }),
    );
  }

  const toggles = {
    showBots: [showBots, onShowBotsChange],
    hideReacted: [hideReacted, onHideReactedChange],
    hideSeen: [hideSeen, onHideSeenChange],
    autoRefresh: [autoRefresh, onAutoRefreshChange],
    updateChecks: [updateChecks, onUpdateChecksChange],
  } as const;

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = SEARCH_INDEX.filter((e) => {
    const sectionLabel = SECTIONS.find((s) => s.id === e.section)!.label;
    const hay = `${e.label} ${e.help} ${sectionLabel}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const resultSections = SECTIONS.filter((s) => results.some((r) => r.section === s.id));
  const shownMode = previewMode ?? mode;

  const card = (id: SectionId, body: ReactNode) => {
    const label = SECTIONS.find((s) => s.id === id)!.label;
    return (
      <section
        id={`settings-${id}`}
        aria-labelledby={`settings-${id}-title`}
        className="scroll-mt-4 rounded-[18px] border border-border bg-surface px-5 pb-5"
      >
        <h3
          id={`settings-${id}-title`}
          className="flex items-center gap-2 pt-4 pb-2 text-xs font-semibold tracking-[0.08em] text-muted uppercase"
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${SECTION_DOT[id]}`} />
          {label}
        </h3>
        {body}
      </section>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative z-10 flex max-h-[min(800px,90vh)] w-full max-w-[800px] flex-col rounded-[20px] border border-border bg-background shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)]"
      >
        <div className="flex flex-col gap-3.5 border-b border-border px-6 pt-5 pb-3.5">
          <div className="flex items-center gap-3">
            <h2 id="settings-title" className="flex-1 text-lg font-bold text-foreground">
              Settings
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close settings"
              onClick={onClose}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-surface text-foreground transition-colors hover:brightness-[var(--hover-brightness)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <label
            className={`flex h-12 items-center gap-3 rounded-[14px] border bg-surface px-4 ${
              query ? "border-accent ring-[3px] ring-accent/20" : "border-border"
            }`}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={query ? "text-accent" : "text-muted"}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search settings"
              aria-keyshortcuts="/"
              placeholder="Search settings: bots, interval, theme, checks…"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-border text-foreground"
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ) : (
              <kbd aria-hidden="true" className="rounded-md border border-border px-1.5 py-px font-mono text-xs text-muted">
                /
              </kbd>
            )}
          </label>
          {query ? (
            <p aria-live="polite" className="flex h-[34px] items-center gap-2 text-[13px] text-muted">
              <span className="font-semibold text-foreground">
                {results.length} {results.length === 1 ? "setting" : "settings"}
              </span>
              {results.length > 0
                ? `in ${resultSections.length} ${resultSections.length === 1 ? "section" : "sections"} match “${query.trim()}”`
                : `match “${query.trim()}”`}
              <span className="flex-1" />
              Esc clears
            </p>
          ) : (
            <nav aria-label="Jump to section" className="flex flex-wrap gap-1.5">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-current={section === s.id ? "true" : undefined}
                  onClick={() => jump(s.id)}
                  className={`flex min-h-[34px] cursor-pointer items-center gap-[7px] rounded-full border border-border px-3.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
                    section === s.id ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                  }`}
                >
                  <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${SECTION_DOT[s.id]}`} />
                  {s.label}
                </button>
              ))}
            </nav>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {query ? (
            results.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                No setting matches “{query.trim()}”.
              </p>
            ) : (
              <div className="-mx-2 flex flex-col">
                {resultSections.map((s) => (
                  <div key={s.id}>
                    <div className="flex items-center gap-2 px-2 pt-3.5 pb-1.5 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SECTION_DOT[s.id]}`} />
                      {s.label}
                    </div>
                    {results
                      .filter((r) => r.section === s.id)
                      .map((r) =>
                        r.kind === "toggle" && r.toggle ? (
                          <div key={r.label} className="rounded-xl px-3 hover:bg-surface">
                            <SettingCheckbox
                              checked={toggles[r.toggle][0]}
                              onChange={toggles[r.toggle][1]}
                              help={r.help}
                            >
                              <Highlight text={r.label} query={query.trim()} />
                            </SettingCheckbox>
                          </div>
                        ) : (
                          <div key={r.label} className="flex min-h-[60px] items-center gap-3.5 rounded-xl px-3 py-2 hover:bg-surface">
                            <div className="min-w-0 flex-1">
                              <div className="text-[15px] font-medium text-foreground">
                                <Highlight text={r.label} query={query.trim()} />
                              </div>
                              <div className="mt-0.5 text-[13px] text-muted">{r.help}</div>
                              {r.kind === "action" && update.status !== "idle" && (
                                <p aria-live="polite" className="mt-1 text-xs text-muted">
                                  {update.status === "checking" && "Checking…"}
                                  {update.status === "error" && "Couldn't reach GitHub. Try again in a moment."}
                                  {update.status === "done" && <UpdateResult latest={update.latest} version={version} />}
                                </p>
                              )}
                            </div>
                            <SettingButton
                              onClick={() => (r.kind === "action" ? checkForUpdates() : jump(r.section))}
                              className="flex shrink-0 items-center gap-1.5 rounded-[10px]"
                            >
                              {r.kind === "action" ? "Check now" : "Open"}
                            </SettingButton>
                          </div>
                        ),
                      )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-4">
              {card(
                "comments",
                <div className="divide-y divide-border border-t border-border">
                  <SettingCheckbox checked={showBots} onChange={onShowBotsChange} help="Bots write most review comments; they stay hidden unless you ask.">
                    Show bot comments
                  </SettingCheckbox>
                  <SettingCheckbox checked={hideReacted} onChange={onHideReactedChange} help="A reaction dismisses a thread, the same as replying.">
                    Hide comments I reacted to
                  </SettingCheckbox>
                  <SettingCheckbox checked={hideSeen} onChange={onHideSeenChange} help="They come back when someone replies.">
                    Hide comments I marked as seen
                  </SettingCheckbox>
                </div>,
              )}

              {card(
                "auto-refresh",
                <div className="divide-y divide-border border-t border-border">
                  <SettingCheckbox checked={autoRefresh} onChange={onAutoRefreshChange} help="Tells you what moved: approvals, new conflicts, replies. Works while a PRison tab is open.">
                    Auto refresh
                  </SettingCheckbox>
                  <div className="flex flex-wrap items-center gap-3 py-3">
                    <span className="flex-1 text-[15px] font-medium text-foreground">Every</span>
                    <div
                      role="radiogroup"
                      aria-label="Auto refresh interval"
                      aria-disabled={!autoRefresh || undefined}
                      className={`flex rounded-full border border-border bg-background p-1 ${autoRefresh ? "" : "opacity-60"}`}
                    >
                      {POLL_INTERVAL_OPTIONS.map((o) => (
                        <label
                          key={o.ms}
                          className={`flex min-h-[32px] items-center rounded-full px-3.5 text-[13px] font-medium ${
                            pollInterval === o.ms ? "bg-foreground text-background" : "text-muted"
                          } ${autoRefresh ? "cursor-pointer" : "cursor-not-allowed"}`}
                        >
                          <input
                            type="radio"
                            name="prison-poll-interval"
                            value={o.ms}
                            checked={pollInterval === o.ms}
                            disabled={!autoRefresh}
                            onChange={() => onPollIntervalChange(o.ms)}
                            className="sr-only"
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  {budget && (
                    // The allowance is hourly and shared with every other client
                    // signed in as you, so an interval is a spending decision.
                    <p className="py-3 text-xs text-muted">
                      That refresh cost{" "}
                      <strong className="font-medium text-foreground">{budget.cost} points</strong>{" "}
                      of GitHub&apos;s hourly allowance;{" "}
                      <strong className="font-medium text-foreground">{budget.remaining.toLocaleString()}</strong>{" "}
                      are left until it returns to full. The allowance is per account, so anything else
                      signed in as you spends from the same pocket.
                    </p>
                  )}
                  {/* All of these only apply while auto refresh is on: with it off
                      nothing polls, so there is no notification to promise or test. */}
                  {autoRefresh && (
                    <div className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium text-foreground">Desktop notifications</div>
                        <div className="mt-0.5 text-[13px] text-muted">For changes that land while you&apos;re on another tab.</div>
                      </div>
                      {notifPermission === "granted" && (
                        <>
                          <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Allowed</span>
                          <SettingButton onClick={onTestNotification} className="rounded-[10px]">
                            Send a test notification
                          </SettingButton>
                        </>
                      )}
                      {notifPermission === "default" && (
                        <SettingButton onClick={onEnableNotifications} className="rounded-[10px]">
                          Enable notifications
                        </SettingButton>
                      )}
                      {notifPermission === "denied" && (
                        <span className="rounded-full bg-danger/15 px-2.5 py-1 text-xs font-semibold text-danger">Blocked</span>
                      )}
                    </div>
                  )}
                  {autoRefresh && notifPermission === "default" && (
                    <p className="py-3 text-xs text-muted">
                      Your browser hasn&apos;t been asked yet, so you&apos;ll get the tab badge but no desktop notification.
                    </p>
                  )}
                  {autoRefresh && notifPermission === "denied" && (
                    <p className="py-3 text-xs text-muted">
                      Notifications are blocked in your browser — you&apos;ll still get the tab badge.
                    </p>
                  )}
                  {autoRefresh && notifPermission === "granted" && (
                    // Browser permission is only half the chain: the operating system
                    // decides separately and refuses in silence.
                    <p className="py-3 text-xs text-muted">
                      Nothing appeared? The browser has permission, so the block is underneath it: your operating
                      system decides separately, and it refuses in silence. On macOS that is{" "}
                      <strong className="font-medium text-foreground">System Settings → Notifications</strong>, where
                      the browser needs notifications allowed <em>and</em> an alert style that isn&apos;t None — a style
                      of None is permission that shows nothing. A browser registers more than one entry there, so check
                      each of them. A Focus mode silences everything regardless.
                    </p>
                  )}
                  {autoRefresh && (
                    <p className="py-3 text-xs text-muted">
                      Rather not depend on notifications at all?{" "}
                      <a
                        href={`${PROJECT_URL}/tree/main/extras/menubar`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline underline-offset-2 hover:brightness-110"
                      >
                        The menu bar
                      </a>{" "}
                      shows the same count on macOS without needing permission from anyone.
                    </p>
                  )}
                </div>,
              )}

              {card(
                "tracked-checks",
                <div className="border-t border-border pt-4">
                  <p className="mb-5 text-sm text-muted">
                    Name the checks each PR needs (e.g. a manual qa/smoke). We&apos;ll show them as Awaiting until
                    they report — handy for gates GitHub doesn&apos;t expose. Tick{" "}
                    <strong className="font-medium text-foreground">Required</strong> and the check holds the PR out
                    of Ready to merge; leave it unticked and the check is shown for information and blocks nothing.
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
                          checks={scope.kind === "owner" ? value.orgs[scope.key] : value.repos[scope.key]}
                          onChange={(checks) =>
                            scope.kind === "owner" ? setOrgChecks(scope.key, checks) : setRepoChecks(scope.key, checks)
                          }
                        />
                      </div>
                    )}
                  </ScopeEditor>
                </div>,
              )}

              {card(
                "ignored-checks",
                <div className="border-t border-border pt-4">
                  <p className="mb-5 text-sm text-muted">
                    A check that is broken rather than failing. An ignored check still shows on the card &mdash;
                    muted, never red &mdash; but it stops holding the PR out of{" "}
                    <strong className="font-medium text-foreground">Ready to merge</strong>, and it never gets a
                    bucket of its own under By check. Right-click a check on the board to ignore it; it lands here,
                    under its repo.
                  </p>
                  <ScopeEditor
                    label="Ignored checks scope"
                    owners={owners}
                    repos={ignoredRepos}
                    availableRepos={availableRepos}
                    count={(s) => ((s.kind === "owner" ? ignored.orgs[s.key] : ignored.repos[s.key]) ?? []).length}
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
                          names={(scope.kind === "owner" ? ignored.orgs[scope.key] : ignored.repos[scope.key]) ?? []}
                          onChange={(names) =>
                            setIgnoredIn(scope.kind === "owner" ? "orgs" : "repos", scope.key, names)
                          }
                          addLabel={`Ignore for ${scope.key}`}
                        />
                      </div>
                    )}
                  </ScopeEditor>
                </div>,
              )}

              {card(
                "appearance",
                <fieldset className="m-0 border-0 border-t border-border p-0 pt-3">
                  <div className="mb-3.5 flex flex-wrap items-center gap-3">
                    <legend className="flex-1 text-[13px] text-muted">
                      Each card is the board in that theme. The sun/moon in the header flips between its two grounds.
                    </legend>
                    <div role="group" aria-label="Preview ground" className="flex rounded-full border border-border bg-background p-[3px]">
                      {(["light", "dark"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={shownMode === m}
                          onClick={() => setPreviewMode(m)}
                          className={`min-h-[28px] cursor-pointer rounded-full px-3 text-xs ${
                            shownMode === m ? "bg-foreground font-semibold text-background" : "font-medium text-muted"
                          }`}
                        >
                          Preview {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(12rem, 1fr))" }}>
                    {THEMES.map((t) => (
                      <label
                        key={t.id}
                        className={`group cursor-pointer overflow-hidden rounded-[14px] border bg-background transition-colors focus-within:ring-2 focus-within:ring-accent ${
                          theme === t.id ? "border-accent ring-[3px] ring-accent/25" : "border-border"
                        }`}
                      >
                        <input
                          type="radio"
                          name="prison-theme"
                          value={t.id}
                          checked={theme === t.id}
                          onChange={() => applyTheme(t.id)}
                          className="sr-only"
                        />
                        {/* Stamped with the pair, so globals.css resolves that
                            palette's variables in here: the ground, the spot, the
                            typeface and the four hues are the real ones, not a
                            copy that can drift. Decorative; the text names it. */}
                        <span
                          data-theme={t.id}
                          data-mode={shownMode}
                          aria-hidden="true"
                          className="flex h-[92px] flex-col gap-1.5 bg-background p-[9px]"
                        >
                          <span className="nm-mini flex h-6 overflow-hidden rounded-[7px]">
                            <span className="w-[26px] bg-[linear-gradient(160deg,var(--danger),var(--warning))]" />
                            <span className="flex flex-1 items-center gap-1 px-1.5">
                              <span className="h-1 w-[46%] rounded-sm bg-foreground/75" />
                              <span className="ml-auto h-2 w-[18px] rounded-[3px] bg-[linear-gradient(90deg,var(--danger),var(--warning))]" />
                            </span>
                          </span>
                          <span className="grid flex-1 grid-cols-4 gap-1">
                            {(["bg-danger", "bg-accent", "bg-warning", "bg-success"] as const).map((dot, i) => (
                              <span
                                key={dot}
                                className={`flex flex-col gap-[3px] rounded-[5px] border bg-surface p-1 ${i === 0 ? "border-danger/45" : "border-border"}`}
                              >
                                <span className={`h-[5px] w-[5px] rounded-full ${dot}`} />
                                <span className="h-[3px] rounded-sm bg-foreground/35" />
                                <span className="h-[3px] w-[70%] rounded-sm bg-foreground/20" />
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 bg-surface px-[11px] py-[9px]">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-foreground">{t.label}</span>
                            {/* Naming both grounds is what makes the header button
                                legible: it says "Switch to Aurora Night". */}
                            <span className="block text-[11px] text-muted">
                              {t.light} · {t.dark}
                              {theme === t.id && ` — on ${modeLabel(theme, mode)}`}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={`flex h-[18px] w-[18px] items-center justify-center rounded-full ${
                              theme === t.id ? "bg-accent text-background" : ""
                            }`}
                          >
                            {theme === t.id && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>,
              )}

              {card(
                "about",
                <div className="space-y-3 border-t border-border pt-4 text-sm text-muted">
                  <p className="text-base font-semibold text-foreground">PRison{version ? ` v${version}` : ""}</p>
                  <p>
                    A read-only GitHub dashboard for the pull requests waiting on you — and how long they&apos;ve
                    been waiting. It runs on your own machine and never writes anything back to GitHub.
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
                  <SettingCheckbox checked={updateChecks} onChange={onUpdateChecksChange} help="Asks GitHub once a day, without your token.">
                    Tell me when a newer version is out
                  </SettingCheckbox>
                  <div className="flex flex-col gap-2">
                    <SettingButton onClick={checkForUpdates} className="self-start rounded-[10px]">
                      Check for updates
                    </SettingButton>
                    {/* aria-live: the answer arrives after the click, and the
                        button's own label doesn't change to announce it. */}
                    <p aria-live="polite" className="text-xs">
                      {update.status === "checking" && "Checking…"}
                      {update.status === "error" && "Couldn't reach GitHub. Try again in a moment."}
                      {update.status === "done" && <UpdateResult latest={update.latest} version={version} />}
                    </p>
                  </div>
                </div>,
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
