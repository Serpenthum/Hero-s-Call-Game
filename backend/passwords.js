// Password hashing with WebCrypto PBKDF2 (works in Node 22 and Cloudflare Workers).
// Cloudflare caps PBKDF2 at 100,000 iterations, so that is exactly what we use.
const ITERATIONS = 100000;
const SALT_BYTES = 16;

const toB64 = (bytes) => Buffer.from(bytes).toString('base64');
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function derive(password, salt, iterations) {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(String(password), salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

async function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = Number(parts[1]);
    if (iterations !== ITERATIONS) return false;
    const expected = fromB64(parts[3]);
    const actual = await derive(String(password), fromB64(parts[2]), iterations);
    if (expected.length !== actual.length) return false;
    let diff = 0; // constant-time compare
    for (let i = 0; i < actual.length; i++) diff |= expected[i] ^ actual[i];
    return diff === 0;
  } catch (e) {
    return false;
  }
}

// Hash of 32 random bytes: an account nobody can log into
async function randomPasswordHash() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return hashPassword(toB64(bytes));
}

module.exports = { hashPassword, verifyPassword, randomPasswordHash };
