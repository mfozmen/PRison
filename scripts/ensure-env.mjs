#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const envFile = new URL("../.env.local", import.meta.url).pathname;

let existing = "";
if (existsSync(envFile)) {
  existing = readFileSync(envFile, "utf8");
}

// Check for a non-empty AUTH_SECRET= line
const hasSecret = /^AUTH_SECRET=.+/m.test(existing);

if (!hasSecret) {
  const secret = randomBytes(32).toString("base64");
  const line = `AUTH_SECRET=${secret}\n`;
  writeFileSync(envFile, existing ? existing + line : line, "utf8");
  console.log(`[PRison] Generated AUTH_SECRET in .env.local`);
}
