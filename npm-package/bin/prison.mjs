#!/usr/bin/env node
// `npx @mfozmen/prison` — runs PRison on this machine without Docker.
//
// It keeps a generated AUTH_SECRET and the two small data files in your config
// folder, picks up the GitHub CLI's token when there is one, starts the bundled
// server on 127.0.0.1, and opens the browser once it answers.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  configDir, parseArgs, serverEnv, openCommand, nodeIsSupported, MIN_NODE,
} from "./cli.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
const server = join(here, "..", "server", "server.js");

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log(opts.help);
  process.exit(0);
}
if (opts.version) {
  console.log(pkg.version);
  process.exit(0);
}
if (opts.error) {
  console.error(opts.error);
  process.exit(2);
}
if (!nodeIsSupported(process.versions.node)) {
  console.error(`PRison needs Node ${MIN_NODE} or newer; this is ${process.versions.node}.`);
  process.exit(1);
}
if (!existsSync(server)) {
  console.error(`The bundled server is missing (${server}). Reinstall the package.`);
  process.exit(1);
}

// The secret encrypts the session cookie. Kept, so a restart doesn't sign you out.
const dir = configDir(process.env, process.platform, homedir());
mkdirSync(dir, { recursive: true });
const secretFile = join(dir, "auth-secret");
if (!existsSync(secretFile)) {
  writeFileSync(secretFile, randomBytes(32).toString("base64"));
  try {
    chmodSync(secretFile, 0o600);
  } catch {
    // Windows keeps it under your profile; there is no mode to set.
  }
}
const secret = readFileSync(secretFile, "utf8").trim();

// The GitHub CLI's token, if it is installed and signed in. Read on every
// start, because it rotates. Never printed.
let token = "";
const gh = spawnSync("gh", ["auth", "token"], { encoding: "utf8", shell: process.platform === "win32" });
if (gh.status === 0) token = gh.stdout.trim();

const url = `http://localhost:${opts.port}`;

console.log(`PRison ${pkg.version} — starting on ${url}`);
console.log(token ? "Signing in with your GitHub CLI token." : "No GitHub CLI token found; paste a token in the browser.");
console.log(`Config: ${dir}`);
console.log("Press Ctrl+C to stop.");

// Open the browser once the server answers, not before: a tab that loads into
// "connection refused" looks like a broken install.
const started = Date.now();
const waitAndOpen = async () => {
  while (Date.now() - started < 60_000) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) {
        console.log(`Ready: ${url}`);
        if (opts.open) {
          const [cmd, args] = openCommand(process.platform, url);
          spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
        }
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(`PRison didn't answer on ${url} within a minute. Is the port in use? Try --port.`);
};
// The server runs in this process, not a child of it: however this command
// ends — Ctrl+C, a closed terminal, a killed task — nothing is left listening.
Object.assign(process.env, serverEnv(process.env, { dir, secret, port: opts.port, token }));
await import(pathToFileURL(server).href);
void waitAndOpen();
