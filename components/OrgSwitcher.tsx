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
      className="cursor-pointer rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 shadow-sm transition-colors hover:border-slate-600 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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
