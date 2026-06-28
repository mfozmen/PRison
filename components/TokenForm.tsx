"use client";

import { useState } from "react";

const GENERIC_CLI_MESSAGE =
  "Couldn't sign in with the GitHub CLI — paste a token below.";

const CLI_MESSAGES: Record<string, string> = {
  "not-installed": "GitHub CLI not found — paste a token below instead.",
  "not-signed-in":
    "GitHub CLI isn't signed in. Run gh auth login, then retry — or paste a token below.",
  "token-rejected":
    "GitHub rejected the CLI token. Try gh auth refresh, or paste a token below.",
};

function cliMessageForReason(reason: unknown): string {
  return typeof reason === "string" && Object.hasOwn(CLI_MESSAGES, reason)
    ? CLI_MESSAGES[reason]
    : GENERIC_CLI_MESSAGE;
}

export function TokenForm() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cliBusy, setCliBusy] = useState(false);
  const [cliError, setCliError] = useState<string | null>(null);

  async function signInWithCli() {
    setCliBusy(true);
    setCliError(null);
    try {
      const res = await fetch("/api/token/cli", { method: "POST" });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = await res.json().catch(() => null);
      setCliError(cliMessageForReason(body?.reason));
    } catch {
      setCliError(GENERIC_CLI_MESSAGE);
    }
    setCliBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError(
          res.status === 401
            ? "That token didn't work. Check the scopes and SSO authorization."
            : "Something went wrong. Try again.",
        );
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Couldn't reach the server. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-surface/40 p-8 shadow-xl">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent font-mono text-2xl font-bold text-background">
          P
        </div>
        <h1 className="text-xl font-bold text-foreground">PRison</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with the GitHub CLI (one click) or paste a Personal Access
          Token. PRison uses your own access — read-only, nothing is written.
        </p>
      </div>

      <div className="mt-6">
        <button
          type="button"
          disabled={cliBusy}
          onClick={signInWithCli}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cliBusy ? "Checking…" : "Sign in with GitHub CLI"}
        </button>
        <div aria-live="polite">
          {cliError && (
            <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {cliError}
            </p>
          )}
        </div>
      </div>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface/40 px-2 text-muted">
            or paste a token
          </span>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="pat" className="block text-xs font-medium text-muted">
          Personal Access Token
        </label>
        <input
          id="pat"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || token.trim() === ""}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>

      <p className="mt-4 text-xs text-muted">
        Create a classic token with the <code className="font-mono">read:org</code>{" "}
        and <code className="font-mono">repo</code> scopes at{" "}
        <a
          href="https://github.com/settings/tokens/new?scopes=read:org,repo&description=PRison"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline hover:text-accent/80"
        >
          github.com/settings/tokens
        </a>
        . For SSO orgs, click <span className="text-muted">Configure SSO</span>{" "}
        on the token and authorize it.
      </p>
    </div>
  );
}
