import { describe, it, expect, vi, beforeEach } from "vitest";

const { readTokenMock, readLoginMock, queryMock } = vi.hoisted(() => ({
  readTokenMock: vi.fn(),
  readLoginMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  readToken: readTokenMock,
  readLogin: readLoginMock,
}));
vi.mock("@/lib/github/client", () => ({ ghQuery: queryMock }));

import Home from "./page";

const ORGS_RAW = {
  viewer: {
    organizations: {
      nodes: [
        { login: "useinsider", avatarUrl: "" },
        { login: "editedtech", avatarUrl: "" },
        { login: "mayademcom", avatarUrl: "" },
      ],
    },
  },
};

beforeEach(() => {
  readTokenMock.mockReset();
  readLoginMock.mockReset();
  queryMock.mockReset();
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
      "useinsider",
      "editedtech",
      "mayademcom",
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
