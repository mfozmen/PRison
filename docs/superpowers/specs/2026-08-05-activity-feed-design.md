# Activity feed — a timeline of what changed, inside the page

## Why

PRison already detects every dashboard state change: each poll diffs a status
snapshot and produces a list of events. Those events go two places — a count in
the tab title, and a desktop notification — and both are lossy.

The desktop notification is lossy because the operating system decides
separately from the browser whether it may be displayed, and refuses in
silence. On at least one machine nothing arrives at all despite granted
permission, a healthy secure context, and a `Notification` that constructs
without error. Nothing in the page can fix that.

The tab badge is lossy for a different reason: it clears the moment the tab
regains focus, which is the moment *before* the user has had a chance to read
anything. The count reaches zero without ever having been looked at.

So the events exist, and both surfaces throw them away. This feature keeps
them.

## What it is

A bell in the header that carries an unseen count and pulses while the count is
above zero. Clicking it opens a panel listing the recorded events, newest
first, each naming its repository, PR number, what happened, and how long ago.
Each row links to the PR. The panel is the only thing that marks events seen.

## Data

New module `lib/activity.ts`, pure and independently testable:

- `ActivityEntry` — a `StatusEvent` plus `recordedAt` and `seen`.
- `appendEvents(log, events, now)` — new entries first, capped at
  `MAX_ENTRIES = 100`; the oldest fall off the end.
- `parseActivity(raw)` — defensive: anything that isn't a well-formed array of
  entries reads back as an empty log. Storage is hand-editable and survives
  across versions, so a bad value must degrade to "no history", never throw.
- `unseenCount(log)`, `markAllSeen(log)`.

Persisted at `prison.activity`, matching how every other preference is stored.
100 entries is a few KB — no quota concern.

`StatusEvent` gains a `url`. It carries `repo` and `number` today, and a row
that links to its PR should use the URL the API returned rather than
reconstruct one from the parts. All five source types already carry it.

## Behavior

**What gets recorded.** Every event a poll produces, whether or not the tab is
focused. The feed is a timeline; a change that happened while the user was
looking still belongs in it. The desktop notification keeps its focus
condition — it exists to interrupt, and interrupting someone who is already
looking is noise.

**Seeding.** Unchanged: only a commit that carries a silent poll's results
(`pollGen` moved) records anything. On first load every visible item reads as
new, and flooding the feed with the whole board is exactly what that guard
prevents.

**Unseen.** One count, computed from the log, driving both the bell badge and
the tab title badge. Only opening the panel clears it. The focus-clears-the-
badge effect is removed.

**Notification body.** Today the notification describes every accumulated
unseen event. With unseen surviving until the panel is opened, that would mean
re-announcing old events on every poll. The notification now describes only the
events of the poll that raised it; the accumulated history lives in the feed,
which is the point of the feature.

## Interface

`components/ActivityBell.tsx` owns the button and the panel.

- Button: `aria-label="Activity"`, `aria-expanded`, `aria-controls`. The count
  badge pulses under `motion-safe:` so a reduced-motion preference silences it.
- Panel: closes on Escape, on an outside click, and on a second click of the
  bell; focus returns to the bell.
- Rows: an anchor per entry — repo, number, phrase, relative age — with a dot
  on the unseen ones. The phrase comes from the same table the notification
  uses, so the two can never disagree about what a status means.
- A `Clear all` control empties the log, and an empty state explains what will
  appear.

## Testing

- `lib/activity.test.ts` — append, ordering, the cap, malformed storage, unseen
  counting, marking seen.
- `components/ActivityBell.test.tsx` — badge and its absence, pulse only while
  unseen, open and close by each route, marking seen on open, empty state,
  clear all, link targets.
- `components/Dashboard.test.tsx` — a silent poll appends; first load appends
  nothing; focus no longer clears; opening the panel clears both badges; the
  log survives a remount.

100% coverage on changed files, as everywhere else in this repository.

## Deliberately not built

Per-organization feeds (rows name their repository, which is enough), search or
filtering inside the panel, grouping by day, and any server-side history. Each
is easy to add later and none of them is needed to answer "what changed while I
wasn't looking".
