import { TokenForm } from "@/components/TokenForm";
import { EnvSignIn } from "@/components/EnvSignIn";
import { Dashboard } from "@/components/Dashboard";
import { ghQuery } from "@/lib/github/client";
import { ORGS_QUERY, parseOrgs } from "@/lib/github/queries";
import { readToken, readLogin, readSignedOut } from "@/lib/session";
import type { Org } from "@/lib/types";

export default async function Home() {
  const token = await readToken();
  const hasEnvToken = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);

  if (!token) {
    // EnvSignIn signs in from the host token the moment it mounts. That is the
    // zero-config Docker path — but after an explicit sign-out it would make
    // signing out and signing back in the same page load. Offer the button instead.
    const signedOut = await readSignedOut();
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        {hasEnvToken && !signedOut ? <EnvSignIn /> : <TokenForm hasEnvToken={hasEnvToken} />}
      </main>
    );
  }

  // Organizations populate the optional filter only; the lists default to every
  // repo the token can see, so a failed org fetch is not fatal.
  let orgs: Org[] = [];
  try {
    const { data } = await ghQuery(token, ORGS_QUERY);
    orgs = parseOrgs(data);
  } catch {
    orgs = [];
  }

  return <Dashboard orgs={orgs} login={(await readLogin()) ?? "there"} />;
}
