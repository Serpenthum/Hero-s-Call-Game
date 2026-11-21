import { authHeaders, clearSession, setAuthToken } from './authSession';

type Post = (url: string, init: RequestInit) => Promise<unknown>;

// Ends this tab's login. A sign-out the player chose also ends the session on the server
// (notifyServer). A forced logout (the account moved to another tab or device, which may share this
// tab's token after "Duplicate tab") is local only: telling the server would revoke the shared token
// and kick the other tab too.
export async function endSession(opts: { notifyServer: boolean; userId?: number | null; apiBase: string; post?: Post }) {
  clearSession();
  if (opts.notifyServer && opts.userId) {
    const post: Post = opts.post ?? ((url, init) => fetch(url, init));
    try {
      await post(`${opts.apiBase}/api/logout`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId: opts.userId })
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
  }
  setAuthToken(null);
}

// Forgets the login in this tab only (no server call)
export function signOutLocally() {
  clearSession();
  setAuthToken(null);
}
