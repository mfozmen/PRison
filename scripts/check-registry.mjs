#!/usr/bin/env node
// Runs as `preinstall`, before npm resolves a single package.
//
// This repo ships an .npmrc pinning the public registry, but npm's precedence is
// `cli flag > environment > project .npmrc`, so an `npm_config_registry` exported
// by a corporate shell profile silently wins. Every `resolved` URL in the lockfile
// is then rewritten to that private mirror, which breaks `npm ci` on a public CI
// runner and publishes an internal hostname from this public repository.
//
// .npmrc cannot defend against that. This can: a failing preinstall aborts the
// install before the lockfile is touched.

const PUBLIC = "https://registry.npmjs.org/";
const configured = process.env.npm_config_registry;

// Undefined means npm resolved the registry from .npmrc — exactly what we want.
if (configured && !configured.startsWith("https://registry.npmjs.org")) {
  console.error(`
[PRison] Refusing to install from a non-public npm registry.

  npm_config_registry = ${configured}

Something in your environment (a shell profile, a corporate .npmrc, or a CI
variable) overrides this repository's .npmrc. Installing would rewrite every
"resolved" URL in package-lock.json to that host — breaking npm ci on the public
runner, and publishing an internal hostname from a public repository.

Install with the public registry instead; a CLI flag beats the environment:

  npm install --registry=${PUBLIC}

Or, for this shell only:

  npm_config_registry=${PUBLIC} npm install
`);
  process.exit(1);
}
