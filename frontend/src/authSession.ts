// The login token the server gives us. It proves requests and the socket connection belong to the
// logged-in account. Kept in memory only (like the rest of the session): reloading the page logs out.
let authToken: string | null = null;

export function setAuthToken(token: string | null | undefined) {
  authToken = token || null;
}

export function getAuthToken(): string | null {
  return authToken;
}

// Request headers for endpoints that act on the logged-in account
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
}
