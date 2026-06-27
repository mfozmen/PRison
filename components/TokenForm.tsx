"use client";

import { useState } from "react";

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
      if (res.status === 503) {
        setCliError("GitHub CLI not found — paste a token below instead.");
      } else {
        setCliError("Something went wrong. Try again.");
      }
    } catch {
      setCliError("Couldn't reach the server. Try again.");
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
    <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-800/40 p-8 shadow-xl">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-500 font-mono text-2xl font-bold text-slate-950">
          P
        </div>
        <h1 className="text-xl font-bold text-slate-100">PRison</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in with the GitHub CLI (one click) or paste a Personal Access
          Token. PRison uses your own access — read-only, nothing is written.
        </p>
      </div>

      <div className="mt-6">
        <button
          type="button"
          disabled={cliBusy}
          onClick={signInWithCli}
          className="w-full rounded-md bg-green-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cliBusy ? "Checking…" : "Sign in with GitHub CLI"}
        </button>
        {cliError && <p className="mt-2 text-xs text-red-400">{cliError}</p>}
      </div>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-slate-800/40 px-2 text-slate-500">
            or paste a token
          </span>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="pat" className="block text-xs font-medium text-slate-400">
          Personal Access Token
        </label>
        <input
          id="pat"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_…"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || token.trim() === ""}
          className="w-full rounded-md bg-green-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>

      <p className="mt-4 text-xs text-slate-500">
        Create a classic token with the <code className="font-mono">read:org</code>{" "}
        and <code className="font-mono">repo</code> scopes at{" "}
        <a
          href="https://github.com/settings/tokens/new?scopes=read:org,repo&description=PRison"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-400 underline hover:text-green-300"
        >
          github.com/settings/tokens
        </a>
        . For SSO orgs, click <span className="text-slate-400">Configure SSO</span>{" "}
        on the token and authorize it.
      </p>
    </div>
  );
}
