import { graphql, GraphqlResponseError } from "@octokit/graphql";

export function ghClient(token: string) {
  return graphql.defaults({ headers: { authorization: `token ${token}` } });
}

// Runs a query but tolerates partial failures. GitHub returns the data it
// could resolve alongside an `errors` array when, for example, one
// organization forbids the token (org PAT/app restrictions). @octokit throws on
// any errors and discards the partial data, which would lose every other org's
// results too — so on a GraphqlResponseError we keep whatever data did come
// back and drop the failed parts. Other errors (network, auth) still throw.
export async function ghQuery<T>(
  token: string,
  query: string,
  vars?: Record<string, unknown>,
): Promise<T> {
  try {
    return (await ghClient(token)(query, vars)) as T;
  } catch (e) {
    if (e instanceof GraphqlResponseError && e.data) return e.data as T;
    throw e;
  }
}
