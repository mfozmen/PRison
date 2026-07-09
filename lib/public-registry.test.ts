import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `npm_config_registry` in the environment overrides this repo's `.npmrc`, so an
 * `npm install` on a machine configured for a private mirror rewrites every
 * `resolved` URL in the lockfile to that mirror's host. That breaks `npm ci` on a
 * public runner, and — because this repository is public — publishes an internal
 * hostname, which REVIEW.md §1 forbids.
 *
 * `lib/generic-fixtures.ts` cannot catch it: it skips package-lock.json, which is
 * machine-generated and full of upstream metadata. Hence this check.
 *
 * If it fails: `npm install --package-lock-only --registry=https://registry.npmjs.org/`
 * (the CLI flag beats the env var), then commit the lockfile.
 */
const PUBLIC_REGISTRY_HOSTS = new Set(["registry.npmjs.org"]);

function resolvedHosts(lock: string): string[] {
  const hosts = new Set<string>();
  for (const m of lock.matchAll(/"resolved":\s*"https?:\/\/([^/"]+)/g)) hosts.add(m[1]);
  return [...hosts].sort();
}

describe("package-lock.json", () => {
  it("resolves every package from the public npm registry", () => {
    const hosts = resolvedHosts(readFileSync("package-lock.json", "utf8"));
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.filter((h) => !PUBLIC_REGISTRY_HOSTS.has(h))).toEqual([]);
  });

  it("catches a private mirror", () => {
    const lock = '{"resolved": "http://registry.devops.example.internal/repository/NPM/x/-/x-1.0.0.tgz"}';
    expect(resolvedHosts(lock)).toEqual(["registry.devops.example.internal"]);
  });
});
