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
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded bg-green-500 font-mono text-sm font-bold text-slate-950"
        >
          P
        </span>
        <span className="text-lg font-bold tracking-tight text-slate-100">PRison</span>
      </div>
      <div className="flex items-center gap-4">
        <OrgSwitcher orgs={orgs} value={selectedOrg} onChange={onOrgChange} />
        <span className="hidden text-sm text-slate-400 sm:inline">
          {login || "there"}
        </span>
        <button
          onClick={() => signOut()}
          className="cursor-pointer rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
