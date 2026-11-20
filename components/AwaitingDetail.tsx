import { relativeAge } from "@/lib/prioritize";
import type { AwaitingPr, Reviewer } from "@/lib/types";

// Where each reviewer stands, in words and in the board's colours: a pending
// request is the wait itself (warning), a re-review the author has earned is
// the reviewer's move (accent), an approval is done (success), a comment with
// no verdict is just information (muted).
function stateText(r: Reviewer, now: Date): { text: string; className: string } {
  switch (r.state) {
    case "requested":
      return { text: `no review yet · ${relativeAge(r.since, now)}`, className: "text-warning" };
    case "changes":
      return r.pushedSince
        ? { text: "asked for changes · you've pushed since", className: "text-accent" }
        : { text: "asked for changes", className: "text-danger" };
    case "approved":
      return { text: "approved", className: "text-success" };
    default:
      return { text: "commented, no verdict", className: "text-muted" };
  }
}

export function AwaitingDetail({
  pr,
  now,
  copied,
  onCopy,
}: {
  pr: AwaitingPr;
  now: Date;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1" aria-label="Reviewers">
        {pr.reviewers.map((r) => {
          const st = stateText(r, now);
          return (
            <li key={r.name} className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border text-[10px] font-semibold uppercase text-foreground"
              >
                {r.name.replace(/^.*\//, "").slice(0, 1)}
              </span>
              <span className="truncate font-mono text-xs text-foreground">@{r.name}</span>
              <span className={`text-xs ${st.className}`}>{st.text}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 self-start rounded-lg border border-accent/60 px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          Copy reminder
        </button>
        {/* Said once, politely: the button keeps its name, and the status line
            tells a screen reader the text is on the clipboard. */}
        <span role="status" className="text-xs text-success">
          {copied ? "Copied — paste it where your team talks" : ""}
        </span>
      </div>
    </div>
  );
}
