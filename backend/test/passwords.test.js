const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword, randomPasswordHash } = require('../passwords');

test('hashPassword produces pbkdf2 format', async () => {
  const h = await hashPassword('secret1');
  assert.match(h, /^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
});

test('hashes of the same password differ', async () => {
  assert.notStrictEqual(await hashPassword('secret1'), await hashPassword('secret1'));
});

test('verifyPassword accepts right and rejects wrong password', async () => {
  const h = await hashPassword('secret1');
  assert.strictEqual(await verifyPassword('secret1', h), true);
  assert.strictEqual(await verifyPassword('secret2', h), false);
});

test('verifyPassword returns false for garbage without throwing', async () => {
  assert.strictEqual(await verifyPassword('x', 'garbage'), false);
});

test('randomPasswordHash is unusable', async () => {
  assert.strictEqual(await verifyPassword('anything', await randomPasswordHash()), false);
});
