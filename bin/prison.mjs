#!/usr/bin/env node
// `npx @mfozmen/prison` — runs PRison on this machine without Docker.
//
// It keeps a generated AUTH_SECRET and the two small data files in your config
// folder, picks up the GitHub CLI's token when there is one, starts the bundled
// server on 127.0.0.1, and opens the browser once it answers.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  configDir, parseArgs, serverEnv, openCommand, nodeIsSupported, MIN_NODE, banner,
  isNextStartupLog,
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
// Yours alone from the moment they exist: the folder 0700, and the secret
// created 0600 by the same call that writes it, so it is never readable by
// anyone else in between. (Windows ignores the modes; the folder is in your
// own profile.)
mkdirSync(dir, { recursive: true, mode: 0o700 });
const secretFile = join(dir, "auth-secret");
const newSecret = () => randomBytes(32).toString("base64");
try {
  writeFileSync(secretFile, newSecret(), { mode: 0o600, flag: "wx" });
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
let secret = readFileSync(secretFile, "utf8").trim();
// A file a crash left empty or cut short would give the session an empty or
// guessable key. Start over with a fresh one (it signs you out once).
if (secret.length < 32) {
  secret = newSecret();
  writeFileSync(secretFile, secret, { mode: 0o600 });
}

// The GitHub CLI's token, if it is installed and signed in. Read on every
// start, because it rotates. Never printed.
let token = "";
// No shell, and run from the config folder: Windows looks for a program in the
// current directory first, and a gh.exe planted in whatever folder you ran npx
// from must never be the one handed your session.
const gh = spawnSync("gh", ["auth", "token"], { encoding: "utf8", cwd: dir });
if (gh.status === 0) token = gh.stdout.trim();

// The address the server binds, not "localhost": that can resolve to ::1 first.
const url = `http://127.0.0.1:${opts.port}`;

// Next prints its own startup banner ("Next.js ...", "- Local:", "Ready in")
// through console.log as the server listens. Swallow that burst; ours goes out
// once the first request answers, and console.log is put back right after.
// Nothing but that banner is logged in this window; errors use console.error.
const log = console.log;
console.log = (...args) => {
  if (typeof args[0] === "string" && isNextStartupLog(args[0])) return;
  log(...args);
};

// Open the browser once the server answers, not before: a tab that loads into
// "connection refused" looks like a broken install.
const started = Date.now();
const waitAndOpen = async () => {
  while (Date.now() - started < 60_000) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) {
        console.log = log;
        log(banner({
          version: pkg.version,
          url,
          token,
          dir,
          color: Boolean(process.stdout.isTTY && process.stdout.hasColors?.()),
        }));
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
  console.log = log;
  console.error(`PRison didn't answer on ${url} within a minute. Is the port in use? Try --port.`);
};
// The server runs in this process, not a child of it: however this command
// ends — Ctrl+C, a closed terminal, a killed task — nothing is left listening.
Object.assign(process.env, serverEnv(process.env, { dir, secret, port: opts.port, token }));
await import(pathToFileURL(server).href);
void waitAndOpen();
