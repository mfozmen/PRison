"use client";

import { useState, useEffect, useRef } from "react";
import type { Org } from "@/lib/types";
import type { TrackedChecks } from "@/lib/tracked-checks";

export interface TrackedChecksSettingsProps {
  orgs: Org[];
  value: TrackedChecks;
  onChange: (next: TrackedChecks) => void;
  open: boolean;
  onClose: () => void;
}

interface RepoRow {
  repo: string;
  checks: string;
}

function parseChecks(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function seedOrgDrafts(orgs: Record<string, string[]>): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const [login, checks] of Object.entries(orgs)) {
    drafts[login] = checks.join(", ");
  }
  return drafts;
}

function seedRows(repos: Record<string, string[]>): RepoRow[] {
  return Object.entries(repos).map(([repo, checks]) => ({
    repo,
    checks: checks.join(", "),
  }));
}

export function TrackedChecksSettings({
  orgs,
  value,
  onChange,
  open,
  onClose,
}: TrackedChecksSettingsProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Raw input drafts are buffered locally so the user can freely type
  // commas/spaces; we only parse into string[] when pushing changes up.
  const [orgDrafts, setOrgDrafts] = useState<Record<string, string>>(() =>
    seedOrgDrafts(value.orgs),
  );

  const [rows, setRows] = useState<RepoRow[]>(() => seedRows(value.repos));

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
      setOrgDrafts(seedOrgDrafts(value.orgs));
      setRows(seedRows(value.repos));
    }
  }

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus management: focus close button when modal opens
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  function handleOrgChange(orgLogin: string, inputValue: string) {
    setOrgDrafts((prev) => ({ ...prev, [orgLogin]: inputValue }));
    const parsed = parseChecks(inputValue);
    onChange({ ...value, orgs: { ...value.orgs, [orgLogin]: parsed } });
  }

  function rebuildAndNotify(newRows: RepoRow[]) {
    const newRepos: Record<string, string[]> = {};
    for (const row of newRows) {
      if (row.repo.trim()) {
        newRepos[row.repo.trim()] = parseChecks(row.checks);
      }
    }
    onChange({ ...value, repos: newRepos });
  }

  function handleRowChange(
    index: number,
    field: "repo" | "checks",
    inputValue: string,
  ) {
    const newRows = rows.map((row, i) =>
      i === index ? { ...row, [field]: inputValue } : row,
    );
    setRows(newRows);
    rebuildAndNotify(newRows);
  }

  function addRow() {
    setRows([...rows, { repo: "", checks: "" }]);
  }

  function removeRow(index: number) {
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    rebuildAndNotify(newRows);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16"
      onClick={onClose}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header row */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Tracked checks</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close tracked checks settings"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Intro */}
        <p className="mb-6 text-sm text-muted">
          Name the required checks each PR needs (e.g. a manual qa/smoke).
          We&apos;ll show them as Awaiting until they report — handy for gates
          GitHub doesn&apos;t expose.
        </p>

        {/* Organization defaults */}
        {orgs.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Organization defaults
            </h3>
            <div className="space-y-3">
              {orgs.map((org) => (
                <div key={org.login} className="flex flex-col gap-1">
                  <label
                    className="text-sm text-muted"
                    htmlFor={`org-input-${org.login}`}
                  >
                    {org.login}
                  </label>
                  <input
                    id={`org-input-${org.login}`}
                    type="text"
                    aria-label={`${org.login} check names`}
                    placeholder="e.g. qa/smoke, Automation Result"
                    value={orgDrafts[org.login] ?? ""}
                    onChange={(e) => handleOrgChange(org.login, e.target.value)}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Repository overrides */}
        <section>
          <h3 className="mb-2 text-sm font-medium text-foreground">
            Repository overrides
          </h3>
          <p className="mb-3 text-xs text-muted">
            A repo override replaces the org default for that repo.
          </p>
          <div className="mb-3 space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label="Repository name"
                  placeholder="owner/repo"
                  value={row.repo}
                  onChange={(e) =>
                    handleRowChange(index, "repo", e.target.value)
                  }
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="text"
                  aria-label="Check names for this repo override"
                  placeholder="e.g. qa/smoke"
                  value={row.checks}
                  onChange={(e) =>
                    handleRowChange(index, "checks", e.target.value)
                  }
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  aria-label="Remove repo override"
                  onClick={() => removeRow(index)}
                  className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
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
          </div>
          <button
            type="button"
            onClick={addRow}
            className="min-h-[44px] cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:brightness-110"
          >
            Add override
          </button>
        </section>
      </div>
    </div>
  );
}
