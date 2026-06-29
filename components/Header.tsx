"use client";

import { useSyncExternalStore } from "react";
import type { Org } from "@/lib/types";
import { OrgSwitcher } from "./OrgSwitcher";

async function signOut() {
  await fetch("/api/token", { method: "DELETE" });
  window.location.reload();
}

function subscribeToTheme(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getServerThemeSnapshot(): boolean {
  return false;
}

export interface HeaderProps {
  orgs: Org[];
  selectedOrg: string;
  onOrgChange: (login: string) => void;
  login: string;
}

export function Header({ orgs, selectedOrg, onOrgChange, login }: HeaderProps) {
  const isDark = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function toggleTheme() {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("prison.theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("prison.theme", "dark");
    }
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded bg-accent font-mono text-sm font-bold text-background"
        >
          P
        </span>
        <span className="text-lg font-bold tracking-tight text-foreground">PRison</span>
      </div>
      <div className="flex items-center gap-4">
        <OrgSwitcher orgs={orgs} value={selectedOrg} onChange={onOrgChange} login={login} />
        <span className="hidden text-sm text-muted sm:inline">
          {login || "there"}
        </span>
        <button
          type="button"
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggleTheme}
          className="cursor-pointer rounded-md border border-border bg-surface min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors hover:brightness-95 dark:hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {isDark ? (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          ) : (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 10A6 6 0 0 1 6 2a6 6 0 1 0 8 8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </button>
        <button
          onClick={() => signOut()}
          className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors hover:brightness-95 dark:hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
