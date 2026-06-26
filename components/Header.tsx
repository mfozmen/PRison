"use client";

import { signOut } from "next-auth/react";
import type { Org } from "@/lib/types";
import { OrgSwitcher } from "./OrgSwitcher";

export interface HeaderProps {
  orgs: Org[];
  selectedOrg: string;
  onOrgChange: (login: string) => void;
  login: string;
}

export function Header({ orgs, selectedOrg, onOrgChange, login }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
      <span className="text-xl font-bold text-indigo-600">PRison</span>
      <div className="flex items-center gap-4">
        <OrgSwitcher orgs={orgs} value={selectedOrg} onChange={onOrgChange} />
        <span className="text-sm text-slate-600">Welcome, {login || "there"}</span>
        <button
          onClick={() => signOut()}
          className="rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
