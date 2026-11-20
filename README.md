# PRison

[![CI](https://github.com/mfozmen/PRison/actions/workflows/ci.yml/badge.svg)](https://github.com/mfozmen/PRison/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=coverage)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Docker Pulls](https://img.shields.io/docker/pulls/mfozmen/prison)](https://hub.docker.com/r/mfozmen/prison)

A read-only GitHub dashboard for the pull requests waiting on you, and on the
people you are waiting on — and for how long. It runs on your own machine, reads
your personal account and every organization you can access, and never writes
anything back to GitHub.

**[What it shows](#what-it-shows)** ·
**[Features](#features)** ·
**[Getting started](#getting-started)** ·
**[Settings](#settings)** ·
**[Controls](#controls)** ·
**[Docs](#documentation)**

![The PRison dashboard in dark mode. A Next move card on top points at the oldest item, 4d and stalled, a PR stuck on lint and typecheck, with an I have choice of 5 min, 15 min, 1 hour or Any, a Re-run failed checks button and Skip. Under it, 12 things want you sits beside grouping and draft toggles, a search box and Refresh. Five columns follow, each with a big count and its oldest wait: Stuck on checks, Waiting on your review with a size chip like ~15 min · 84 lines · 3 files on each row, Awaiting your reply, Ready to merge, and Waiting on others, where each PR lists its reviewers and where they stand, with a Copy reminder button. Every row has a moon to snooze it. At the foot, History opens with a This week card — median wait before your review, reviews you gave, PRs you reviewed, the longest wait — and a bar per day, above the folded Recently reviewed and Recently merged / closed panels](docs/screenshot.png)

## What it shows

Five columns, oldest first, with a **[Next move](#next-move)** card above them
pointing at the one thing to do first.

| Column | What's in it |
| --- | --- |
| **Stuck on checks** | Your PRs that CI, a conflict or a branch rule is holding back, with the reason on each row. |
| **Waiting on your review** | PRs where a teammate is blocked on you, each with a rough [review time](#next-move). |
| **Awaiting your reply** | Review comments where the last word isn't yours — on your PRs and on the threads you raised. [More](#comments-and-reviews) |
| **Ready to merge** | Approved, green, mergeable. An out-of-date branch still counts, with **Needs update**. |
| **Waiting on others** | Your PRs that wait on somebody else's review: who, and how long. [More](#waiting-on-others) |

Underneath, quieter on purpose, **History**: a [weekly look back](#looking-back)
at your reviewing, the PRs you reviewed (with your verdict, and **Updated
since** when the author pushed after it), and your merged or closed PRs.

A PR is only ever in one column. Columns stack on a narrow screen.

## Features

### Next move

The card on top points at the longest wait across your four queues, says why
(the red checks, the conflict, who is blocked), and puts its one action a click
away.

- **Pace.** The time block reads **moving** under a day, **slowing** up to
  three, **stalled** after — in colour, in words and on a three-step meter.
- **Skip** steps to the next oldest ("2 of 12") and wraps after the last. The
  column holding the item is tinted and the row is marked **↑ next move**: the
  card is a pointer, never another list.
- **I have 5 min / 15 min / 1 hour / Any.** Tell it how long you have and it
  picks the longest wait that *fits*, so a spare quarter hour clears something
  instead of opening a review you can't finish. Each review gets a rough time
  from its diff — `~15 min · 84 lines · 3 files` — shown on the card and on its
  row. If nothing fits, it says so and shows the longest wait. **Any** is the
  longest wait first.
- Each theme gives the card a spot colour of its own under a soft aurora, so it
  stands apart from the board.

### Waiting on others

The other half of the queue: your PRs that wait on a reviewer. Each row names
its reviewers and where each one stands — **no review yet**, **commented, no
verdict**, **asked for changes · you've pushed since** (their move again),
**approved** — and how long it has been.

**Copy reminder** puts a short, polite nudge on your clipboard, ready to paste
into Slack or a comment. PRison never posts it.

A stuck PR whose only blocker is a review moves here, because it waits on a
person. One with any other blocker stays stuck. These PRs are not counted in
"N things want you", since the move isn't yours.

### Comments and reviews

- **An inline thread waits on you** when it is unresolved and its last comment
  isn't yours. A question left in the body of a review waits until you say
  something on the PR after it. Rows say which kind they are, because the two
  are answered in different places, and open the comment itself.
- **A reaction or Mark as seen** dismisses a thread until someone replies.
- **Bots** write most review comments, so they stay hidden unless you turn
  them on.

### Checks: tracked and ignored

- **Tracked checks → Awaiting.** GitHub hides "expected" required checks (a
  manual `qa/smoke`, say) from non-admins. Name the checks you care about, per
  owner or per repo, and PRison shows **⏳ Awaiting: name** until they report.
  Tick **Required** and the check holds the PR out of _Ready to merge_; leave it
  unticked and it is shown dashed, for information.
- **Ignored checks.** A check that is broken rather than failing — the flaky
  one, another team's. Right-click its chip and choose **Ignore this check**: it
  stays on the card, muted, but stops holding the PR back and never gets a
  _By check_ bucket. A conflict or a review still holds the PR.

Both live in **Settings → Checks**, one owner/repo picker over the two lists.

### Snooze and wait limits

- **Snooze.** The moon on every row puts it off until **tomorrow 9:00**,
  **Monday 9:00**, or **until it changes** — a new commit, a re-request, a
  reply. A snoozed row leaves its column, the count and the Next move, and
  waits folded at the foot of the column with when it wakes and a **Wake**
  button.
- **Wait limits.** Say how long each queue may wait — a review 24 hours, a
  reply 8 — and every row gets a thin bar filling toward it, **Due in 6h** from
  three quarters of the way, and **Late · 1d over** after. The heading counts
  what is late. Off until you set one, in **Settings → Limits**.

Both live in this browser and cost nothing from GitHub.

### Staying up to date

- **Auto refresh (opt-in)** every 5, 15 or 30 minutes, or hourly. PRison says
  what *moved*, not just what's new: approved, ready to merge, fell into a
  conflict, checks went red, changes requested, a review asked of you, a fresh
  reply, merged. A PR falling back to waiting stays quiet. It works while a
  PRison tab is open; there is no background service.
- **Activity feed** behind the bell, newest first, with an unseen count that
  waits for you, the same count in the tab title, and the last 100 events kept
  across reloads.
- **Desktop notifications (opt-in)** for changes that land while you're on
  another tab. Settings shows whether your browser actually granted permission,
  sends a test, and says where to look when your operating system swallows it.
- **Catch-up on open.** What moved while no tab was open is reported on the
  first load, in the feed — never as a desktop notification, since it is old.
- **The [menu bar](#then-put-it-in-the-menu-bar-macos)** on a Mac keeps an
  unread count that needs nobody's permission.

### Looking back

- **This week**, at the top of History: the median time people waited for your
  review, how many reviews you gave and on how many PRs, and the one wait that
  ran longest with a link to it — each beside the week before, plus a bar per
  day. A mirror, not a score: no streaks, nothing about anyone else. It asks
  GitHub once every half day, not on every refresh.
- **Recently reviewed** — PRs you reviewed, worded as what you did (**You
  requested changes**, **You approved**), with **Updated since** and a **See
  new commits** link when the author has answered.
- **Recently merged / closed** — your finished PRs on a short timeline.

### Finding things

- **Group** by queue, repository or check, inside each column.
- **Drafts**: All, Only drafts, or No drafts.
- **One search box** narrows every list at once — title, repo, number, author,
  reviewer, comment text, file path, failing check names. Terms are ANDed, so
  `acme 482` finds that PR. `/` jumps to it.
- **Scope** to all of it, your personal account, one organization, or one
  repository. The scope narrows the GitHub search itself.
- **Everything folds** by its header, keeping its count, for the sitting.

### GitHub's API budget

GitHub prices every query from an hourly allowance shared with anything else
signed in as you, so PRison is open about it:

- **Settings → Auto refresh** names what the last refresh cost and what is left.
- The board warns while there is still enough left to act on, and a spent
  budget gets its own notice with the time it comes back — not seven failing
  lists and a Retry that cannot work.
- Queries go out three at a time, which keeps GitHub's secondary rate limit
  from failing them together; a short block is waited out once, automatically.
- When GitHub drops part of a response, a banner says so instead of quietly
  showing less.

| What | Cost |
| --- | --- |
| The new Waiting on others list | 2 points per refresh |
| Review time estimates, snooze, wait limits | nothing extra |
| The weekly look back | 1 point, twice a day at most |

### Fourteen themes

Each with a light and a dark ground, its own accent, status colours and
typefaces: **Default**, **Aurora**, **İznik**, **Cyanotype**, **Coral**,
**Saffron**, **Lichen**, **Reflectivity**, **Lilac**, **Olive**, **Acid Pop**,
**Terracotta**, **Moss & Rose** and **Bordeaux**. All twenty-eight palettes are
held to WCAG AA by a test. See [docs/DESIGN.md](docs/DESIGN.md) for where each
comes from.

## Getting started

PRison runs on **your own machine** — no third-party app to approve. One
command with Node, or one with Docker.

> [!WARNING]
> Sign-in mints a session from the host's GitHub credentials (your `gh` CLI token
> or a `GITHUB_TOKEN`). Do NOT expose a `gh`-authenticated or
> `GITHUB_TOKEN`-configured instance on a reachable network without adding your
> own access control. **Sign Out** clears your session cookie; it cannot revoke
> the host's credentials.

### Run with Node — one command

With [Node.js](https://nodejs.org) 20 or newer:

```sh
npx @mfozmen/prison@latest
```

It starts PRison on http://localhost:7747 and opens it in your browser. Signed
in to the [GitHub CLI](https://cli.github.com)? You're signed in to PRison too;
otherwise it asks for a [token](#no-github-cli-paste-a-token). Ctrl+C stops it.

- It listens on this machine only (`127.0.0.1`), never on your network.
- Its secret and settings live in `~/.config/prison` (`%APPDATA%\prison` on
  Windows), so a restart keeps you signed in.
- Updating is the same command: `@latest` makes npx check for a newer release
  on every start, so a restart is an upgrade. (Without it npx may reuse the
  copy it cached last time.)
- `--port 8000` picks another port; `--no-open` leaves the browser alone;
  `--help` lists it all.

### Run with Docker

From the published image, no clone needed:

```sh
docker run -p 7747:7747 -v prison-data:/data -e GITHUB_TOKEN="$(gh auth token)" mfozmen/prison
```

Or build it from a checkout:

```sh
GITHUB_TOKEN="$(gh auth token)" docker compose up --build
```

Then open http://localhost:7747.

- `AUTH_SECRET` is generated and kept in the `prison-data` volume, so your
  session survives a restart. Images are published for `linux/amd64` and
  `linux/arm64`.
- Passing your `gh` token signs you in automatically, which SSO-restricted orgs
  need. It rotates, so re-run when it expires. Without `GITHUB_TOKEN`, open the
  app and [paste a token](#no-github-cli-paste-a-token).

### Then put it in the menu bar (macOS)

`extras/menubar/prison.1m.py` is a [SwiftBar](https://swiftbar.app) (or xbar)
plugin that puts an **unread count** in the menu bar: it appears when something
lands and stays until you click it, with no permission to grant.

![The macOS menu bar with the PRison plugin clicked open. In the bar, the PRison icon and the number 2. The menu below lists Unread (2) and Mark all read, then the live totals — Ready to merge 2, Waiting on your review 2, Comments awaiting reply 3, Stuck on checks 4 — each opening a submenu of its own PRs, then Open PRison and Refresh now](docs/menubar.png)

```sh
brew install --cask swiftbar && mkdir -p ~/SwiftBar && cp extras/menubar/prison.1m.py ~/SwiftBar/ && chmod +x ~/SwiftBar/prison.1m.py
```

It reads the PRison you just started — no token, no configuration, and the same
refresh interval as the dashboard, so the two never spend the budget twice. See
[extras/menubar/README.md](extras/menubar/README.md).

### Run locally (development)

```sh
npm install && npm run dev
```

Then open http://localhost:7747 and click **Sign in with GitHub CLI**. The
server reads your CLI token and keeps it only in an encrypted, httpOnly cookie.
`AUTH_SECRET` is written to `.env.local` on the first run.

Port taken? `npm run dev -- -p 8000` (or `docker run -p 8000:7747 …`), and set
the menu bar plugin's `PRISON_URL` to match.

### No GitHub CLI? Paste a token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=read:org,repo&description=PRison) → **Generate new token (classic)**.
2. Select **`read:org`** and **`repo`**, generate, and paste it into PRison.

> [!NOTE]
> For SAML SSO orgs, click **Configure SSO** on the token and **Authorize** it.
> Some orgs forbid classic tokens; there the GitHub CLI is the only way in.

## Settings

The sliders icon opens Settings in the middle of the screen: six tabs, one at a
time, and a search box over all of them — type, and the panel becomes the
matching settings, with switches working right there. `/` jumps to it, Esc
clears it.

| Tab | What's in it |
| --- | --- |
| **Comments** | Show bot comments; hide comments you reacted to or marked as seen. |
| **Auto refresh** | On or off, how often, notification permission, and what a refresh costs. |
| **Checks** | One owner/repo picker over **Tracked** and **Ignored** checks, side by side. Picking a repo changes nothing until you add a check to it. |
| **Limits** | How long each queue may wait before it shows as late. |
| **Appearance** | The fourteen themes, each previewed as a tiny board in its real colours, on its light or dark ground. |
| **About** | Version, links, **Check for updates**, and **Tell me when a newer version is out** — which asks GitHub once a day, without your token. |

## Controls

**Header**, left to right:

| Control | What it does |
| --- | --- |
| **Switcher** | Scope to everything, your personal account, or one organization. |
| **Repository** | Narrow to a single repository. |
| **Bell** | Opens the activity feed and marks it read. |
| **Sliders** | Opens [Settings](#settings). |
| **Sun / moon** | Flips the theme's ground, naming it — "Switch to Aurora Night". |
| **Sign Out** | Clears your session. |

**Board:**

| Control | What it does |
| --- | --- |
| **I have … / Skip** | On the Next move: fit the time you have, or step to the next oldest. |
| **By queue / repo / check** | Groups rows inside each column; group headers fold. |
| **All / Only drafts / No drafts** | Filters by draft state. |
| **Search** | Narrows every list to rows matching all your terms; Esc clears it. |
| **Refresh** · **Updated Xm ago** | Re-fetches without a reload, and says how fresh the data is. |

**On a row:**

| Control | What it does |
| --- | --- |
| **Title** or **suggested action** | Opens it on GitHub; a comment opens on its thread. |
| **Moon** | [Snooze](#snooze-and-wait-limits) until tomorrow, Monday, or until it changes. |
| **Eye** | Mark a comment as seen until someone replies. |
| **Check chip** | Right-click (or click) to ignore or un-ignore that check. |
| **Copy reminder** | On Waiting on others: a polite nudge for your clipboard. |

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions, tests, and CI setup
- [RELEASING.md](RELEASING.md) — how to cut a release, and how to roll one back
- [docs/DESIGN.md](docs/DESIGN.md) — design system and themes
- [docs/UI-AUDIT.md](docs/UI-AUDIT.md) — UI/UX audit notes

Licensed under [MIT](LICENSE).
