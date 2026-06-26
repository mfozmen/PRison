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
      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      aria-label="Select organization"
    >
      {orgs.map((org) => (
        <option key={org.login} value={org.login}>
          {org.login}
        </option>
      ))}
    </select>
  );
}
