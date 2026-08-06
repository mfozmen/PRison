import type { ReactNode } from "react";

export interface ArchiveSectionProps {
  title: string;
  count: number;
  countTestId: string;
  open: boolean;
  onToggle: () => void;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}

// The disclosure chrome shared by the two history sections at the foot of the
// board. Not a PrList: a PrList's badge counts what is rendered, while these
// headers count what was fetched — the sections reveal their rows a page at a
// time, and the number in the header is the answer to "how much is back there",
// not "how much is on screen".
export function ArchiveSection({
  title,
  count,
  countTestId,
  open,
  onToggle,
  error,
  onRetry,
  children,
}: ArchiveSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
          <path d="M4 2.5 8 6l-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </h2>
        <span
          data-testid={countTestId}
          className="rounded-full bg-border px-2 py-0.5 font-mono text-xs tabular-nums text-foreground ring-1 ring-inset ring-border"
        >
          {count}
        </span>
      </button>
      {/* Outside the open/closed branch on purpose: a section that failed to
          load says so whether or not it is expanded, the same as every list. */}
      {error && (
        <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button
            onClick={onRetry}
            className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
          >
            Retry
          </button>
        </div>
      )}
      {open && children}
    </div>
  );
}
