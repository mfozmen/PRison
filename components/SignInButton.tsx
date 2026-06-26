"use client";
import { signIn } from "next-auth/react";

export function SignInButton() {
  return (
    <button onClick={() => signIn("github")} className="rounded bg-black px-4 py-2 text-white">
      Sign in with GitHub
    </button>
  );
}
