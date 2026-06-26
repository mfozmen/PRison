/** Sample GraphQL responses for use in tests. */

/** Two PRs: one all-green (excluded by parseStuckPrs), one with 2 failing + 1 pending (included). */
export const STUCK_PRS_RAW = {
  search: {
    nodes: [
      {
        __typename: "PullRequest",
        id: "1",
        title: "green",
        url: "u1",
        number: 1,
        repository: { nameWithOwner: "acme/a" },
        commits: {
          nodes: [
            {
              commit: {
                pushedDate: "2026-06-25T00:00:00Z",
                committedDate: "2026-06-25T00:00:00Z",
                statusCheckRollup: {
                  contexts: { nodes: [{ conclusion: "SUCCESS" }] },
                },
              },
            },
          ],
        },
      },
      {
        __typename: "PullRequest",
        id: "2",
        title: "stuck",
        url: "u2",
        number: 2,
        repository: { nameWithOwner: "acme/b" },
        commits: {
          nodes: [
            {
              commit: {
                pushedDate: "2026-06-20T00:00:00Z",
                committedDate: "2026-06-20T00:00:00Z",
                statusCheckRollup: {
                  contexts: {
                    nodes: [
                      { conclusion: "FAILURE" },
                      { conclusion: "FAILURE" },
                      { status: "IN_PROGRESS" },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ],
  },
};

/** One review-request PR assigned to viewer "me". */
export const REVIEW_REQUESTS_RAW = {
  search: {
    nodes: [
      {
        id: "9",
        title: "needs me",
        url: "u9",
        number: 9,
        updatedAt: "2026-06-24T00:00:00Z",
        repository: { nameWithOwner: "acme/c" },
        author: { login: "alice" },
        timelineItems: {
          nodes: [
            { requestedReviewer: { login: "me" }, createdAt: "2026-06-22T00:00:00Z" },
            { requestedReviewer: { login: "bob" }, createdAt: "2026-06-23T00:00:00Z" },
          ],
        },
      },
    ],
  },
};

/** Sample org list response. */
export const ORGS_RAW = {
  viewer: {
    organizations: {
      nodes: [{ login: "acme", avatarUrl: "https://example.com/avatar.png" }],
    },
  },
};
