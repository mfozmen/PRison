import { graphql } from "@octokit/graphql";

export function ghClient(token: string) {
  return graphql.defaults({ headers: { authorization: `token ${token}` } });
}
