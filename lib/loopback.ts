const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostname(value: string | null): string {
  if (!value) return "";
  // Strip the port. Bracketed IPv6 (e.g. "[::1]:3000") keeps its brackets.
  return value.startsWith("[") ? value.slice(0, value.indexOf("]") + 1) : value.split(":")[0];
}

/**
 * Returns true if the request came from a loopback origin. When there is a Host
 * header it decides alone: it is what the browser asked for, reliable behind
 * Docker's port forwarding (where request.url is built from the container's bind
 * address), and the only thing that tells a DNS-rebound page apart — its name
 * resolves to 127.0.0.1, so a server bound there builds a loopback request.url
 * for it, but its Host still names the attacker's site. The URL is consulted
 * only when there is no Host header at all.
 * Used to restrict endpoints (e.g. /api/token/cli) to local, single-user use only.
 */
export function isLoopback(request: Request): boolean {
  const fromHeader = hostname(request.headers.get("host"));
  if (fromHeader) return LOCAL_HOSTS.has(fromHeader);
  return LOCAL_HOSTS.has(new URL(request.url).hostname);
}
