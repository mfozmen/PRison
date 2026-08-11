import type { ReactNode } from "react";

/**
 * The header that folds a section away: chevron, title, count.
 *
 * Extracted because the board had two copies of it and was about to grow a
 * third — the history sections at the foot of the page and the four work
 * sections above them. The count is a slot rather than a prop: a history
 * header counts what was fetched and a work header counts what is on screen,
 * with different colours for each, and pretending those are one number would
 * be the wrong kind of sharing.
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
  badge,
  controls,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  badge: ReactNode;
  controls?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-md text-left transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <svg
        aria-hidden="true"
        className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4 2.5 8 6l-4 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      {badge}
    </button>
  );
}
