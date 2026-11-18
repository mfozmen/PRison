#!/usr/bin/env node
// Capture docs/screenshot.png from the synthetic board, headlessly.
//
//   npm run dev                          # in another shell
//   node scripts/screenshot/capture.mjs  # reads PRISON_URL, default http://localhost:7747
//
// Drives headless Chrome over the DevTools Protocol. No browser extension, no
// Playwright, no dependency at all: Node has had a global WebSocket since 22,
// and CDP is a WebSocket. Chrome runs on a throwaway profile, so nothing here
// touches the browser you use.
//
// It signs in with a DELIBERATELY INVALID token. PRison only needs a decryptable
// session cookie to render the dashboard shell; the org query that token would
// serve fails, leaving the org switcher empty. That is the point — a real token
// would put real organizations into a file published in a public repository. The
// lists never reach GitHub either: the board is patched in before the first
// paint. See .claude/skills/refresh-screenshot.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Imported straight from the TypeScript, which Node strips itself — the session
// cookie has to decrypt, so it is minted with the app's own encryptToken rather
// than a copy of it, one AES change away from silently producing a cookie that
// reads as "signed out".
import { encryptToken } from "../../lib/token-cookie.ts";
import { pageSnippet } from "./demo-board.mjs";

// fileURLToPath, not .pathname: on Windows the latter yields "/C:/…", which
// resolves against the drive root instead of the repo.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const APP = process.env.PRISON_URL ?? "http://localhost:7747";
const CHROME = process.env.CHROME_PATH
  ?? (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

// The pixel-reviewer agent drives the same Chrome three ways (see
// .claude/agents/pixel-reviewer.md); with no flags this is the README shot.
//   --ref docs/design/board.html   screenshot a static reference page instead
//   --diff a.png b.png             write a red-on-grey diff to SHOT_OUT, print the mismatch %
const args = process.argv.slice(2);
const REF = args[0] === "--ref" ? args[1] : null;
const DIFF = args[0] === "--diff" ? args.slice(1, 3) : null;
const OUT = process.env.SHOT_OUT ?? join(ROOT, "docs", "screenshot.png");
const THEME = process.env.SHOT_THEME ?? "default";
const MODE = process.env.SHOT_MODE ?? "dark";

// Matches the committed screenshot: 1280 CSS px wide at 2x.
const WIDTH = Number(process.env.SHOT_WIDTH ?? 1280);
const SCALE = Number(process.env.SHOT_SCALE ?? 2);

function authSecret() {
  const env = readFileSync(join(ROOT, ".env.local"), "utf8");
  const line = /^AUTH_SECRET=(.+)$/m.exec(env);
  if (!line) throw new Error("AUTH_SECRET missing from .env.local — run `npm run dev` once");
  return line[1].trim();
}

// Minimal CDP client: send(method, params) -> Promise<result>.
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message));
    else slot.resolve(msg.result);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`cannot reach ${wsUrl}`)), { once: true });
  });
  return {
    ready,
    close: () => ws.close(),
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function until(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const profile = mkdtempSync(join(tmpdir(), "prison-shot-"));
const port = 9330 + (process.pid % 500);

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},1200`,
  "--hide-scrollbars",
  "--no-first-run",
  "--disable-extensions",
  "about:blank",
], { stdio: "ignore" });

let cdp;
try {
  const target = await until(
    async () => (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(),
    "headless Chrome",
  );
  cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;

  if (DIFF) {
    await diff(cdp, DIFF);
  } else if (REF) {
    await shoot(cdp, pathToFileURL(resolve(REF)).href);
  } else {
    await shootApp(cdp);
  }
} finally {
  cdp?.close();
  chrome.kill();
  // kill() returns before Chrome has finished flushing its profile, so the
  // first rm hits a directory that is still growing. Retry rather than exit
  // non-zero on a throwaway temp dir after the PNG is already written.
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

async function shoot(cdp, url) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: 1200, deviceScaleFactor: SCALE, mobile: false,
  });
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 2_000));
  await printEval(cdp);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log(`wrote ${OUT} (${WIDTH}px @ ${SCALE}x, ${url})`);
}

// Compares in the browser's own canvas, so there is no image dependency to add.
// Images of different heights are compared over the shorter one; the height gap
// is reported separately because it is usually the first thing to fix.
async function diff(cdp, [a, b]) {
  const url = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
  const { result } = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
      const [a, b] = await Promise.all([load(${JSON.stringify(url(a))}), load(${JSON.stringify(url(b))})]);
      const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
      const px = (img) => { const c = new OffscreenCanvas(w, h); const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h); };
      const A = px(a), B = px(b), out = new ImageData(w, h);
      let bad = 0;
      for (let i = 0; i < A.data.length; i += 4) {
        const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i+1] - B.data[i+1]) + Math.abs(A.data[i+2] - B.data[i+2]);
        const grey = (A.data[i] + A.data[i+1] + A.data[i+2]) / 6 + 128;
        if (d > 48) { bad++; out.data.set([255, 0, 0, 255], i); } else out.data.set([grey, grey, grey, 255], i);
      }
      const c = new OffscreenCanvas(w, h); c.getContext("2d").putImageData(out, 0, 0);
      const blob = await c.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ""; for (const x of bytes) s += String.fromCharCode(x);
      return { png: btoa(s), mismatch: bad / (w * h), sizes: [a.width, a.height, b.width, b.height] };
    })()`,
  });
  if (!result.value) throw new Error("diff failed: " + JSON.stringify(result));
  const { png, mismatch, sizes } = result.value;
  writeFileSync(OUT, Buffer.from(png, "base64"));
  console.log(`wrote ${OUT} — mismatch ${(mismatch * 100).toFixed(2)}% — a ${sizes[0]}x${sizes[1]}, b ${sizes[2]}x${sizes[3]}`);
}

// SHOT_EVAL="<js expression>" prints its JSON result before the capture, so a
// reviewer can measure the same element (getBoundingClientRect, computed colour,
// font) in the reference and in the app instead of eyeballing two PNGs.
async function printEval(cdp) {
  if (!process.env.SHOT_EVAL) return;
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
    expression: process.env.SHOT_EVAL, returnByValue: true, awaitPromise: true,
  });
  console.log(JSON.stringify(exceptionDetails ? { error: exceptionDetails.text } : result.value, null, 2));
}

async function shootApp(cdp) {
  await cdp.send("Network.enable");
  const { hostname } = new URL(APP);
  const cookie = { domain: hostname, path: "/", httpOnly: true, sameSite: "Lax" };
  await cdp.send("Network.setCookie", {
    ...cookie, name: "prison_token",
    // Never a real token: this one exists to decrypt, not to work.
    value: encryptToken("screenshot-only-not-a-real-token", authSecret()),
  });
  await cdp.send("Network.setCookie", { ...cookie, name: "prison_login", value: "octocat" });

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: 1200, deviceScaleFactor: SCALE, mobile: false,
  });

  // Before any page script, so the theme is dark on the first paint and the
  // board is already patched when the Dashboard makes its first fetch — no
  // flash of the real (empty) board, and no Refresh click to remember.
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      localStorage.setItem("prison.theme", ${JSON.stringify(THEME)});
      localStorage.setItem("prison.mode", ${JSON.stringify(MODE)});
      localStorage.setItem("prison.draftFilter", "all");
      ${pageSnippet()};
      // next dev floats its own overlay badge over the bottom-left corner, and
      // it is not part of the product — it would be in the published image.
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal { display: none !important; }";
        document.head.appendChild(style);
      });
    `,
  });

  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: APP });
  // The lists paint from the patched fetch, which resolves immediately, but
  // React still has to commit and the age badges are computed on mount.
  await new Promise((r) => setTimeout(r, 3_000));

  const title = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("h2")?.textContent ?? "NO DASHBOARD"`,
    returnByValue: true,
  });
  if (title.result.value === "NO DASHBOARD") {
    throw new Error("the dashboard did not render — is the dev server up at " + APP + "?");
  }
  await printEval(cdp);

  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
  });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log(`wrote ${OUT} (${WIDTH}px @ ${SCALE}x, ${THEME}/${MODE}, first section: ${title.result.value})`);
}
