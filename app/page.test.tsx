import { describe, it, expect, vi, beforeEach } from "vitest";

const { readTokenMock, readLoginMock, readSignedOutMock, queryMock } = vi.hoisted(() => ({
  readTokenMock: vi.fn(),
  readLoginMock: vi.fn(),
  readSignedOutMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  readToken: readTokenMock,
  readLogin: readLoginMock,
  readSignedOut: readSignedOutMock,
}));
vi.mock("@/lib/github/client", () => ({ ghQuery: queryMock }));

import Home from "./page";
import { EnvSignIn } from "@/components/EnvSignIn";
import { TokenForm } from "@/components/TokenForm";

// The signed-out screen is a <main> wrapping exactly one of these two.
function signInComponent(el: { props: { children: { type: unknown } } }) {
  return el.props.children.type;
}

const ORGS_RAW = {
  viewer: {
    organizations: {
      nodes: [
        { login: "acme", avatarUrl: "" },
        { login: "globex", avatarUrl: "" },
        { login: "initech", avatarUrl: "" },
      ],
    },
  },
};

beforeEach(() => {
  readTokenMock.mockReset();
  readLoginMock.mockReset();
  readSignedOutMock.mockReset();
  readSignedOutMock.mockResolvedValue(false);
  queryMock.mockReset();
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
});

describe("Home page", () => {
  // Regression guard: ghQuery now returns { data, partial }. If page.tsx forwards
  // the whole wrapper to parseOrgs instead of unwrapping `.data`, the org list
  // silently becomes empty (parseOrgs reads raw.viewer, which is undefined on the
  // wrapper). parseOrgs takes `any`, so tsc cannot catch this — only a test can.
  it("unwraps ghQuery's { data } wrapper so the org filter is populated", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockResolvedValue({ data: ORGS_RAW, partial: false });

    const el = await Home();

    expect(el.props.orgs.map((o: { login: string }) => o.login)).toEqual([
      "acme",
      "globex",
      "initech",
    ]);
    expect(el.props.login).toBe("mfozmen");
  });

  it("falls back to an empty org list when the org fetch fails (non-fatal)", async () => {
    readTokenMock.mockResolvedValue("t");
    readLoginMock.mockResolvedValue("mfozmen");
    queryMock.mockRejectedValue(new Error("network error"));

    const el = await Home();

    expect(el.props.orgs).toEqual([]);
  });
});

describe("Home page — signed out", () => {
  it("auto-signs-in from the env token on a fresh visit", async () => {
    readTokenMock.mockResolvedValue(null);
    process.env.GITHUB_TOKEN = "t";

    expect(signInComponent(await Home())).toBe(EnvSignIn);
  });

  // The bug: sign-out cleared the cookie, page.tsx rendered EnvSignIn, EnvSignIn
  // POSTed /api/token/env on mount, and the user was signed straight back in.
  it("does NOT auto-sign-in after an explicit sign-out, even with an env token", async () => {
    readTokenMock.mockResolvedValue(null);
    readSignedOutMock.mockResolvedValue(true);
    process.env.GITHUB_TOKEN = "t";

    const type = signInComponent(await Home());
    expect(type).toBe(TokenForm);
    expect(type).not.toBe(EnvSignIn);
  });

  it("offers the host-token button when an env token exists", async () => {
    readTokenMock.mockResolvedValue(null);
    readSignedOutMock.mockResolvedValue(true);
    process.env.GITHUB_TOKEN = "t";

    const el = await Home();
    expect(el.props.children.props.hasEnvToken).toBe(true);
  });

  it("shows the plain token form when there is no env token", async () => {
    readTokenMock.mockResolvedValue(null);

    const el = await Home();
    expect(signInComponent(el)).toBe(TokenForm);
    expect(el.props.children.props.hasEnvToken).toBe(false);
  });

  it("honours GH_TOKEN as well as GITHUB_TOKEN", async () => {
    readTokenMock.mockResolvedValue(null);
    process.env.GH_TOKEN = "t";

    expect(signInComponent(await Home())).toBe(EnvSignIn);
  });
});
