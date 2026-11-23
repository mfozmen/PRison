// The parts of the `prison` command that decide things, kept free of side
// effects so they can be tested: where the config lives, what the server is
// started with, and what the arguments mean.

import { join } from "node:path";

export const DEFAULT_PORT = 7747;
export const MIN_NODE = 20;

/** Where PRison keeps its secret and its two small data files, per platform:
 * %APPDATA%\prison on Windows, $XDG_CONFIG_HOME/prison or ~/.config/prison
 * elsewhere (macOS included, so the path is the same one Linux users expect). */
export function configDir(env, platform, home) {
  if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "prison");
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "prison");
}

const HELP = `Usage: npx @mfozmen/prison@latest [options]

Starts PRison on this machine and opens it in your browser.

Options:
  -p, --port <n>   port to listen on (default ${DEFAULT_PORT})
      --no-open    don't open the browser
  -v, --version    print the version
  -h, --help       print this help

Signed in to the GitHub CLI? PRison signs you in with it. Otherwise it asks
for a token in the browser.`;

/** Reads the arguments. Returns { help } or { version } for those two, or the
 * run options; an unknown argument or a bad port is an error with a message. */
export function parseArgs(argv) {
  const opts = { port: DEFAULT_PORT, open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") return { help: HELP };
    if (a === "-v" || a === "--version") return { version: true };
    if (a === "--no-open") opts.open = false;
    else if (a === "-p" || a === "--port" || a.startsWith("--port=")) {
      const raw = a.startsWith("--port=") ? a.slice(7) : argv[++i];
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { error: `Not a port: ${raw ?? "(missing)"}` };
      }
      opts.port = port;
    } else return { error: `Unknown option: ${a}\n\n${HELP}` };
  }
  return opts;
}

/** The environment the server runs with. It listens on this machine only: the
 * session is minted from your GitHub credentials, so a port reachable from the
 * network would hand them to anyone who can reach it. */
export function serverEnv(base, { dir, secret, port, token }) {
  const env = {
    ...base,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    AUTH_SECRET: base.AUTH_SECRET || secret,
    PRISON_POLL_INTERVAL_FILE: join(dir, "poll-interval"),
    PRISON_LATEST_RELEASE_FILE: join(dir, "latest-release.json"),
  };
  // A token you set yourself wins; the GitHub CLI's is the fallback.
  if (!base.GITHUB_TOKEN && !base.GH_TOKEN && token) env.GITHUB_TOKEN = token;
  return env;
}

/** The startup banner, printed once the server answers. ASCII only, because a
 * Windows console in a non-UTF-8 code page turns box-drawing characters into
 * mojibake. Colored only when the caller says the terminal takes it. */
export function banner({ version, url, token, dir, color = false }) {
  const fg = (rgb, s) => (color ? `\x1b[38;2;${rgb}m${s}\x1b[39m` : s);
  const dim = (s) => (color ? `\x1b[2m${s}\x1b[22m` : s);
  const bold = (s) => (color ? `\x1b[1m${s}\x1b[22m` : s);
  const slate = (s) => fg("148;163;184", s);
  const green = (s) => fg("34;197;94", s);
  const amber = (s) => fg("245;158;11", s);
  const white = (s) => fg("248;250;252", s);

  // A cell door: bars above and below, `| |` at either side, content inside.
  const WIDTH = 70;
  const INNER = WIDTH - 12;
  const bars = dim(slate("| ".repeat(WIDTH / 2)));
  const edge = dim(slate("| |   "));
  const close = dim(slate("   | |"));
  const blank = edge + " ".repeat(INNER) + close;
  const row = (leftPlain, left, rightPlain = "", right = "") =>
    edge + left + " ".repeat(INNER - leftPlain.length - rightPlain.length) + right + close;
  const line = (label, value) => "     " + dim(slate(label.padEnd(13))) + value;

  const slogan = "The bars are made of merge conflicts.";
  return [
    bars,
    blank,
    row("P R I S O N", bold(green("P R")) + bold(white(" I S O N")), `v${version}`, dim(`v${version}`)),
    row(slogan, dim(slogan), "read-only", dim("read-only")),
    blank,
    bars,
    "",
    line("WARDEN", amber(token ? "GitHub CLI token" : "paste a token in the browser")),
    line("CELL BLOCK", slate(dir)),
    line("GATE OPEN", green(url)),
    line("PAROLE", dim("Ctrl+C")),
  ].join("\n");
}

/** The command that opens a URL in the default browser. */
export function openCommand(platform, url) {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") return ["cmd", ["/c", "start", "", url]];
  return ["xdg-open", [url]];
}

/** True when this Node is new enough to run the server. */
export function nodeIsSupported(version) {
  return Number(version.split(".")[0]) >= MIN_NODE;
}
