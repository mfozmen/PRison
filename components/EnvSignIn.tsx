"use client";

import { useEffect, useState } from "react";
import { TokenForm } from "@/components/TokenForm";

export function EnvSignIn() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/token/env", { method: "POST" })
      .then((res) => {
        if (res.ok) {
          window.location.reload();
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        setFailed(true);
      });
  }, []);

  if (failed) {
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
