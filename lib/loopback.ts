const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Returns true if the request originated from a loopback address.
 * Used to restrict endpoints (e.g. /api/token/cli) to local, single-user use only.
 */
export function isLoopback(request: Request): boolean {
  return LOCAL_HOSTS.has(new URL(request.url).hostname);
}
