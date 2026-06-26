import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { SignInButton } from "@/components/SignInButton";
import { Dashboard } from "@/components/Dashboard";
import { ghClient } from "@/lib/github/client";
import { ORGS_QUERY, parseOrgs } from "@/lib/github/queries";
import type { Org } from "@/lib/types";

export default async function Home() {
  const session = await auth();

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <SignInButton />
      </div>
    );
  }

  const h = await headers();
  const token = await getToken({
    req: { headers: h },
    secret: process.env.AUTH_SECRET,
  });

  let orgs: Org[] = [];
  let orgsError = false;

  if (token?.accessToken) {
    try {
      orgs = await ghClient(token.accessToken)(ORGS_QUERY).then(parseOrgs);
    } catch {
      orgsError = true;
    }
  }

  return (
    <Dashboard orgs={orgs} login={session.login ?? "there"} orgsError={orgsError} />
  );
}
