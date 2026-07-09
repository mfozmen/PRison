import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// The version has exactly one source of truth: package.json, which release-it
// bumps. Read it here rather than `process.env.npm_package_version`, which is
// only set when the build runs through an npm script — `next build` invoked
// directly would silently produce a versionless bundle.
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for a small Docker image.
  output: "standalone",
  // Inlined into the client bundle at build time, so an image carries the
  // version of the commit it was built from.
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
