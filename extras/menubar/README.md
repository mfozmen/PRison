# PRison in the menu bar

A browser notification has to survive a lot: the browser open, the tab not
discarded, the site permission granted, and four separate macOS switches. When
one of those is off nothing tells you — the notification is simply never drawn.

`prison.1m.py` puts the same counts in the menu bar, where nothing has to be
allowed for you to see them, and sends a native notification when something
new lands.

```
🔒 3
  Ready to merge: 0
  Waiting on your review: 3
    acme/web #58   Document the deploy rollback steps
    …
  Comments awaiting reply: 0
  Stuck on checks: 1
```

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

A notification fires for a PR that was not in that list last run — not for the
count changing, so one PR moving between lists does not announce itself twice.
The first run after installing announces nothing: everything is new the first
time, and saying so is noise.

Wording matches the dashboard's own notifications, so the same event does not
read as two different things depending on where you saw it.

Ids seen last run are cached in `~/Library/Caches/prison-menubar.json`. Delete
it to start over.
