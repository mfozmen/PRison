#!/usr/bin/env python3
"""PRison in the macOS menu bar, for the notifications Chrome cannot be trusted
to deliver.

A browser notification depends on the browser being open, the tab not being
discarded, the site permission, and four macOS switches. The count in the menu
bar depends on none of that: it is drawn every minute whether or not anything
is allowed to interrupt you.

The count in the bar is what you have not read yet, not what is outstanding:
a banner shows the moment something arrives and is gone whether or not you
were looking, so the menu bar is the other half — it holds what you missed
until you look, and only then goes quiet. The live totals are one click away
in the dropdown.

Reads a PRison that is already running (the Docker container, or `npm run
dev`).

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
import sys
import urllib.error
import urllib.request

URL = os.environ.get("PRISON_URL", "http://localhost:3000").rstrip("/")
# PRison's own icon (app/icon.svg), rasterized at 36x36 for a 2x menu bar.
# Not a template image: this one has a colour, and stamping a green mark flat
# in one tone is a worse likeness than no likeness. It sits at 20px of the
# 36px canvas, because the menu bar scales an image to its height and the
# margin is what keeps the mark the size of its neighbours — a filled square
# reads heavier than the line glyphs around it, so it is drawn smaller than a
# straight size match would suggest.
ICON = (
    "iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAABq0lEQVR4nOyWsUvDQBTGv6vF2mDVqlVRdBERRIqbYhEcXFzdxN3B7gr+AYLudRDcBDdHXQWp6CZBBHERBVEbrVppWhHjvbSTlLw0jaXD/crR1/c+7j5y15cLoMEIoMFQhjiUIQ5liCPoRhRLzbYGIuENS4hF+bMb1WEIy9r/yZnrmeTxJycWnIDMiDYtLcM4akO3PvIJzhS7ZfRkfDBDxMtzOa/HCcrb5Atu5nJzqCueGeGw2w419vy5OtR/2ZlZw/zgNMzvAjKFN/RrpXUe8gZiLR0IB1twdH+K5ZNNVIunv/3Fy400U8Sj+Yr0k45sMWcPiilHNdJ4wZOh7asD+WSyOHu+xOp5Ctfvd/agmHJUI03dDP0nyhCHMsThydDK2ILsN1FM9YxjazKJ0fYhe1BMOaqRxgueGuNE14hsfiH0hTuR6I0jGorYeYpLjTFka+pmiDowvR4s+amEU43DzZYZlZJOCzrUDNRqiC5X8Ak3c7GG6KYnv3TUjl6ey5EmTpA/vP3S5gb2As3BCIQYlikN1UFX2F0rZy75coWtN6pTcyhDHMoQR8MZ+gUAAP//CT9S3QAAAAZJREFUAwBOQI2I0H0ktAAAAABJRU5ErkJggg=="
)
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
            state = json.load(f)
        # Written by an older version, which kept only the seen ids.
        if "seen" not in state:
            return {"seen": state, "unread": []}
        return state
    except (OSError, ValueError):
        return None


def write_state(state):
    try:
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        with open(STATE, "w") as f:
            json.dump(state, f)
    except OSError:
        pass  # a menu bar that cannot cache still counts correctly


def mark_read(ids):
    """Clicking an item is reading it. Called back into by the menu, which is
    why this file takes arguments at all."""
    state = read_state()
    if state is None:
        return
    keep_all = ids == ["all"]
    state["unread"] = [] if keep_all else [u for u in state["unread"] if u["id"] not in ids]
    write_state(state)


def main():
    # The menu calls back in to mark things read: --read <id>… [--open <url>].
    if len(sys.argv) > 1 and sys.argv[1] == "--read":
        rest = sys.argv[2:]
        url = rest[rest.index("--open") + 1] if "--open" in rest else None
        mark_read(rest[: rest.index("--open")] if url else rest)
        if url:
            subprocess.run(["open", url], check=False)
        return

    try:
        cookie = session()
        lists = {path: [i for i in fetch(cookie, path) if keep(path, i)] for path, _, _ in BUCKETS}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        print(f" ! | image={ICON}")
        print("---")
        print(f"PRison is not answering at {URL}")
        print(f"{type(e).__name__} | color=red")
        print(f"Open PRison | href={URL}")
        print("Refresh now | refresh=true")
        return

    previous = read_state()
    seen = {path: [i.get("id") for i in lists[path]] for path, _, _ in BUCKETS}

    # Unread carries over until it is read, minus anything that has left the
    # lists — that one was acted on, and a badge for it is a badge for work
    # already done.
    live = {i.get("id") for path, _, _ in BUCKETS for i in lists[path]}
    unread = [u for u in (previous or {}).get("unread", []) if u["id"] in live]
    known = {u["id"] for u in unread}
    arrived = []
    if previous is not None:  # a first run has nothing to be new against
        for path, _, phrase in BUCKETS:
            if path not in ANNOUNCED:
                continue
            before = set(previous["seen"].get(path, []))
            for item in lists[path]:
                if item.get("id") in before or item.get("id") in known:
                    continue
                arrived.append(
                    {
                        "id": item.get("id"),
                        "line": f"{label(item)} {phrase}",
                        "url": item.get("url", URL),
                    }
                )
    unread += arrived
    write_state({"seen": seen, "unread": unread})
    if arrived:
        notify([a["line"] for a in arrived])

    # SwiftBar runs the plugin by absolute path, but a hand-run relative one
    # would put a broken callback in the menu.
    me = os.path.abspath(sys.argv[0])
    count = f" {len(unread)}" if unread else ""
    print(f"{count} | image={ICON}")
    print("---")
    if unread:
        print(f"Unread ({len(unread)})")
        for u in unread:
            # Opening it is reading it, so the click does both and the badge
            # is never left standing over something you have already seen.
            print(
                f'-- {u["line"]} | bash="{me}" param1=--read param2={u["id"]} '
                f'param3=--open param4={u["url"]} terminal=false refresh=true'
            )
        print(f'Mark all read | bash="{me}" param1=--read param2=all terminal=false refresh=true')
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


main()
