"use client";

import type { Org } from "@/lib/types";
import { OrgSwitcher } from "./OrgSwitcher";

async function signOut() {
  await fetch("/api/token", { method: "DELETE" });
  window.location.reload();
}

export interface HeaderProps {
  orgs: Org[];
  selectedOrg: string;
  onOrgChange: (login: string) => void;
  login: string;
}

export function Header({ orgs, selectedOrg, onOrgChange, login }: HeaderProps) {
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
        <OrgSwitcher orgs={orgs} value={selectedOrg} onChange={onOrgChange} />
        <span className="hidden text-sm text-muted sm:inline">
          {login || "there"}
        </span>
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
