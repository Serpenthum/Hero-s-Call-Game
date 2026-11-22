import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PICKS, MUSIC_PICKS, LICENCES, licencesFor, AUDIO_SOURCE } from './audio-picks.mjs';

const FAMILIES = ['weapon', 'bow', 'fists', 'fire', 'earth', 'ice', 'lightning', 'plant', 'water', 'wind',
  'explosion', 'laserPistol', 'laserRifle', 'emp', 'holy', 'dark', 'arcane'];

const sourcesOf = (pick) => pick.join ?? [pick.source];

test('every pick has an existing source file', (t) => {
  if (!existsSync(AUDIO_SOURCE)) {
    t.skip('audio-source/ is absent (raw downloads are not in git)');
    return;
  }
  for (const pick of [...PICKS, ...MUSIC_PICKS]) {
    for (const src of sourcesOf(pick)) {
      assert.ok(existsSync(join(AUDIO_SOURCE, src)), `${pick.id}: missing ${src}`);
    }
  }
});

test('ids are unique and match the id pattern', () => {
  const ids = PICKS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  // The brief's /^[a-z]+(\.[a-zA-Z]+)?$/ rejects its own laserPistol/laserRifle ids, so the first part is camelCase.
  for (const id of ids) assert.match(id, /^[a-z][a-zA-Z]*(\.[a-zA-Z]+)?$/);
});

test('every family id has both .hit and .crit', () => {
  const ids = new Set(PICKS.map((p) => p.id));
  for (const family of FAMILIES) {
    assert.ok(ids.has(`${family}.hit`), `${family}.hit`);
    assert.ok(ids.has(`${family}.crit`), `${family}.crit`);
  }
});

test('kinds and groups are valid', () => {
  for (const pick of PICKS) {
    assert.ok(['hit', 'crit', 'menu'].includes(pick.kind), pick.id);
    assert.ok(['battle', 'menu', 'binder', 'pack'].includes(pick.group), pick.id);
  }
});

test('every pick has a licence entry', () => {
  for (const pick of [...PICKS, ...MUSIC_PICKS]) {
    for (const src of sourcesOf(pick)) {
      const keys = licencesFor(src);
      assert.ok(keys.length > 0, `${pick.id}: no licence for ${src}`);
      for (const key of keys) {
        const lic = LICENCES[key];
        assert.ok(lic, `${pick.id}: unknown licence key ${key}`);
        for (const field of ['title', 'author', 'licence', 'url']) {
          assert.equal(typeof lic[field], 'string', `${key}.${field}`);
          assert.ok(lic[field].length > 0, `${key}.${field}`);
        }
        assert.equal(typeof lic.creditRequired, 'boolean', `${key}.creditRequired`);
      }
    }
  }
});
