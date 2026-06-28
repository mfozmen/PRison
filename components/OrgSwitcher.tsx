import type { Org } from "@/lib/types";

export interface OrgSwitcherProps {
  orgs: Org[];
  value: string;
  onChange: (login: string) => void;
}

export function OrgSwitcher({ orgs, value, onChange }: OrgSwitcherProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground shadow-sm transition-colors hover:border-border/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      aria-label="Filter by organization"
    >
      <option value="">All organizations</option>
      {orgs.map((org) => (
        <option key={org.login} value={org.login}>
          {org.login}
        </option>
      ))}
    </select>
  );
}
