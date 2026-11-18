import type { ReactNode } from "react";
import { DisclosureHeader } from "./DisclosureHeader";

export interface ArchiveSectionProps {
  title: string;
  /** Anchor target for the section index. */
  id: string;
  count: number;
  countTestId: string;
  open: boolean;
  onToggle: () => void;
  error: string | null;
  onRetry: () => void;
  /** One line at the far end of the header, e.g. "1 updated since". */
  summary?: ReactNode;
  children: ReactNode;
}

// One of the two history panels at the foot of the board. Not a PrList: a
// PrList's count is what is rendered, while these headers count what was
// fetched — the panels reveal their rows a page at a time, and the number in
// the header is the answer to "how much is back there", not "how much is on
// screen". Quieter than a tier column on purpose: history, not work.
export function ArchiveSection({
  title,
  id,
  count,
  countTestId,
  open,
  onToggle,
  error,
  onRetry,
  summary,
  children,
}: ArchiveSectionProps) {
  return (
    // tabIndex is what makes this a jump target rather than a scroll position:
    // the browser moves the caret here too, so the next Tab continues inside the
    // section instead of at the top of the page.
    <section
      id={id}
      tabIndex={-1}
      className="flex scroll-mt-4 flex-col rounded-[20px] border border-border bg-[color-mix(in_srgb,var(--surface)_45%,var(--bg))] focus:outline-none"
    >
      <div className={`px-6 py-[5px] ${open ? "border-b border-border" : ""}`}>
        <DisclosureHeader
          variant="panel"
          open={open}
          onToggle={onToggle}
          title={title}
          trailing={summary}
          badge={
            <span
              data-testid={countTestId}
              className="rounded-full bg-border px-2 py-px text-xs font-medium leading-[normal] tabular-nums text-muted"
            >
              {count}
            </span>
          }
        />
      </div>
      {/* Outside the open/closed branch on purpose: a section that failed to
          load says so whether or not it is expanded, the same as every list. */}
      {error && (
        <div className="mx-6 my-3 flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button
            onClick={onRetry}
            className="ml-4 cursor-pointer rounded bg-danger/20 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
          >
            Retry
          </button>
        </div>
      )}
      {open && <div className="px-6 pb-2 pt-1">{children}</div>}
    </section>
  );
}
