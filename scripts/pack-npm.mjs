#!/usr/bin/env node
// Assembles the npm package in npm-package/ from a finished `next build`:
//
//   npm run build && node scripts/pack-npm.mjs && npm publish ./npm-package
//
// The package is the standalone server plus the `prison` command, with no
// dependencies to install — `npx @mfozmen/prison` downloads one tarball and
// runs. The repository's own package.json stays private; this writes a small
// one of its own, carrying the same version.
//
// Copied by allowlist, not by exclusion: the standalone folder also traces the
// repository's sources and could pick up an .env file, and none of that may
// reach a public tarball.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const standalone = join(root, ".next", "standalone");
const out = join(root, "npm-package");

if (!existsSync(join(standalone, "server.js"))) {
  console.error("No standalone build. Run `npm run build` first.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "server"), { recursive: true });

// sharp is Next's image optimiser. PRison uses no next/image, and its binary is
// built for the machine that ran the build — a Linux one would be dead weight
// on a Mac. Leaving it out means nothing to optimise and nothing to break.
const skip = (src) => /[\\/]node_modules[\\/](sharp|@img|detect-libc)([\\/]|$)/.test(src);

cpSync(join(standalone, "server.js"), join(out, "server", "server.js"));
cpSync(join(standalone, "package.json"), join(out, "server", "package.json"));
cpSync(join(standalone, "node_modules"), join(out, "server", "node_modules"), { recursive: true, filter: (s) => !skip(s) });
cpSync(join(standalone, ".next"), join(out, "server", ".next"), {
  recursive: true,
  // The build cache is for the next build, not for running this one.
  filter: (s) => !/[\\/]\.next[\\/]cache([\\/]|$)/.test(s),
});
// What `next start` would serve from outside the standalone folder.
cpSync(join(root, ".next", "static"), join(out, "server", ".next", "static"), { recursive: true });
cpSync(join(root, "public"), join(out, "server", "public"), { recursive: true });

mkdirSync(join(out, "bin"));
for (const f of ["prison.mjs", "cli.mjs"]) cpSync(join(root, "bin", f), join(out, "bin", f));
cpSync(join(root, "LICENSE"), join(out, "LICENSE"));
cpSync(join(root, "README.md"), join(out, "README.md"));

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: "@mfozmen/prison",
      version,
      description: "A read-only GitHub dashboard for the pull requests waiting on you, and for how long.",
      license: "MIT",
      repository: { type: "git", url: "https://github.com/mfozmen/PRison" },
      homepage: "https://github.com/mfozmen/PRison#readme",
      bugs: "https://github.com/mfozmen/PRison/issues",
      keywords: ["github", "pull-requests", "code-review", "dashboard"],
      type: "module",
      bin: { prison: "bin/prison.mjs" },
      engines: { node: ">=20" },
      files: ["bin", "server"],
      publishConfig: { access: "public", provenance: true },
    },
    null,
    2,
  ) + "\n",
);

// The guard this file exists for: no secret or source made it in.
const leaks = ["server/.env", "server/.env.local", "server/app", "server/lib"].filter((p) => existsSync(join(out, p)));
if (leaks.length) {
  console.error(`Refusing: these should not be in the package: ${leaks.join(", ")}`);
  process.exit(1);
}
console.log(`npm-package/ ready: @mfozmen/prison@${version}`);
