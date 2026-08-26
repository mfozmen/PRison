# PRison in the menu bar

A browser notification has to survive a lot: the browser open, the tab not
discarded, the site permission granted, and four separate macOS switches. When
one of those is off nothing tells you — the notification is simply never drawn.

And a banner that does arrive is gone in seconds, whether or not you were
looking at the screen — miss it and you have missed it.

`prison.1m.py` is the other half of that. The number in the menu bar is what
you have **not read yet**: it appears when something lands, and it stays until
you click it, however long that takes. The live totals — what is outstanding
right now, which is a different question — sit in the dropdown underneath.

```
🔒 2
  Unread (2)
    acme/web #58 is ready to merge
    globex/api #7 needs your review
    Mark all read
  ─────────────
  Ready to merge: 1
  Waiting on your review: 3
    acme/web #58   Document the deploy rollback steps
    …
  Comments awaiting reply: 0
  Stuck on checks: 1
```

Clicking an unread row opens the PR and reads it in one go, so the badge is
never left standing over something you have already looked at. An item that
leaves the lists — you merged it, you replied — drops out of unread by itself:
a badge for finished work is worse than no badge.

## Install

1. A PRison has to be running — the Docker container from the README, or
   `npm run dev`. The plugin reads it over loopback and mints its session from
   `/api/token/env`, so it never needs a token of its own.
2. `brew install --cask swiftbar` (or xbar — the plugin format is the same).
3. On first launch SwiftBar asks for a plugin folder. Copy the plugin in:

   ```sh
   cp extras/menubar/prison.1m.py "$SWIFTBAR_PLUGIN_FOLDER"/
   chmod +x "$SWIFTBAR_PLUGIN_FOLDER"/prison.1m.py
   ```

4. macOS will ask to allow notifications the first time one fires. Say yes —
   and check **System Settings → Notifications** afterwards, since an app whose
   alert style is *None* stays silent while still looking permitted.

The `1m` in the filename is the refresh interval. Rename it (`prison.5m.py`)
to poll less often.

## Configuration

- `PRISON_URL` — where PRison is, default `http://localhost:3000`. SwiftBar
  passes its own environment through, so set it in SwiftBar's plugin settings
  if you moved the port.
- `PER_BUCKET` at the top of the file — how many PRs each section lists. The
  count next to the heading is always exact.

## What it notifies about

The three lists where somebody is waiting on you: ready to merge, waiting on
your review, and comments awaiting reply. Stuck-on-checks PRs are yours and you
already know about them, so they are shown but never announced.

A notification fires — and an unread row appears — for a PR that was not in
that list last run, not for the count changing, so one PR moving between lists
does not announce itself twice. The first run after installing announces
nothing and starts with an empty badge: everything is new the first time, and
saying so is noise.

Wording matches the dashboard's own notifications, so the same event does not
read as two different things depending on where you saw it.

What was seen last run, and what is still unread, live in
`~/Library/Caches/prison-menubar.json`. Delete it to start over — the next run
seeds itself quietly, as a fresh install does.
