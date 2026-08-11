# PRison

[![CI](https://github.com/mfozmen/PRison/actions/workflows/ci.yml/badge.svg)](https://github.com/mfozmen/PRison/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=mfozmen_PRison&metric=coverage)](https://sonarcloud.io/summary/new_code?id=mfozmen_PRison)
[![Docker Pulls](https://img.shields.io/docker/pulls/mfozmen/prison)](https://hub.docker.com/r/mfozmen/prison)

A read-only GitHub dashboard that shows which pull requests need your attention,
and for how long — across your personal account and every organization you can
access. Four lists, oldest first, plus two history sections:

- **Ready to merge** — PRs GitHub reports as mergeable now. An out-of-date branch
  still counts, with a **"Needs update"** hint (a bot/manual update handles it) —
  but only once its checks are green; while one is red or still running it
  belongs under *Stuck on checks*, and no PR is ever in both lists.
- **Comments awaiting your reply** — review comments where the last word isn't
  yours: every unresolved inline thread on your own PRs, the threads you raised
  on PRs you reviewed, and questions left in the body of a review rather than on
  a line of the diff. Each row opens the comment itself, not the top of the PR.
- **Waiting on your review** — PRs you're blocking others on.
- **Stuck on checks** — your open PRs with failing/pending checks, or otherwise
  blocked from merging (required checks, review, or conflicts).
- **Recently reviewed** — open PRs you already reviewed, badged with the verdict
  you left (**Dismissed**, struck through, when the author has cleared it), and
  flagged **"Updated since"** when the author has pushed after it.
  A PR that comes back for another review leaves this list and returns to
  *Waiting on your review*.
- **Recently merged / closed** — your own PRs that were merged or closed, newest
  first, so finished work confirms itself.

Both history sections sit side by side, collapsed by default with a count, and
expand to the latest 15 with **Load more** for the rest.

![The PRison dashboard in dark mode. At the top, the filter bar's grouping and draft filters; below it a row of four summary tiles (waiting on you, awaiting your reply, stuck on checks, longest wait); then the four PR lists — ready to merge, comments awaiting your reply, PRs waiting on your review, and PRs stuck on checks — with the recently reviewed and recently merged / closed histories collapsed at the bottom](docs/screenshot.png)

### Features

- **Unanswered review comments.** An inline thread is waiting on you when it is
  unresolved *and* its most recent comment isn't yours — replying adds a comment,
  so your own last word means the ball is back in the reviewer's court. A review
  *body* has neither replies nor a resolve bit, so it waits until you say
  something on the PR after it; a reaction dismisses one, the same emoji that
  dismisses a thread. Rows say which surface they came from, because the two are
  answered in different places. The age counts from the comment, so you can see
  what you've been sitting on for four days. Bots write most review comments, so
  they're hidden behind a **Show bot comments** toggle.
- **Tracked checks → Awaiting.** GitHub's API hides "expected" required checks
  (e.g. a manually-triggered `qa/smoke` or automation) from non-admins. Name the
  checks you care about — a default per owner (your personal account and every
  org) plus per-repo overrides, with a
  type-to-search repo picker — and PRison shows them as **"⏳ Awaiting: &lt;name&gt;"**
  on a blocked PR until they report.
- **History you can walk back into.** Merged and closed-without-merging PRs, each
  badged **Merged** or **Closed** with how long ago it ended — and next to them
  the PRs you reviewed, so a discussion you left open is one click away instead
  of lost in GitHub's notification list.
- **Summary tiles** above the lists: how many PRs wait on your review, how many
  comments wait on your reply, how many of yours are stuck on checks, and the
  longest anything has been waiting. The two where someone else is held up by
  you are coloured; the rest stay quiet. They count the lists as filtered, so a
  tile never disagrees with the list beneath it, and they cost no extra API
  calls — it is all data already on the page. *Ready to merge* has no tile: it
  is the one queue you want to be long.
- **Grouping** — flat, by repository, or by check. Each group is a panel you can
  fold away by its header, so a repo you are not working in today stops taking
  up the screen while its name and count stay in view. Next to it in the filter
  bar, a **draft filter**: **All**, **Only drafts** to see just what you have in
  progress, or **No drafts** to get them out of the way.
- **Auto refresh (opt-in).** Turn it on in Settings and pick how often to check
  — every 5, 15, or 30 minutes, or hourly (30 minutes by default). PRison then
  tells you what *moved*, not just what's new: a PR that became ready to merge,
  checks that went red, changes requested, a review asked of you, a fresh reply
  on a thread, or one of your own PRs getting merged — while a PR simply falling
  back to waiting (you pushed a fix) stays quiet. Works only while a PRison tab
  is open — there's no background service.
- **Activity feed.** Everything a poll detects is kept, newest first, behind the
  bell in the header. The bell carries an unseen count and pulses while there is
  something new (never against a reduced-motion preference), and each row names
  the PR, says what happened, and links straight to it — a comment lands on the
  thread itself. The last 100 events survive a reload. Opening the panel is what
  marks it read, so the count waits for you instead of vanishing the moment you
  return to the tab; the **`(3) PRison`** tab-title badge follows the same count.
- **Desktop notifications (opt-in).** On the same schedule, changes that land
  while you're on another tab also raise a desktop notification naming them —
  `acme/web #42 is ready to merge` — up to three at a time, then `+N more`.
  Settings shows whether your browser has actually granted permission and offers
  a test notification, and says where else to look if nothing appears: your
  operating system decides separately whether the browser may show anything, and
  it refuses in silence. Whatever the notification misses is in the activity
  feed regardless.
- **Catch-up on open.** PRison remembers what everything was doing when you
  last closed it, so a review that arrived overnight is still news in the
  morning — the first load reports what moved while no tab was polling,
  instead of quietly accepting it as the way things always were. It fills the
  feed and the bell; it doesn't raise a notification about what the page in
  front of you is already showing.
- **Last refreshed indicator.** The filter bar says how long ago the data
  landed, so you always know whether you're looking at something stale.
- **Partial-data notice.** When GitHub drops part of a response (an org restricts
  the token, a search times out), a banner says so instead of silently showing
  less — with a Retry button, like every failed list.
- **Rides out GitHub's rate limiting.** A refresh needs seven queries, and asking
  for them all at once trips GitHub's secondary rate limit — which applies to
  your whole account, so lists fail together and the page looks broken. PRison
  sends three at a time instead. That costs nothing: the refresh is as fast as it
  was, because its speed was always set by the slowest single query, and each
  query actually comes back quicker once GitHub isn't throttling the burst.
  Should the limit still land, and GitHub says how long the block runs and it's
  short, PRison waits that out and asks once more instead of making you press
  Retry yourself. When GitHub asks for longer than a refresh should take — or
  doesn't say at all — PRison steps aside and shows the banner rather than
  guessing, since coming back early only extends the block.
- **Four themes, each with a light and a dark ground.** A theme owns its accent,
  its three status colours and its typefaces; the ground underneath is a separate
  choice, so switching it reads as the light changing rather than the theme
  changing. **Default** is the original pair; **Aurora** is built from four
  atmospheric emission wavelengths, **İznik** from the metal oxides the 16th
  century tile workshops fired, and **Cyanotype** from the 1842 blueprint
  reaction and its negative. All eight palettes are measured against WCAG AA by
  a test, with nothing exempt. Pick one in Settings, where each row previews itself
  — the swatch is stamped with that theme, so it renders in the real palette
  rather than a copy that can drift.
- Responsive two-column layout, minute-level ages, colour-coded lists, and a
  Refresh button.
- **Personal account + per-org filter** in the top-right switcher.
- **Your own access** — sign in with the GitHub CLI or a token; no third-party
  app to approve. Every row deep-links to GitHub; PRison never writes anything.

## Getting started

PRison runs on **your own machine** — no third-party app to approve. The easiest
way is Docker (one command); or run it locally with Node.

**Sign Out** ends *your session* — it clears the encrypted cookie. It cannot revoke
the host's credentials: on a `GITHUB_TOKEN`-configured instance, one click signs you
back in, and anyone who can reach the instance can do the same. That is what the
warning below is about.

> [!WARNING]
> Sign-in mints a session from the host's GitHub credentials (your `gh` CLI token
> or a `GITHUB_TOKEN`). PRison is designed to run on your own machine — do NOT
> expose a `gh`-authenticated or `GITHUB_TOKEN`-configured instance on a reachable
> network without adding your own access control.

### Run with Docker (recommended)

Zero-config — `AUTH_SECRET` is auto-generated and persisted in a volume (nothing to set).

From the published image, no clone needed:

```sh
docker run -p 3000:3000 -v prison-data:/data \
  -e GITHUB_TOKEN="$(gh auth token)" mfozmen/prison   # http://localhost:3000
```

Or build it yourself from a checkout:

```sh
GITHUB_TOKEN="$(gh auth token)" docker compose up --build   # http://localhost:3000
```

The `prison-data` volume holds the generated `AUTH_SECRET`, so your session
survives a restart. Images are published for `linux/amd64` and `linux/arm64`.

Passing your `gh` token signs you in automatically — needed for SSO-restricted orgs
(where SSO/SAML enforcement blocks classic PATs). The token rotates, so re-run when
it expires. Without `GITHUB_TOKEN`, just open the app and paste a token.

### Run locally (development)

```sh
npm install
npm run dev        # http://localhost:3000
```

`npm run dev` generates `AUTH_SECRET` into `.env.local` on first run (it encrypts
the session cookie) — nothing to configure. Open the app and click **Sign in with
GitHub CLI**; the server reads your CLI token and stores it only in an encrypted,
httpOnly cookie — never in the browser.

### No GitHub CLI? Paste a token

If `gh` isn't installed or signed in, the app falls back to a paste-a-token form:

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=read:org,repo&description=PRison) → **Generate new token (classic)**.
2. Select the **`read:org`** and **`repo`** scopes, generate, and copy it.

> [!NOTE]
> For SAML SSO orgs, click **Configure SSO** on the token and **Authorize** it —
> self-service, no org owner approval. Some orgs forbid classic PATs entirely;
> there the GitHub CLI token is the only way in.

## Usage

Sign in with the GitHub CLI or paste a token.

### Header controls

Top-right, left to right:

| Control | What it does |
| --- | --- |
| **Switcher** | Scopes the board to All / your personal account / a single org. |
| **Bell** | Opens the **activity feed** and marks it read. |
| **Sliders icon** | Opens **Settings** (below). |
| **Sun/moon** | Switches between the current theme's two grounds, and names them — it reads "Switch to Aurora Night" rather than "Switch to dark theme". |
| **Sign Out** | Clears the stored token. |

The Settings menu has five sections:

- **Comments** — show bot comments, hide comments you reacted to.
- **Auto refresh** — on/off, how often to check, and the notification
  permission.
- **Tracked checks** — name the required checks to see as "Awaiting".
- **Appearance** — pick one of the four themes, each previewing its own colours
  and typeface.
- **About** — version, repository, license, and **Check for updates**: asked
  for, never automatic, and it links straight to the release when there's a
  newer one.

### Filter bar

| Control | What it does |
| --- | --- |
| **Flat / By repo / By check** | Groups the lists. Group headers fold and unfold, and under **By repo** the ↗ beside one opens that repository on GitHub. |
| **All / Only drafts / No drafts** | Filters by draft state. |
| **Refresh** | Re-fetches without reloading the page. |
| **Updated Xm ago** | How fresh the data is, next to Refresh. |

Click a **PR title** (or a suggested-action link) to jump to GitHub — a comment
row lands on that exact thread.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions, tests, and CI setup
- [RELEASING.md](RELEASING.md) — how to cut a release, and how to roll one back
- [docs/DESIGN.md](docs/DESIGN.md) — design system
- [docs/UI-AUDIT.md](docs/UI-AUDIT.md) — UI/UX audit notes

Licensed under [MIT](LICENSE).
