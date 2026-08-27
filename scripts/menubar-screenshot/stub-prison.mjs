#!/usr/bin/env node
// A PRison the menu-bar plugin can be pointed at while docs/menubar.png is taken.
//
//   node scripts/menubar-screenshot/stub-prison.mjs
//
// The picture has to be a real screenshot — the menu is drawn by macOS, with
// submenus and spacing no mock gets right — and a real menu bar on a working
// machine carries real repositories and real PR titles into a public
// repository. So the plugin is pointed at this instead: the same synthetic
// board docs/screenshot.png uses, served over loopback, with no GitHub
// anywhere in it.
//
// A list is served short the first time it is asked for and complete every
// time after, so the two PRs held back land as arrivals on the second refresh
// and the badge has something to count. Unread is a difference; it needs a
// before.
//
// Taking the shot, once this is running:
//   1. Point the installed plugin at it — PRISON_URL, or the default on the
//      copy in your SwiftBar folder.
//   2. Move ~/Library/Caches/prison-menubar.json aside; it is your own board's
//      memory and this run would overwrite it.
//   3. Refresh the plugin, Mark all read, refresh again: Unread (2).
//   4. Screenshot the open menu, put it at docs/menubar.png, and put your
//      plugin and your state file back.
import { createServer } from "node:http";
import { BOARD } from "../screenshot/demo-board.mjs";

// One ready-to-merge and one review request, which is what the badge counts.
const HELD_BACK = new Set(["PR_m1", "PR_r2"]);
const short = Object.fromEntries(
  Object.entries(BOARD).map(([k, rows]) => [k, rows.filter((r) => !HELD_BACK.has(r.id))]),
);

const PORT = Number(process.env.PORT ?? 7331);
const asked = new Set();
const json = (res, body) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const path = req.url.split("?")[0];
  // Always due: the refreshes are seconds apart, not half an hour.
  if (path === "/api/poll-interval") return json(res, { ms: 0 });
  if (path === "/api/token/env") {
    res.setHeader("Set-Cookie", "prison_token=stub; Path=/; HttpOnly");
    return json(res, { ok: true });
  }
  const list = Object.keys(BOARD).find((k) => path === `/api/${k}`);
  if (!list) return void res.writeHead(404).end();
  const first = !asked.has(list);
  asked.add(list);
  json(res, first ? short[list] : BOARD[list]);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`stub PRison on http://127.0.0.1:${PORT} — point the plugin here`);
});
