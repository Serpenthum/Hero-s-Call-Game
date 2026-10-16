// Login tokens. Logging in returns a random token; requests and socket connections that act on an
// account must present it, so a client can't simply claim to be another user id.
// Tokens live in memory: a server restart logs everyone out, same as the existing session maps.
const crypto = require('crypto');

function createAuth() {
  const tokenToUser = new Map(); // token -> userId
  const userToToken = new Map(); // userId -> token (one live token per user)

  function issueToken(userId) {
    const id = Number(userId);
    revokeUser(id); // logging in again invalidates the previous session's token
    const token = crypto.randomBytes(32).toString('hex');
    tokenToUser.set(token, id);
    userToToken.set(id, token);
    return token;
  }

  // The user a token belongs to, or null
  function verify(token) {
    if (typeof token !== 'string' || !token) return null;
    const id = tokenToUser.get(token);
    return id === undefined ? null : id;
  }

  // True only if the token belongs to this user (ids arrive as numbers or strings)
  function verifyUser(token, userId) {
    const owner = verify(token);
    return owner !== null && owner === Number(userId);
  }

  function revokeUser(userId) {
    const id = Number(userId);
    const token = userToToken.get(id);
    if (token) tokenToUser.delete(token);
    userToToken.delete(id);
  }

  function tokenFromRequest(req) {
    const header = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (typeof header !== 'string') return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
  }

  // Express middleware: requires a valid token, exposes req.userId, and refuses a request that names
  // a different user in its body, query string or URL.
  function requireUser(req, res, next) {
    const userId = verify(tokenFromRequest(req));
    if (userId === null) {
      return res.status(401).json({ success: false, message: 'Please log in again' });
    }
    const claimed = [req.body && req.body.userId, req.query && req.query.userId, req.params && req.params.userId];
    for (const value of claimed) {
      if (value !== undefined && value !== null && value !== '' && Number(value) !== userId) {
        return res.status(403).json({ success: false, message: 'That is not your account' });
      }
    }
    req.userId = userId;
    next();
  }

  return { issueToken, verify, verifyUser, revokeUser, requireUser };
}

module.exports = { createAuth };
