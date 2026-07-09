"use client";

import { useEffect, useState } from "react";
import { TokenForm } from "@/components/TokenForm";

export function EnvSignIn() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/token/env", { method: "POST", signal: controller.signal })
      .then((res) => {
        if (res.ok) {
          window.location.reload();
        } else {
          setFailed(true);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") {
          setFailed(true);
        }
      });

    return () => controller.abort();
  }, []);

  if (failed) {
    // Deliberately WITHOUT hasEnvToken. The env token just failed, so offering it
    // again is a retry of the thing that broke. The CLI button is the useful
    // alternative where `gh` exists (npm run dev), and where it doesn't (Docker)
    // it answers 503 and says "GitHub CLI not found — paste a token below".
    return <TokenForm />;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col items-center gap-4 text-muted"
    >
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      <p className="text-sm">Signing in&hellip;</p>
    </div>
  );
}
