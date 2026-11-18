import type { ReactNode } from "react";

/**
 * The header that folds a section away.
 *
 * Shared by the four tier columns and the two history panels. The count is a
 * slot rather than a prop: a history header counts what was fetched and a work
 * column counts what is on screen (and shows it as its big number, outside this
 * header), and pretending those are one number would be the wrong kind of
 * sharing.
 *
 * The group headers inside PrList are deliberately not a caller. They sit at a
 * different level, carry a repository link beside them, and are lower-case and
 * smaller — sharing this would mean parameterising away everything that makes
 * it this component.
 */
export function DisclosureHeader({
  open,
  onToggle,
  title,
  leading,
  badge,
  trailing,
  controls,
  variant = "column",
  titleClassName,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  /** Before the title: the column's status dot. */
  leading?: ReactNode;
  badge?: ReactNode;
  /** Pushed to the far end: a history panel's one-line summary. */
  trailing?: ReactNode;
  controls?: string;
  /** A column header is a small caps label; a panel header is a sentence-case title. */
  variant?: "column" | "panel";
  /** Overrides the column label colour (the highlighted column takes its tone). */
  titleClassName?: string;
}) {
  const chevron = (
    <svg
      aria-hidden="true"
      className={`shrink-0 text-muted transition-transform ${
        variant === "panel" ? (open ? "-rotate-90" : "rotate-90") : open ? "" : "-rotate-90"
      }`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={variant === "panel" ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-md text-left transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      {variant === "panel" && chevron}
      {leading}
      <h2
        className={
          variant === "panel"
            ? "text-[15px] font-semibold text-foreground"
            : `text-xs font-semibold tracking-[0.08em] uppercase ${titleClassName ?? "text-muted"}`
        }
      >
        {title}
      </h2>
      {badge}
      {trailing && <span className="ml-auto text-xs font-semibold text-muted">{trailing}</span>}
      {variant === "column" && <span className="ml-auto">{chevron}</span>}
    </button>
  );
}
