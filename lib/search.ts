/**
 * The board's one search box, as a predicate.
 *
 * Substring, case-insensitive, every term must match — `payment 482` finds the
 * payment PR numbered 482. No fuzzy matching, no operators: this filters rows
 * that are already on the page, and a query language implies a corpus bigger
 * than the fifty rows per list GitHub actually returned.
 */

/** Lower-cased, whitespace-split. Empty query → no terms → everything matches. */
export function parseTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * True when every term appears somewhere in the fields given.
 *
 * Fields are joined rather than tested one at a time so a term can match any of
 * them while a second term matches another — which is what "all terms match"
 * has to mean for `acme 482` to work.
 */
export function matches(
  terms: string[],
  ...fields: Array<string | number | string[] | undefined>
): boolean {
  if (terms.length === 0) return true;
  const hay = fields
    .flat()
    .filter((f) => f !== undefined && f !== "")
    .join(" ")
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
}
