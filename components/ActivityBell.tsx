"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PHRASES } from "@/lib/notify";
import { relativeAge } from "@/lib/prioritize";
import { unseenCount, type ActivityEntry } from "@/lib/activity";

export interface ActivityBellProps {
  entries: readonly ActivityEntry[];
  /** Called when the panel opens. The panel is the only thing that marks the
   * feed read — returning to the tab deliberately does not, because that is
   * the moment *before* the user has had a chance to look. */
  onOpen: () => void;
  onClear: () => void;
}

export function ActivityBell({ entries, onOpen, onClear }: ActivityBellProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const bellRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const unseen = unseenCount(entries);

  // Ages come from render time rather than a timer: the panel is a glance, and
  // the shortest poll interval is five minutes, so the only thing that moves
  // them is a poll landing — which is exactly when they should move.
  const now = new Date();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Escape must not strand focus on a node that just disappeared.
      bellRef.current?.focus();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    onOpen();
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={bellRef}
        type="button"
        aria-label={unseen > 0 ? `Activity, ${unseen} unseen` : "Activity"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="relative cursor-pointer rounded-md border border-border bg-surface min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors hover:brightness-95 dark:hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 1.5a4 4 0 0 0-4 4v2.6L2.8 10.6a.5.5 0 0 0 .45.72h9.5a.5.5 0 0 0 .45-.72L12 8.1V5.5a4 4 0 0 0-4-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        {unseen > 0 && (
          // motion-safe: the pulse is the whole point of the badge, but a
          // reduced-motion preference is a request, not a suggestion — the
          // count alone still carries the news.
          <span className="motion-safe:animate-pulse absolute -top-1.5 -right-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-background">
            {unseen}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Activity"
          className="absolute right-0 top-full z-20 mt-2 w-80 rounded-md border border-border bg-background shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium text-foreground">Activity</span>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="cursor-pointer text-xs text-muted transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Clear all
              </button>
            )}
          </div>
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">
              Nothing yet. When a PR changes state, it shows up here.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {entries.map((entry, i) => (
                <li
                  // recordedAt alone isn't unique — a poll stamps every event
                  // it found with the same instant — and neither is the id,
                  // since the whole point is that a PR appears more than once.
                  key={`${entry.id}-${entry.recordedAt}-${i}`}
                  className="border-b border-border last:border-b-0"
                >
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {/* Colour alone can't carry the unseen state — the dot is
                        invisible to a screen reader and to anyone who can't
                        distinguish it, so the word rides along with it. */}
                    {entry.seen ? (
                      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0" />
                    ) : (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent">
                        <span className="sr-only">Unseen</span>
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {entry.repo} #{entry.number}
                      </span>
                      <span className="block text-xs text-muted">
                        {PHRASES[entry.status]}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {relativeAge(entry.recordedAt, now)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
