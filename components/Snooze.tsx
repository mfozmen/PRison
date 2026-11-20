import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SNOOZE_CHOICES, wakeLabel, type Snooze, type SnoozeChoice } from "@/lib/snooze";

const Moon = () => (
  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

/** The moon on a row: opens "Snooze until…" and reports the choice. */
export function SnoozeMenu({ title, onSnooze }: { title: string; onSnooze: (c: SnoozeChoice) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Closes on a click elsewhere or on Escape, and gives focus back to the
  // moon, so the keyboard is never left on a menu that is gone.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Snooze ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Snooze — not today"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
          open ? "border-accent text-accent" : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        <Moon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Snooze until"
          className="absolute right-0 top-9 z-20 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)]"
        >
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted">SNOOZE UNTIL</div>
          {SNOOZE_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSnooze(c.value);
              }}
              className="flex min-h-9 w-full cursor-pointer items-center rounded-lg px-2.5 text-left text-sm text-foreground hover:bg-accent/15 focus-visible:bg-accent/15 focus-visible:outline-none"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** The folded list at the foot of a column: what is asleep, when it wakes, and
 * a Wake button. Never hidden entirely, so a snooze can't lose an item. */
export function SnoozedFold({
  items,
  onWake,
}: {
  items: { id: string; title: string; repo: string; number: number; snooze: Snooze }[];
  onWake: (id: string) => void;
}): ReactNode {
  if (items.length === 0) return null;
  return (
    <details className="border-t border-border pt-3">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-[13px] text-muted hover:text-foreground">
        <Moon />
        <span>Snoozed</span>
        <span className="rounded-full bg-border px-2 text-xs text-foreground">{items.length}</span>
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 opacity-80">
              <div className="truncate text-[13px] text-foreground">{it.title}</div>
              <div className="font-mono text-xs text-muted">
                {it.repo} #{it.number} · {wakeLabel(it.snooze)}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Wake ${it.title}`}
              onClick={() => onWake(it.id)}
              className="min-h-8 shrink-0 cursor-pointer rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:brightness-[var(--hover-brightness)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              Wake
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
