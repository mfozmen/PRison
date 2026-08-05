import { describe, it, expect, vi, beforeEach } from "vitest";

const { readTokenMock, queryMock } = vi.hoisted(() => ({
  readTokenMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  readToken: readTokenMock,
  readLogin: vi.fn(),
}));
vi.mock("@/lib/github/client", () => ({ ghQuery: queryMock }));

import { GET } from "./route";
import { PROJECT_OWNER, PROJECT_NAME } from "@/lib/project";

beforeEach(() => {
  readTokenMock.mockReset();
  queryMock.mockReset();
});

describe("GET /api/latest-release", () => {
  it("returns 401 when there is no token", async () => {
    readTokenMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the latest release tag", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({
      data: { repository: { latestRelease: { tagName: "v1.6.0" } } },
      partial: false,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tagName: "v1.6.0" });
  });

  it("asks about PRison itself, not whatever repo the user is looking at", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({ data: {}, partial: false });
    await GET();
    expect(queryMock).toHaveBeenCalledWith("t", expect.any(String), {
      owner: PROJECT_OWNER,
      name: PROJECT_NAME,
    });
  });

  it("reports no release as null rather than omitting the field", async () => {
    // The client distinguishes "no release" from "couldn't ask"; an absent
    // field would collapse the two.
    readTokenMock.mockResolvedValue("t");
    queryMock.mockResolvedValue({
      data: { repository: { latestRelease: null } },
      partial: false,
    });
    const res = await GET();
    expect(await res.json()).toEqual({ tagName: null });
  });

  it("returns 502 when GitHub API throws", async () => {
    readTokenMock.mockResolvedValue("t");
    queryMock.mockRejectedValue(new Error("network error"));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream GitHub error");
  });
});
