export interface SectionLink {
  id: string;
  label: string;
  count: number;
}

/**
 * Where everything is, in the order it appears.
 *
 * The board has six sections and outgrew one screen, so the ones at the foot of
 * it were costing a scroll nobody made. This replaces the arrangement that
 * shipped first — three summary tiles that doubled as links plus a trailing
 * "jump to archives" for the two sections no tile covered. Four sections
 * reachable by one rule and two by another is not an index; it is a patch over
 * the fact that the tiles were never one. Tiles are a warning row: *Ready to
 * merge* is deliberately absent from them, and the histories never belonged.
 *
 * So every section is listed here by the same rule, with the count it carries in
 * its own header, and the tiles go back to doing only what they are good at.
 *
 * Plain anchors, no JavaScript: the browser moves focus as well as the viewport
 * when the target is focusable, scroll-behavior is a stylesheet concern, and the
 * history entry an anchor pushes is why there is no "back to top" control.
 */
export function SectionIndex({ sections }: { sections: SectionLink[] }) {
  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-2">
      {sections.map(({ id, label, count }) => (
        <a
          key={id}
          href={`#${id}`}
          data-testid="section-link"
          className="flex min-h-[44px] items-center gap-2 rounded-md bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {label}
          {/* The same count the section's own header shows, so the index never
              tells you a section is worth opening when it is empty. */}
          <span className="rounded-full bg-border px-2 py-0.5 font-mono text-xs tabular-nums text-muted">
            {count}
          </span>
        </a>
      ))}
    </nav>
  );
}
