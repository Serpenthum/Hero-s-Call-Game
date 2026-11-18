// The login token the server gives us. It proves requests and the socket connection belong to the
// logged-in account. It is also kept in sessionStorage so a refresh (or a quick app switch that
// reloads the page) logs straight back in and rejoins a battle in progress. sessionStorage belongs to
// this tab only and is wiped when the tab closes, so a shared classroom device is not left logged in.
let authToken: string | null = null;

const SESSION_KEY = 'heroCallSession';

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

export interface SavedSession<U> {
  userId: number;
  token: string;
  user: U;
}

// Remembers the logged-in account for this tab (call whenever the user changes)
export function saveSession<U extends { id: number }>(user: U) {
  if (!authToken || !user || user.id <= 0) return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, token: authToken, user }));
  } catch {
    /* storage blocked: a refresh just needs a password again */
  }
}

// The account saved by this tab, with its token put back in use; null when there is none
export function restoreSession<U extends { id: number }>(): SavedSession<U> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedSession<U>;
    if (!saved || typeof saved.token !== 'string' || !saved.user || saved.user.id !== saved.userId) return null;
    authToken = saved.token;
    return saved;
  } catch {
    return null;
  }
}

// Forgets the saved account (sign out, a forced logout, or the server refusing the token)
export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing saved */
  }
}
