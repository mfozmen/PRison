#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname: on Windows the latter yields "/C:/…", which
// resolves against the drive root and makes every write fail with ENOENT.
const envFile = fileURLToPath(new URL("../.env.local", import.meta.url));

let existing = "";
if (existsSync(envFile)) {
  existing = readFileSync(envFile, "utf8");
}

// Check for a non-empty AUTH_SECRET= line
const hasSecret = /^AUTH_SECRET=.+/m.test(existing);

if (!hasSecret) {
  const secret = randomBytes(32).toString("base64");
  const line = `AUTH_SECRET=${secret}\n`;
  const prefix = existing && !existing.endsWith("\n") ? existing + "\n" : existing;
  writeFileSync(envFile, prefix + line, "utf8");
  console.log(`[PRison] Generated AUTH_SECRET in .env.local`);
}
