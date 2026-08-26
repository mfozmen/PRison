#!/usr/bin/env python3
"""PRison in the macOS menu bar, for the notifications Chrome cannot be trusted
to deliver.

A browser notification depends on the browser being open, the tab not being
discarded, the site permission, and four macOS switches. The count in the menu
bar depends on none of that: it is drawn every minute whether or not anything
is allowed to interrupt you.

Reads a PRison that is already running (the Docker container, or `npm run
dev`). Nothing is stored but the ids seen last run, so a notification fires
once, for the thing that actually changed.

Install: see extras/menubar/README.md.
"""
# <xbar.title>PRison</xbar.title>
# <xbar.version>v1</xbar.version>
# <xbar.author>PRison</xbar.author>
# <xbar.author.github>mfozmen</xbar.author.github>
# <xbar.desc>Open-PR counts from a local PRison, and a native notification when one lands.</xbar.desc>
# <xbar.dependencies>python3</xbar.dependencies>
# <xbar.abouturl>https://github.com/mfozmen/PRison</xbar.abouturl>

import json
import os
import subprocess
import urllib.error
import urllib.request

URL = os.environ.get("PRISON_URL", "http://localhost:3000").rstrip("/")
STATE = os.path.expanduser("~/Library/Caches/prison-menubar.json")
PER_BUCKET = 5  # rows per section in the dropdown; the count is always exact
MAX_LINES = 3  # notification lines before "+N more", as the dashboard does it

# Each bucket: the endpoint, the heading, how a row reads, and what a
# notification about it says. The phrasing is the dashboard's, so the same
# event does not read as two different things depending on where you saw it.
BUCKETS = [
    ("ready-to-merge", "Ready to merge", "is ready to merge"),
    ("review-requests", "Waiting on your review", "needs your review"),
    ("pr-comments", "Comments awaiting reply", "— new reply"),
    ("stuck-prs", "Stuck on checks", "— checks to look at"),
]
# Stuck PRs are yours and you already know about them; they are shown, not
# announced. The three above are the ones where somebody is waiting on you.
ANNOUNCED = {"ready-to-merge", "review-requests", "pr-comments"}


def session():
    """A session against the local PRison. `/api/token/env` mints the cookie
    from the container's own GITHUB_TOKEN, and only answers loopback — so this
    needs no token of its own and none is stored here.

    The header is carried by hand rather than by http.cookiejar, which files a
    cookie set by `localhost` under `localhost.local` and then never sends it
    back — the one host this plugin is ever pointed at."""
    with urllib.request.urlopen(
        urllib.request.Request(f"{URL}/api/token/env", method="POST"), timeout=15
    ) as res:
        jar = [c.split(";", 1)[0] for c in res.headers.get_all("Set-Cookie") or []]
    return "; ".join(jar)


def fetch(cookie, path):
    req = urllib.request.Request(f"{URL}/api/{path}", headers={"Cookie": cookie})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def keep(path, item):
    """The dashboard's own defaults: drafts are not a review request, and a bot
    comment or one you have already reacted to is not waiting on you."""
    if path == "review-requests":
        return not item.get("isDraft")
    if path == "pr-comments":
        return not item.get("isBot") and not item.get("viewerReacted")
    return True


def label(item):
    return f"{item.get('repo', '?')} #{item.get('number', '?')}"


def notify(lines):
    body = "\n".join(lines[:MAX_LINES])
    if len(lines) > MAX_LINES:
        body += f"\n+{len(lines) - MAX_LINES} more"
    # Arguments, not an interpolated script: a PR title is somebody else's text
    # and has no business being read as AppleScript.
    subprocess.run(
        [
            "osascript",
            "-e", "on run {t, m}",
            "-e", "display notification m with title t",
            "-e", "end run",
            "--", "PRison", body,
        ],
        check=False,
    )


def read_state():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def main():
    try:
        cookie = session()
        lists = {path: [i for i in fetch(cookie, path) if keep(path, i)] for path, _, _ in BUCKETS}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        print("🔒 !")
        print("---")
        print(f"PRison is not answering at {URL}")
        print(f"{type(e).__name__} | color=red")
        print(f"Open PRison | href={URL}")
        print("Refresh now | refresh=true")
        return

    waiting = sum(len(lists[p]) for p in ANNOUNCED)
    print(f"🔒 {waiting}" if waiting else "🔒")
    print("---")
    for path, heading, _ in BUCKETS:
        items = lists[path]
        print(f"{heading}: {len(items)} | href={URL}")
        for item in items[:PER_BUCKET]:
            title = str(item.get("title") or item.get("preview") or "").replace("|", "¦")
            print(f"-- {label(item)}  {title[:70]} | href={item.get('url', URL)}")
    print("---")
    print(f"Open PRison | href={URL}")
    print("Refresh now | refresh=true")

    # Ids seen last time, per bucket. A first run seeds them without saying
    # anything: everything is new the first time, and announcing all of it is
    # noise, not news.
    previous = read_state()
    current = {path: [i.get("id") for i in lists[path]] for path, _, _ in BUCKETS}
    if previous is not None:
        lines = []
        for path, _, phrase in BUCKETS:
            if path not in ANNOUNCED:
                continue
            seen = set(previous.get(path, []))
            for item in lists[path]:
                if item.get("id") not in seen:
                    lines.append(f"{label(item)} {phrase}")
        if lines:
            notify(lines)
    try:
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        with open(STATE, "w") as f:
            json.dump(current, f)
    except OSError:
        pass  # a menu bar that cannot cache still counts correctly


main()
