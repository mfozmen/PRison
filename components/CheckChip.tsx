"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface CheckChipProps {
  name: string;
  /** How the board reads this check right now. `muted` is the dashed, colourless
   * chip: still there to be read, but drawing no attention — what a check the
   * user cannot be blocked by should look like. */
  tone: "danger" | "warning" | "muted";
  ignored: boolean;
  /** What the chip says out loud, when that is more than the name — "Awaiting:
   * build". The ignored suffix is added on top of it. */
  description?: string;
  icon?: React.ReactNode;
  onToggleIgnore: () => void;
}

const TONE = {
  danger:
    "bg-danger/10 text-danger ring-1 ring-inset ring-danger/30 rounded px-1.5 py-0.5 text-xs font-medium",
  warning:
    "bg-warning/10 text-warning ring-1 ring-inset ring-warning/30 rounded px-1.5 py-0.5 text-xs font-medium",
  muted:
    "rounded border border-dashed border-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted",
} as const;

/**
 * A check name on a PR card, with the menu that writes it off.
 *
 * A broken check is discovered on the board, not in Settings, so that is where
 * throwing it out has to be possible. Right-click is the gesture the user asked
 * for; an ordinary click opens the same menu, because a right-click-only
 * affordance is one nobody finds and nobody on a keyboard can reach at all.
 */
export function CheckChip({ name, tone, ignored, description, icon, onToggleIgnore }: CheckChipProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const chipRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const label = `${description ?? name}${ignored ? " — ignored" : ""}`;

  // Opening a menu and leaving focus on the button behind it means anyone
  // without a mouse has to guess that Tab is what reaches what they opened.
  useEffect(() => {
    if (open) itemRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Escape must not strand focus on a node that just disappeared.
      chipRef.current?.focus();
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

  return (
    <span ref={wrapperRef} className="relative inline-flex">
      <button
        ref={chipRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className={`inline-flex cursor-pointer items-center gap-1 transition-colors hover:brightness-[var(--hover-brightness)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${TONE[tone]}`}
      >
        {icon}
        {name}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={name}
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-background py-1 shadow-lg"
        >
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleIgnore();
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {ignored ? "Stop ignoring" : "Ignore this check"}
          </button>
          <p className="px-3 pt-1 text-[11px] leading-snug text-muted">
            {ignored
              ? "Its result counts again on every PR in this repo."
              : "Its result stops counting on every PR in this repo. Settings → Ignored checks lists them."}
          </p>
        </div>
      )}
    </span>
  );
}
