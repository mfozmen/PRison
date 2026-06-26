import { cookies } from "next/headers";
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

  const cookieStore = await cookies();
  const req = new Request("http://localhost", {
    headers: { cookie: cookieStore.toString() },
  });
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  const orgs: Org[] = token?.accessToken
    ? await ghClient(token.accessToken)(ORGS_QUERY)
        .then(parseOrgs)
        .catch(() => [])
    : [];

  return <Dashboard orgs={orgs} login={session.login ?? "there"} />;
}
