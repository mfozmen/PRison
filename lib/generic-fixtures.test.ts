import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo, scanSource } from "./generic-fixtures";

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
});

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
