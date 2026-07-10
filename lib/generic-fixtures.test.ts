import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanCommitMessages, scanRepo, scanSource } from "./generic-fixtures";

describe("scanSource", () => {
  // The guard is only worth having if it actually fires. These pin the two
  // evasions found in review: an unchecked repo half, and a bare owner.
  it("rejects a real-looking owner", () => {
    expect(scanSource('nameWithOwner: "realcorp/api"')).toEqual(["owner:realcorp"]);
    expect(scanSource('login: "jdoe"')).toEqual(["owner:jdoe"]);
    expect(scanSource('owners={["acme", "realcorp"]}')).toEqual(["owner:realcorp"]);
    expect(scanSource('author: "jdoe"')).toEqual(["owner:jdoe"]);
  });

  it("rejects a real-looking repository even under an allowlisted owner", () => {
    expect(scanSource('nameWithOwner: "acme/internal-billing-service"')).toEqual([
      "repo:internal-billing-service",
    ]);
    expect(scanSource('repo: "acme/secret-project"')).toEqual(["repo:secret-project"]);
    expect(scanSource("https://github.com/acme/secret-project/pull/1")).toEqual([
      "repo:secret-project",
    ]);
  });

  it("accepts the placeholders in use", () => {
    expect(scanSource('nameWithOwner: "acme/api"')).toEqual([]);
    expect(scanSource('repo: "acme/b"')).toEqual([]);
    expect(scanSource('login: "alice"')).toEqual([]);
    expect(scanSource('owners={["acme", "octocat"]}')).toEqual([]);
  });

  it("treats GitHub's own routes as paths, not accounts", () => {
    expect(scanSource("https://github.com/settings/tokens")).toEqual([]);
    expect(scanSource("https://github.com/notifications")).toEqual([]);
  });

  // /orgs/, /apps/ and /marketplace/ move the identity to the SECOND segment.
  // Skipping the whole match on the reserved first segment waved a real org through.
  it("checks the second segment for routes that carry the identity there", () => {
    expect(scanSource("https://github.com/orgs/realcompany/teams/eng")).toEqual([
      "owner:realcompany",
    ]);
    expect(scanSource("https://github.com/apps/internal-bot-slug")).toEqual([
      "owner:internal-bot-slug",
    ]);
    expect(scanSource("https://github.com/orgs/community/discussions/1")).toEqual([]);
  });

  it("treats github.com/<user>.png as an avatar, not a repo path", () => {
    expect(scanSource('src="https://github.com/shadcn.png"')).toEqual([]);
    expect(scanSource('src="https://github.com/realperson.png"')).toEqual(["owner:realperson"]);
  });

  // Documented scope limit: an allowlist cannot see NAMES in prose. If this ever
  // starts failing, the guard grew a denylist and REVIEW.md §1 needs updating.
  it("does not see names in free-form prose (reviewer's job, per REVIEW.md)", () => {
    expect(scanSource('message: "`realcorp` forbids access"')).toEqual([]);
  });

  // Ticket references have a shape, not a name, so they ARE caught.
  it("catches a foreign issue/PR reference, glued or spaced", () => {
    expect(scanSource('it("regression: some-service#90210", () => {})')).toEqual([
      "ticket:90210",
    ]);
    // GitHub's own convention puts a space before the "#".
    expect(scanSource("// Fixes #90210")).toEqual(["ticket:90210"]);
    expect(scanSource("See #90210 for context")).toEqual(["ticket:90210"]);
    // The PR number precedes the "#" here, so "#\d+" alone would miss it.
    expect(scanSource("// e.g. .../pull/90211#discussion_r9998887776")).toEqual([
      "ticket:90211",
      "ticket:discussion_r9998887776",
    ]);
  });

  it("catches GitHub-minted anchor ids pasted without their URL", () => {
    expect(scanSource("resolved via issuecomment-9998887776")).toEqual([
      "ticket:issuecomment-9998887776",
    ]);
    expect(scanSource("see pullrequestreview-9998887776")).toEqual([
      "ticket:pullrequestreview-9998887776",
    ]);
  });

  // This is where the real leaks lived: a fixture copied from a live GraphQL
  // search node, genericized everywhere except its `number:`.
  it("catches a real PR number left in a bare `number:` fixture field", () => {
    expect(scanSource("number: 90210,")).toEqual(["ticket:90210"]);
    expect(scanSource('{ id: "92", url: "u92", number: 90210 }')).toEqual(["ticket:90210"]);
    // A pasted GraphQL/REST response has quoted keys.
    expect(scanSource('{"number": 90210}')).toEqual(["ticket:90210"]);
  });

  it("leaves this repo's own short numbers alone", () => {
    expect(scanSource("number: 92,")).toEqual([]);
    expect(scanSource("this repo's own PRs are #67 and #68")).toEqual([]);
  });

  // Colours are stripped before the ticket scan, so a six-digit all-digit colour
  // never reads as a five-digit ticket.
  it("does not mistake a hex colour for a ticket", () => {
    expect(scanSource("| Edge | `#334155` | Borders |")).toEqual([]);
    expect(scanSource("--color-surface-2: #243043;")).toEqual([]);
    expect(scanSource('{ "edge": "#030712" }')).toEqual([]);
    expect(scanSource("border-l-[#111827]")).toEqual([]);
    expect(scanSource("#0f172a and #334155ff")).toEqual([]);
  });

  it("does not trip on ordinary large numbers", () => {
    expect(scanSource("width={1920}")).toEqual([]);
    expect(scanSource("const PORT = 3000; const TIMEOUT_MS = 86_400_000;")).toEqual([]);
    expect(scanSource("zIndex: 1000")).toEqual([]);
  });

  // A reference of this shape reached the public repo. Its number was two digits,
  // so the four-digit ticket floor never saw it — but the name was glued to the "#".
  it("catches a cross-repo reference however short its number", () => {
    expect(scanSource('(e.g. some-service#66 showed "6d")')).toEqual(["ticket:some-service#66"]);
    expect(scanSource("fixed by other-repo#7")).toEqual(["ticket:other-repo#7"]);
  });

  it("reports a glued four-digit reference once, not twice", () => {
    expect(scanSource("regression: some-service#90210")).toEqual(["ticket:90210"]);
  });

  // This repo is a Next.js app; `next#456` is a public upstream issue link, not a
  // private-repo leak. Declared dependencies are excluded so they don't brick CI.
  it("lets a reference to a declared dependency through, but not an unknown repo", () => {
    expect(scanSource("workaround for next#456")).toEqual([]);
    expect(scanSource("bump after vitest#42")).toEqual([]);
    expect(scanSource("see some-service#456")).toEqual(["ticket:some-service#456"]);
  });

  it("leaves a spaced reference and this repo's own name alone", () => {
    expect(scanSource("this repo's own PRs are #67 and #68")).toEqual([]);
    expect(scanSource("see PRison#3 and prison#4")).toEqual([]);
    expect(scanSource("## Heading")).toEqual([]);
    expect(scanSource("alpha#66")).toEqual([]);
  });

  // The other half of the same escape: the scrub replaced the owner and left the
  // repository name standing.
  it("catches a repo name left under a placeholder owner, in bare prose", () => {
    expect(scanSource("typing it returned repos instead of acme/some-service.")).toEqual([
      "repo:some-service",
    ]);
    expect(scanSource("globex/secret-service")).toEqual(["repo:secret-service"]);
  });

  it("does not read a branch name or a type union as owner/repo", () => {
    // `mfozmen` is deliberately not a scrub owner: this is how merges name branches.
    expect(scanSource("Merge pull request #1 from mfozmen/ci/publish-image")).toEqual([]);
    // `org` is deliberately not a scrub owner: this is a TypeScript union.
    expect(scanSource("function f(x: Org/StuckPr) {}")).toEqual([]);
    expect(scanSource("the light/dark toggle")).toEqual([]);
    expect(scanSource("acme/app and acme/api are placeholders")).toEqual([]);
  });
});

describe("scanCommitMessages", () => {
  // The escaped name never appeared in a blob, so the file scan was green while
  // the identifier sat in two public commit messages — and release-it was about to
  // copy one into CHANGELOG.md.
  it("finds no real repository, org, or ticket in this repository's history", () => {
    expect(scanCommitMessages()).toEqual([]);
  });

  it("scans every commit, not just the tip", () => {
    const root = gitInit();
    commit(root, "feat: first\n\nnothing to see here");
    commit(root, "fix: second\n\n(e.g. some-service#66 showed the wrong age)");
    commit(root, "chore: third\n\nstill clean");

    const offenders = scanCommitMessages(root);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/^[0-9a-f]{8}: ticket:some-service#66$/);
  });

  // A vacuous guard is worse than none: it is a green check that means nothing.
  it("refuses to scan a shallow clone rather than passing on one commit", () => {
    const source = gitInit();
    commit(source, "fix: leak\n\nsee some-service#66");
    commit(source, "chore: innocent tip");

    const shallow = mkdtempSync(join(tmpdir(), "prison-shallow-"));
    execFileSync("git", ["clone", "--depth", "1", `file://${source}`, shallow], {
      stdio: "ignore",
    });

    // Proof the shallow clone would otherwise hide the leak: it holds only the tip.
    expect(execFileSync("git", ["-C", shallow, "rev-list", "--count", "HEAD"], {
      encoding: "utf8",
    }).trim()).toBe("1");

    expect(() => scanCommitMessages(shallow)).toThrow(/shallow clone/);
  });
});

function gitInit(): string {
  const root = mkdtempSync(join(tmpdir(), "prison-git-"));
  const run = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  run("init", "--initial-branch=main");
  run("config", "user.email", "test@example.com");
  run("config", "user.name", "Test");
  // `git clone --depth 1` refuses a local path; file:// makes it a real fetch.
  run("config", "uploadpack.allowFilter", "true");
  return root;
}

function commit(root: string, message: string): void {
  writeFileSync(join(root, "f.txt"), message);
  execFileSync("git", ["-C", root, "add", "f.txt"], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "commit", "--no-gpg-sign", "-m", message], { stdio: "ignore" });
}

describe("scanRepo", () => {
  it("finds no real GitHub org, repo, or user login in any structured fixture field", () => {
    expect(scanRepo()).toEqual([]);
  });

  it("reports offenders with their path, and recurses into subdirectories", () => {
    const root = mkdtempSync(join(tmpdir(), "prison-guard-"));
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "clean.ts"), 'const a = { repo: "acme/api" };');
    writeFileSync(join(root, "nested", "leaky.ts"), 'const b = { login: "jdoe" };');
    expect(scanRepo(root)).toEqual(["nested/leaky.ts: owner:jdoe"]);
  });

  // Exemptions are granted per-check, not per-file. REVIEW.md and the guard must
  // hold ticket-shaped examples to document the patterns, but their *names* are
  // still checked. Exempting all three files wholesale is how a real PR number
  // once landed in two of them, as a documentation example.
  it("exempts ticket shapes in the docs and the guard, but still checks their names", () => {
    const root = mkdtempSync(join(tmpdir(), "prison-guard-"));
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "REVIEW.md"), 'e.g. #90210 — but login: "jdoe" is not ok');
    writeFileSync(join(root, "lib", "generic-fixtures.ts"), 'e.g. #90210 and login: "jdoe"');
    expect(scanRepo(root).sort()).toEqual([
      "REVIEW.md: owner:jdoe",
      "lib/generic-fixtures.ts: owner:jdoe",
    ]);
  });

  it("exempts the guard's own test entirely — it is adversarial by design", () => {
    const root = mkdtempSync(join(tmpdir(), "prison-guard-"));
    mkdirSync(join(root, "lib"));
    writeFileSync(
      join(root, "lib", "generic-fixtures.test.ts"),
      'expect(scanSource(\'login: "jdoe"\')).toEqual(["owner:jdoe"]); // #90210',
    );
    expect(scanRepo(root)).toEqual([]);
  });
});
