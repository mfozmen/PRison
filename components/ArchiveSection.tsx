import type { ReactNode } from "react";
import { DisclosureHeader } from "./DisclosureHeader";

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
      <DisclosureHeader
        open={open}
        onToggle={onToggle}
        title={title}
        badge={
          <span
            data-testid={countTestId}
            className="rounded-full bg-border px-2 py-0.5 font-mono text-xs tabular-nums text-foreground ring-1 ring-inset ring-border"
          >
            {count}
          </span>
        }
      />
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
