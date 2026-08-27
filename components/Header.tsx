"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Org } from "@/lib/types";
import { OrgSwitcher } from "./OrgSwitcher";
import { ActivityBell } from "./ActivityBell";
import { releaseUrl, appVersion, isNewerVersion } from "@/lib/project";
import type { ActivityEntry } from "@/lib/activity";
import {
  applyMode,
  getMode,
  getServerMode,
  getServerTheme,
  getTheme,
  modeLabel,
  subscribeToTheme,
  themeLabel,
} from "@/lib/theme";

async function signOut() {
  await fetch("/api/token", { method: "DELETE" });
  window.location.reload();
}

export interface HeaderProps {
  orgs: Org[];
  selectedOrg: string;
  onOrgChange: (login: string) => void;
  login: string;
  onOpenSettings: () => void;
  activity: readonly ActivityEntry[];
  onOpenActivity: () => void;
  onClearActivity: () => void;
  /** Off by default: a self-hosted tool that reaches the network on its own
   * should be something you turned on, not something you discover. */
  checkUpdates?: boolean;
}

export function Header({
  orgs,
  selectedOrg,
  onOrgChange,
  login,
  onOpenSettings,
  activity,
  onOpenActivity,
  onClearActivity,
  checkUpdates = false,
}: HeaderProps) {
  // Read inside the component, not at module scope, so tests can stub it.
  // next.config.ts inlines it from package.json; absent in a bare `next dev`.
  const version = appVersion();

  // Asked once per mount, and answered by the server from a day-long cache —
  // so a tab left open for a week is one question, not a week of them. It
  // costs nothing from the account's GitHub allowance; see the route.
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    if (!checkUpdates) return;
    let live = true;
    fetch("/api/latest-release")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && typeof d?.tagName === "string") setLatest(d.tagName);
      })
      // Silent on purpose: no network, GitHub down, rate limited. A version
      // check that can put an error on screen is worse than no version check.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [checkUpdates]);
  const update =
    version && latest && isNewerVersion(latest, version) ? latest : null;

  // The button flips the ground the current family sits on; the family itself
  // is chosen in Settings. Both come off <html>, so one subscription covers
  // changes made from either place.
  const mode = useSyncExternalStore(subscribeToTheme, getMode, getServerMode);
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getTheme,
    getServerTheme,
  );
  const isDark = mode === "dark";
  const nextMode = isDark ? "light" : "dark";

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded bg-accent font-mono text-sm font-bold text-background"
        >
          P
        </span>
        <span className="text-lg font-bold tracking-tight text-foreground">
          PRison
        </span>
      </div>
      <div className="flex items-center gap-4">
        <OrgSwitcher
          orgs={orgs}
          value={selectedOrg}
          onChange={onOrgChange}
          login={login}
        />
        <span className="hidden text-sm text-muted sm:inline">
          {login || "there"}
        </span>
        <ActivityBell
          entries={activity}
          onOpen={onOpenActivity}
          onClear={onClearActivity}
        />
        <button
          type="button"
          aria-label="Settings"
          onClick={onOpenSettings}
          className="cursor-pointer rounded-md border border-border bg-surface min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors hover:brightness-[var(--hover-brightness)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 6h10M18 6h2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="16"
              cy="6"
              r="2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 12h2M10 12h10"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="8"
              cy="12"
              r="2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 18h10M18 18h2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="16"
              cy="18"
              r="2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          aria-label={`Switch to ${themeLabel(theme)} ${modeLabel(theme, nextMode)}`}
          onClick={() => applyMode(nextMode)}
          className="cursor-pointer rounded-md border border-border bg-surface min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors hover:brightness-[var(--hover-brightness)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {isDark ? (
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="8"
                cy="8"
                r="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M14 10A6 6 0 0 1 6 2a6 6 0 1 0 8 8z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        {version &&
          (update ? (
            <a
              href={releaseUrl(update.replace(/^v/, ""))}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-xs text-accent underline underline-offset-2 transition-colors hover:brightness-110 sm:inline"
            >
              {update.replace(/^v/, "")} is available
            </a>
          ) : (
            <a
              href={releaseUrl(version)}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-xs text-muted transition-colors hover:text-accent sm:inline"
            >
              v{version}
            </a>
          ))}
        <button
          onClick={() => signOut()}
          className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors hover:brightness-[var(--hover-brightness)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
