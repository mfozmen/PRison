import { TokenForm } from "@/components/TokenForm";
import { Dashboard } from "@/components/Dashboard";
import { ghClient } from "@/lib/github/client";
import { ORGS_QUERY, parseOrgs } from "@/lib/github/queries";
import { readToken, readLogin } from "@/lib/session";
import type { Org } from "@/lib/types";

export default async function Home() {
  const token = await readToken();

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <TokenForm />
      </main>
    );
  }

  // Organizations populate the optional filter only; the lists default to every
  // repo the token can see, so a failed org fetch is not fatal.
  let orgs: Org[] = [];
  try {
    orgs = await ghClient(token)(ORGS_QUERY).then(parseOrgs);
  } catch {
    orgs = [];
  }

  return <Dashboard orgs={orgs} login={(await readLogin()) ?? "there"} />;
}
