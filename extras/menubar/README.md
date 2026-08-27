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
▮▮▮ 2
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
3. On first launch SwiftBar asks which folder to load plugins from. It has no
   default: you pick one, and `~/SwiftBar` is as good as any. Create it first,
   put the plugin in it, then point SwiftBar at it.

   ```sh
   mkdir -p ~/SwiftBar
   cp extras/menubar/prison.1m.py ~/SwiftBar/
   chmod +x ~/SwiftBar/prison.1m.py
   ```

   Already past that screen? **SwiftBar → Preferences → General** shows the
   folder it settled on and is where you change it;
   `defaults read com.ameba.SwiftBar PluginDirectory` prints it without opening
   anything. Either point SwiftBar at `~/SwiftBar`, or copy the plugin into
   whichever folder it already uses — the plugin does not care which.

4. macOS will ask to allow notifications the first time one fires. Say yes —
   and check **System Settings → Notifications** afterwards, since an app whose
   alert style is *None* stays silent while still looking permitted.

The `1m` in the filename is how often SwiftBar *wakes* the plugin — not how
often it asks GitHub. That is the dashboard's own **Settings → Auto refresh**
interval, which the plugin reads over loopback each time it wakes; in between
it redraws what it drew last time, so the count never blinks and nothing is
spent. One schedule for the account, changed in one place.

A PRison too old to answer that question, or one that is not running, puts the
plugin on 30 minutes — PRison's own default.

## Configuration

- The refresh interval is **not** configured here. It is the dashboard's, in
  Settings → Auto refresh.
- `PRISON_URL` — where PRison is, default `http://localhost:3000`. Set it in
  SwiftBar's per-plugin settings if you moved the port. (`$SWIFTBAR_*`
  variables exist only while a plugin runs; your own shell does not have them.)
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

What was seen last run, what is still unread, when it last fetched, and the
rows it drew all live in
`~/Library/Caches/prison-menubar.json`. Delete it to start over — the next run
seeds itself quietly, as a fresh install does.
