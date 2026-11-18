import type { Org } from "@/lib/types";

export interface OrgSwitcherProps {
  orgs: Org[];
  login: string;
  value: string;
  onChange: (login: string) => void;
}

export function OrgSwitcher({ orgs, login, value, onChange }: OrgSwitcherProps) {
  return (
    // A native select keeps the platform's own keyboard and screen-reader
    // behaviour; only its arrow is swapped for the board's chevron.
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 cursor-pointer appearance-none rounded-[10px] border border-border bg-surface pl-3.5 pr-9 text-sm font-medium text-foreground transition-colors hover:border-border/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        aria-label="Filter by organization"
      >
        <option value="">All organizations</option>
        <option value={login}>{login} (you)</option>
        {orgs.map((org) => (
          <option key={org.login} value={org.login}>
            {org.login}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
