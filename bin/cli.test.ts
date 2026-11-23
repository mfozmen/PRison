import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  configDir, parseArgs, serverEnv, openCommand, nodeIsSupported, banner,
} from "./cli.mjs";

describe("configDir", () => {
  it("uses %APPDATA% on Windows and ~/.config elsewhere, honouring XDG", () => {
    expect(configDir({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32", "C:\\Users\\a")).toBe(
      join("C:\\Users\\a\\AppData\\Roaming", "prison"),
    );
    expect(configDir({}, "darwin", "/Users/a")).toBe(join("/Users/a", ".config", "prison"));
    expect(configDir({ XDG_CONFIG_HOME: "/x" }, "linux", "/home/a")).toBe(join("/x", "prison"));
  });
});

describe("banner", () => {
  const args = {
    version: "1.34.0",
    url: "http://127.0.0.1:7747",
    token: "gh",
    dir: "/home/a/.config/prison",
  };
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

  it("shows where it is, how you signed in, where it keeps things, and how to leave", () => {
    const text = banner(args);
    expect(text).toContain("P R I S O N");
    expect(text).toContain("The bars are made of merge conflicts.");
    expect(text).toContain("v1.34.0");
    expect(text).toContain(args.url);
    expect(text).toContain(args.dir);
    expect(text).toContain("GitHub CLI token");
    expect(text).toContain("Ctrl+C");
  });

  it("asks for a token when the GitHub CLI has none", () => {
    expect(banner({ ...args, token: "" })).toContain("paste a token in the browser");
  });

  it("keeps every box line the same width; color only adds escape codes", () => {
    const plain = banner(args);
    expect(new Set(plain.split("\n").slice(0, 6).map((l) => l.length))).toEqual(new Set([70]));
    expect(strip(banner({ ...args, color: true }))).toBe(plain);
  });
});

// The result is a union; these read the one field each case is about.
const field = (args: string[], key: "error" | "help") => (parseArgs(args) as { error?: string; help?: string })[key];

describe("parseArgs", () => {
  it("defaults to port 7747 and opening the browser", () => {
    expect(parseArgs([])).toEqual({ port: 7747, open: true });
  });

  it("reads a port in either spelling, and --no-open", () => {
    expect(parseArgs(["-p", "8000", "--no-open"])).toEqual({ port: 8000, open: false });
    expect(parseArgs(["--port=9000"])).toEqual({ port: 9000, open: true });
  });

  it("refuses a bad port or an unknown option", () => {
    expect(field(["--port", "abc"], "error")).toMatch(/Not a port/);
    expect(field(["--port"], "error")).toMatch(/missing/);
    expect(field(["--nope"], "error")).toMatch(/Unknown option: --nope/);
  });

  it("answers --help and --version", () => {
    expect(field(["--help"], "help")).toMatch(/npx @mfozmen\/prison/);
    expect(parseArgs(["-v"])).toEqual({ version: true });
  });
});

describe("serverEnv", () => {
  const dir = join("/home/a", ".config", "prison");

  it("listens on this machine only, with the data files in the config folder", () => {
    const env = serverEnv({ PATH: "/bin" }, { dir, secret: "s", port: 7747, token: "" });
    expect(env).toMatchObject({
      PATH: "/bin", NODE_ENV: "production", PORT: "7747", HOSTNAME: "127.0.0.1", AUTH_SECRET: "s",
      PRISON_POLL_INTERVAL_FILE: join(dir, "poll-interval"),
      PRISON_LATEST_RELEASE_FILE: join(dir, "latest-release.json"),
    });
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it("uses the GitHub CLI token only when you set none yourself", () => {
    expect(serverEnv({}, { dir, secret: "s", port: 1, token: "cli" }).GITHUB_TOKEN).toBe("cli");
    expect(serverEnv({ GITHUB_TOKEN: "mine" }, { dir, secret: "s", port: 1, token: "cli" }).GITHUB_TOKEN).toBe("mine");
    expect(serverEnv({ GH_TOKEN: "gh" }, { dir, secret: "s", port: 1, token: "cli" }).GITHUB_TOKEN).toBeUndefined();
  });

  it("keeps an AUTH_SECRET you set yourself", () => {
    expect(serverEnv({ AUTH_SECRET: "mine" }, { dir, secret: "s", port: 1, token: "" }).AUTH_SECRET).toBe("mine");
  });
});

describe("openCommand and nodeIsSupported", () => {
  it("opens the browser the platform's way", () => {
    expect(openCommand("darwin", "u")).toEqual(["open", ["u"]]);
    expect(openCommand("win32", "u")).toEqual(["cmd", ["/c", "start", "", "u"]]);
    expect(openCommand("linux", "u")).toEqual(["xdg-open", ["u"]]);
  });

  it("needs Node 20 or newer", () => {
    expect(nodeIsSupported("22.3.0")).toBe(true);
    expect(nodeIsSupported("18.19.0")).toBe(false);
  });
});
