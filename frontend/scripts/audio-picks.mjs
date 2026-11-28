// The owner's sound and music picks (spec 2026-11-22-redesign-step6-sound-design.md, section 2 and 3).
// Source paths are relative to Game/audio-source/ (raw downloads, never committed).
// Read by build-audio.mjs, which writes public/audio/, src/sound/manifest.ts and public/audio/CREDITS.md.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const AUDIO_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../../audio-source');

const S = (name) => `battle_pack/battle_sound_effects/${name}`;
const H = (n) => `hits_pack/hits/hit${String(n).padStart(2, '0')}.mp3.flac`;
const L = (n) => `heal_pack/Impacts/Healing Spell ${n === 8 ? 'impact' : 'Impact'} ${n}.wav`;
const P = (name) => `combat_pack/04_magic_spells/${name}.wav`;
const X = (name) => `combat_pack/03_explosions_destruction/${name}.wav`;
const R = (name) => `combat_pack/02_combat_ranged/${name}.wav`;
const U = (name) => `ui_pack/${name}.aif`;
const K = (name) => `rpg_pack/Audio/${name}.ogg`;

const S1 = S('Bow.wav');
const S2 = S('swish_2.wav');
const S4 = S('swish_4.wav');
const A1 = 'preview/archer-crit-1.mp3'; // Bow + H7 delayed 180 ms at 0.9, mixed, limited (owner-picked by ear)

const battle = (id, source, kind) => ({ id, source, kind, group: 'battle' });
const family = (name, hit, crit) => [battle(`${name}.hit`, hit, 'hit'), battle(`${name}.crit`, crit, 'crit')];

export const PICKS = [
  ...family('weapon', S4, H(7)),
  battle('weapon.miss', S2, 'hit'),
  ...family('bow', S1, A1),
  ...family('fists', H(30), H(31)),
  ...family('fire', P('Fire Spell Impact 1_s06'), P('Fire Spell Impact 2_s06')), // P11 / P12
  ...family('earth', P('Earth Spell Impact 1_s07'), P('Earth Spell Impact 4_s07')), // P1 / P4
  ...family('ice', P('Ice Spell Impact 3_s06'), P('Ice Spell Impact 1_s06')), // P19 / P17
  ...family('lightning', P('Lightning Spell Impact 2_s06'), P('Lightning Spell Impact 5_s06')), // P23 / P26
  ...family('plant', P('Plant Spell Impact 1_s07'), P('Plant Spell Impact 4_s07')), // P27 / P30
  ...family('water', P('Water Spell Impact 1_s06'), P('Water Spell Impact 2_s06')), // P54 / P55
  ...family('wind', P('Wind Spell Impact 4_s07'), P('Wind Spell Impact 1_s07')), // P62 / P59
  ...family('explosion', // X13 / X11
    X('explosion_crunch_003_48kHz_16bit_1.55s_4b973e9c_s04'),
    X('explosion_crunch_001_48kHz_16bit_1.36s_5803a7f0_s04')),
  ...family('laserPistol', R('Laser Pistol 1_s09'), R('Laser Pistol 4_s09')), // R9 / R12
  ...family('laserRifle', R('Laser Rifle 1_s09'), R('Laser Rifle 5_s09')), // R14 / R18
  ...family('emp', X('ElectricExplosion_s01'), X('ElectricExplosion_s01')), // X9 / X9 louder
  ...family('holy', L(1), L(1)),
  ...family('dark', L(2), L(2)),
  ...family('arcane', L(3), L(3)),
  battle('spell.miss', L(4), 'hit'),
  battle('heal', L(14), 'hit'),
  battle('heal.water', P('Water Spell Impact 5_s06'), 'hit'), // P58
  battle('summon', L(7), 'hit'),
  battle('buff.self', L(11), 'hit'),
  battle('buff.other', L(5), 'hit'),
  { id: 'coin', source: U('Coin01'), kind: 'menu', group: 'menu' }, // U2
  { id: 'levelup', source: U('Rise03'), kind: 'menu', group: 'menu', maxSeconds: 2.5 }, // U9
  { id: 'quest', source: U('Rise06'), kind: 'menu', group: 'menu', maxSeconds: 2.5 }, // U12
  // K7 bookOpen then K4 bookFlip1: K4 starts when K7 ends.
  { id: 'binder.open', source: K('bookOpen'), join: [K('bookOpen'), K('bookFlip1')], kind: 'menu', group: 'binder' },
  { id: 'binder.page', source: K('bookFlip2'), kind: 'menu', group: 'binder' }, // K5
  { id: 'pack.tear', source: K('drawKnife2'), kind: 'menu', group: 'pack' }, // K28
  { id: 'pack.holo', source: U('Rise02'), kind: 'menu', group: 'pack' }, // U8
];

export const MUSIC_PICKS = [
  { id: 'harp', source: 'Harp.mp3', file: 'music/harp.m4a', use: 'menu' },
  { id: 'woods', source: 'woods.wav', file: 'music/woods.m4a', use: 'menu', filter: 'highpass=f=90,bass=g=-10:f=220:w=0.8' }, // W4
  { id: 'evil-awaits', source: 'evil_awaits.mp3', file: 'music/evil-awaits.m4a', use: 'battle' },
];

export const LICENCES = {
  harp: { title: 'Soft Mysterious Harp Loop', author: 'VWolfdog (Jordy Hake)', licence: 'CC-BY 3.0', url: 'https://opengameart.org/content/soft-mysterious-harp-loop', creditRequired: true },
  woods: { title: 'Woods', author: 'Axton Crolley', licence: 'CC-BY 3.0', url: 'https://opengameart.org/content/woods', creditRequired: true },
  evilAwaits: { title: 'Evil Awaits', author: 'bosslevelaudio (Glenn Loughran)', licence: 'CC0 (multi-licence, used under CC0)', url: 'https://opengameart.org/content/evil-awaits', creditRequired: false },
  battle: { title: 'Battle Sound Effects', author: 'TBC (see source page)', licence: 'CC0', url: 'https://opengameart.org/content/battle-sound-effects', creditRequired: false },
  hits: { title: '37 hits/punches', author: 'independent.nu ljudbank', licence: 'CC0', url: 'https://opengameart.org/content/37-hitspunches', creditRequired: false },
  heal: { title: 'Healing Spell Impacts', author: 'lentikula', licence: 'CC0', url: 'https://lentikula.itch.io/healing-spell-impacts', creditRequired: false },
  combat: { title: '150 Combat Sound Effects', author: 'untamedpixels', licence: 'CC0', url: 'https://opengameart.org/node/195932', creditRequired: false },
  soundPack01: { title: 'Level up, Power up, Coin get (SoundPack01)', author: 'WobbleBoxx', licence: 'CC0', url: 'https://opengameart.org/content/level-up-power-up-coin-get-13-sounds', creditRequired: false },
  kenneyRpg: { title: 'RPG Audio', author: 'Kenney', licence: 'CC0', url: 'https://kenney.nl/assets/rpg-audio', creditRequired: false },
};

const BY_PREFIX = [
  ['Harp.mp3', ['harp']],
  ['woods.wav', ['woods']],
  ['evil_awaits.mp3', ['evilAwaits']],
  ['battle_pack/', ['battle']],
  ['hits_pack/', ['hits']],
  ['heal_pack/', ['heal']],
  ['combat_pack/', ['combat']],
  ['ui_pack/', ['soundPack01']],
  ['rpg_pack/', ['kenneyRpg']],
  [A1, ['battle', 'hits']], // the layered archer crit is made from Bow.wav and hit07
];

/** Licence keys (into LICENCES) for one source path. */
export function licencesFor(source) {
  return BY_PREFIX.find(([prefix]) => source.startsWith(prefix))?.[1] ?? [];
}
