# Single-repo filter — design

**Date:** 2026-09-12
**Status:** approved

## Goal

Narrow the whole dashboard to one repository, for the days spent working inside a
single repo rather than across an account. Today the narrowest view is an
organization, and an org with thirty repos is not a focused board.

## The rule the design rests on

**The filter narrows the GitHub search, not the rendered list.**

Every search runs with `first: 50`. Filtering already-fetched rows client-side
would mean the window is still filled by the whole account: on a busy account the
repo being focused on can fall outside those 50 rows entirely, and the board then
shows an empty list that looks exactly like a repo with nothing open. Putting
`repo:owner/name` in the query spends the 50 rows on that repo alone, and carries
the same scope into the two archive lists for free.

It is also the smaller change. Every list route already resolves its scope
through one function.

## Scope resolution

`lib/github/scope.ts` turns `?org=` / `?user=` into a search qualifier and is the
single door all six list routes pass through. It gains `?repo=`:

| Params present | Qualifier |
| --- | --- |
| `repo=acme/api` | `repo:acme/api` |
| `user=mfozmen` | `user:mfozmen` |
| `org=acme` | `org:acme` |
| none | *(unscoped — the "All" view)* |

`repo` outranks both `user` and `org`, because `repo:owner/name` already names its
owner; honouring an org alongside it could only ever agree or contradict.

An invalid value is a 400, as it is for the existing params. `lib/github/validate.ts`
gains `isValidRepo`: an owner login (the existing rule) and `/` and a repo name of
1–100 characters from `A–Z a–z 0–9 . _ -`. Repo names allow dots and underscores
that logins do not, so reusing `isValidLogin` for both halves would reject real
repositories.

No route file changes.

## Interface

A `RepoCombobox` sits beside the organization select in the header. The component
already exists and already searches `/api/repos` asynchronously, scoped to owner
logins.

- Its `owners` is the selected org, or — under "All organizations" — the same
  owner list the settings panel already builds (personal account + every org).
- Changing the org **clears the repo**. Leaving `acme/api` selected while the org
  moves to `beta` would leave the board showing acme, with a control claiming
  beta. The org select must never be able to lie.
- The selection persists under `prison.repo`, alongside `prison.org`, and is
  applied after mount like every other persisted filter, so the controlled input
  cannot cause a hydration mismatch.

## Data flow

`fetchData(org)` becomes `fetchData(org, repo)` and builds `?repo=` in preference
to `?user=` / `?org=`, mirroring the server's precedence.

The stale-response guard needs widening. `latestOrgRef` currently holds the org a
run was started for, and a response whose org no longer matches is dropped. With
two parts to the scope it must hold the pair — otherwise switching repo inside one
org leaves the ref unchanged, and a slow response for the previous repo is
accepted as current. The ref holds a single `org|repo` string; the comparison is
unchanged.

The auto-refresh interval and every "Retry" already re-issue `fetchData` with the
current scope, so they follow the repo with no further change.

## Error handling

Nothing new. A scoped search that matches nothing returns an empty list and the
existing per-section empty states render. An invalid repo cannot reach the server
from the UI — the combobox only emits values it found — and is a 400 if it arrives
by hand, exactly like a malformed `?org=`.

## Testing

- `isValidRepo`: accepts dots, underscores and hyphens in the name; rejects a
  missing slash, an empty half, a leading/trailing hyphen in the owner, and a name
  past the length cap.
- `resolveScope`: builds `repo:`; prefers `repo` over both `org` and `user` when
  more than one is present; 400s an invalid repo.
- Dashboard: selecting a repo re-fetches with `?repo=`; changing the org clears
  the repo and re-fetches without it; a response that arrives for a superseded
  scope is ignored.
- Header: renders the combobox, scopes it to the selected org, and reports a
  chosen repo upward.

## Deliberately not included

- **Multiple repos.** The ask was to focus on one. A multi-select is a different
  feature with a different query shape (`repo:a repo:b` is an OR, which is not
  what "focus" means).
- **Hiding the "By repo" grouping while a repo is selected.** It collapses to one
  group, which is harmless and self-explanatory.
- **A repo list on the org select.** Repos are too many to enumerate; that is why
  the combobox searches.
