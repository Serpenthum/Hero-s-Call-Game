// Builds the game's sound and music files from the raw downloads in Game/audio-source/.
// Run by hand: `npm run build:audio` (needs ffmpeg; set FFMPEG to override the path).
// Writes public/audio/sfx/*.mp3, public/audio/music/*.m4a, public/audio/CREDITS.md and src/sound/manifest.ts.
// Pass --measure to only print the loudness of the shipped files.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { PICKS, MUSIC_PICKS, LICENCES, licencesFor, AUDIO_SOURCE } from './audio-picks.mjs';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(FRONTEND, 'public/audio');
const MANIFEST = join(FRONTEND, 'src/sound/manifest.ts');
const FFMPEG = process.env.FFMPEG
  ?? 'C:/Users/David/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.1-full_build/bin/ffmpeg.exe';

const TARGET = { hit: -20, menu: -20, crit: -17.5 }; // LUFS, momentary max (in-game volume can be raised in code)
const LIMIT = 0.95; // effects peak safety
const LIMIT_DB = 20 * Math.log10(LIMIT);
const MUSIC_I = -20; // LUFS integrated
const MUSIC_LIMIT = 0.89; // about -1 dBFS
const MAX_SECONDS = 2.0;
const FADE_SECONDS = 0.3;

const fileFor = (id) => `sfx/${id.replace(/\./g, '-')}.mp3`;

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${args.join(' ')}):\n${r.stderr.slice(-2000)}`);
  return r.stderr;
}

function durationOf(path) {
  const probe = FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m, ext) => `ffprobe${ext ?? ''}`);
  const out = execFileSync(probe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' });
  return parseFloat(out);
}

/** Loudest momentary (400 ms) loudness in LUFS, with 0.5 s silence padded after so short sounds get full windows. */
function momentaryMax(path) {
  const log = ffmpeg(['-i', path, '-af', 'apad=pad_dur=0.5,ebur128', '-f', 'null', '-']);
  let max = -Infinity;
  for (const m of log.matchAll(/\bM:\s*(-?[\d.]+|-inf)/g)) {
    const v = m[1] === '-inf' ? -Infinity : parseFloat(m[1]);
    if (v > max) max = v;
  }
  return max;
}

/** Sample peak in dBFS. */
function samplePeak(path) {
  const log = ffmpeg(['-i', path, '-af', 'volumedetect', '-f', 'null', '-']);
  return parseFloat(log.match(/max_volume:\s*(-?[\d.]+) dB/)[1]);
}

function buildEffect(pick, tmp) {
  const sources = (pick.join ?? [pick.source]).map((s) => join(AUDIO_SOURCE, s));
  const inputs = sources.flatMap((s) => ['-i', s]);
  const norm = '[0:a]aformat=sample_rates=44100:channel_layouts=mono';
  const joined = sources.length > 1
    ? `${sources.map((_, i) => `[${i}:a]aformat=sample_rates=44100:channel_layouts=mono[a${i}]`).join(';')};`
      + `${sources.map((_, i) => `[a${i}]`).join('')}concat=n=${sources.length}:v=0:a=1`
    : norm;
  const trimmed = join(tmp, 'trimmed.wav');
  ffmpeg([...inputs, '-filter_complex', `${joined},silenceremove=start_periods=1:start_threshold=-50dB[out]`,
    '-map', '[out]', '-ac', '1', '-ar', '44100', trimmed]);

  const maxSeconds = pick.maxSeconds ?? MAX_SECONDS;
  const length = durationOf(trimmed);
  const cut = length > maxSeconds
    ? `atrim=0:${maxSeconds},afade=t=out:st=${(maxSeconds - FADE_SECONDS).toFixed(2)}:d=${FADE_SECONDS},`
    : '';
  const shaped = join(tmp, 'shaped.wav');
  ffmpeg(['-i', trimmed, '-af', `${cut}anull`, shaped]);

  // One fixed gain to the target; the limiter is only a peak safety. Its peak reduction is reported per file.
  const gain = TARGET[pick.kind] - momentaryMax(shaped);
  const limiting = Math.max(0, samplePeak(shaped) + gain - LIMIT_DB);
  ffmpeg(['-i', shaped, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${LIMIT}:attack=1:release=10:level=disabled`,
    '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', join(OUT, fileFor(pick.id))]);
  return { gain, limiting, length: Math.min(length, maxSeconds) };
}

// Music: measure, then one fixed (linear) gain to -20 LUFS integrated, so dynamic tracks are not pumped the way
// loudnorm's dynamic mode would. A limiter at about -1 dBFS is only a peak safety; its reduction is reported.
function buildMusic(pick) {
  const src = join(AUDIO_SOURCE, pick.source);
  const pre = pick.filter ? `${pick.filter},` : '';
  const log = ffmpeg(['-i', src, '-af', `${pre}loudnorm=I=${MUSIC_I}:TP=-1:LRA=20:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const gain = MUSIC_I - parseFloat(m.input_i);
  const limiting = Math.max(0, parseFloat(m.input_tp) + gain - 20 * Math.log10(MUSIC_LIMIT));
  ffmpeg(['-i', src, '-af', `${pre}volume=${gain.toFixed(2)}dB,alimiter=limit=${MUSIC_LIMIT}:level=disabled`,
    '-ar', '44100', '-ac', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(OUT, pick.file)]);
  return { input: m.input_i, gain, limiting };
}

function writeManifest() {
  const ids = PICKS.map((p) => `  | '${p.id}'`).join('\n');
  const rows = PICKS.map((p) => `  '${p.id}': { file: '${fileFor(p.id)}', group: '${p.group}' },`).join('\n');
  const menu = MUSIC_PICKS.filter((m) => m.use === 'menu').map((m) => m.file);
  const battle = MUSIC_PICKS.find((m) => m.use === 'battle').file;
  writeFileSync(MANIFEST, `// Generated by frontend/scripts/build-audio.mjs, do not edit. Edit scripts/audio-picks.mjs and rerun.
// Files are relative to /audio/.

export type SoundGroup = 'battle' | 'menu' | 'binder' | 'pack'

export type SoundId =
${ids}

export const SOUNDS: Record<SoundId, { file: string; group: SoundGroup }> = {
${rows}
}

export const MUSIC: { menu: [string, string]; battle: string } = {
  menu: ['${menu[0]}', '${menu[1]}'],
  battle: '${battle}',
}
`);
}

function writeCredits() {
  const cell = (s) => s.replace(/\|/g, '\\|');
  const row = (file, sources) => {
    const keys = [...new Set(sources.flatMap(licencesFor))];
    const lics = keys.map((k) => LICENCES[k]);
    return `| ${file} | ${lics.map((l) => cell(l.title)).join(' + ')} | ${lics.map((l) => cell(l.author)).join(' + ')} `
      + `| ${lics.map((l) => l.url).join(' + ')} | ${lics.map((l) => cell(l.licence)).join(' + ')} |`;
  };
  const required = Object.values(LICENCES).filter((l) => l.creditRequired)
    .map((l) => `- "${l.title}" by ${l.author}, ${l.licence}, ${l.url}`).join('\n');
  const lines = [
    '# Audio credits',
    '',
    'Generated by `frontend/scripts/build-audio.mjs` from `frontend/scripts/audio-picks.mjs`; do not edit by hand.',
    'All files were trimmed, loudness-matched and re-encoded for the game.',
    '',
    '## Attribution required',
    '',
    required,
    '',
    '## Every file',
    '',
    '| File | Title | Author | Source | Licence |',
    '|---|---|---|---|---|',
    ...MUSIC_PICKS.map((m) => row(m.file, [m.source])),
    ...PICKS.map((p) => row(fileFor(p.id), p.join ?? [p.source])),
    '',
  ];
  writeFileSync(join(OUT, 'CREDITS.md'), lines.join('\n'));
}

function sizeOf(dir) {
  return readdirSync(dir).reduce((sum, name) => {
    const p = join(dir, name);
    const s = statSync(p);
    return sum + (s.isDirectory() ? sizeOf(p) : s.size);
  }, 0);
}

function measure() {
  const byKind = {};
  for (const pick of PICKS) {
    const v = momentaryMax(join(OUT, fileFor(pick.id)));
    const kind = pick.kind === 'crit' ? 'crit' : 'hit/menu';
    (byKind[kind] ??= []).push([pick.id, v]);
  }
  for (const [kind, list] of Object.entries(byKind)) {
    list.sort((a, b) => a[1] - b[1]);
    const [lo, hi] = [list[0], list[list.length - 1]];
    console.log(`${kind}: min ${lo[1].toFixed(2)} (${lo[0]}), max ${hi[1].toFixed(2)} (${hi[0]}), n=${list.length}`);
    for (const [id, v] of list) if (Math.abs(v - (kind === 'crit' ? TARGET.crit : TARGET.hit)) > 1) console.log(`  out of range: ${id} ${v.toFixed(2)}`);
  }
  for (const m of MUSIC_PICKS) {
    const log = ffmpeg(['-i', join(OUT, m.file), '-af', 'ebur128', '-f', 'null', '-']);
    const integrated = log.slice(log.lastIndexOf('Summary')).match(/I:\s*(-?[\d.]+) LUFS/)[1];
    console.log(`${m.file}: integrated ${integrated} LUFS`);
  }
  console.log(`total public/audio: ${(sizeOf(OUT) / 1024 / 1024).toFixed(2)} MB`);
}

function main() {
  if (process.argv.includes('--measure')) return measure();
  if (!existsSync(AUDIO_SOURCE)) throw new Error(`No raw audio at ${AUDIO_SOURCE}`);
  rmSync(join(OUT, 'sfx'), { recursive: true, force: true });
  rmSync(join(OUT, 'music'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'sfx'), { recursive: true });
  mkdirSync(join(OUT, 'music'), { recursive: true });
  mkdirSync(dirname(MANIFEST), { recursive: true });
  const tmp = join(tmpdir(), `build-audio-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  try {
    for (const pick of PICKS) {
      const { gain, limiting, length } = buildEffect(pick, tmp);
      console.log(`${pick.id.padEnd(16)} ${length.toFixed(2)}s gain ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB, limiter peak reduction ${limiting.toFixed(1)} dB${limiting > 3 ? '  (over 3 dB)' : ''}`);
    }
    for (const pick of MUSIC_PICKS) {
      const m = buildMusic(pick);
      console.log(`${pick.file.padEnd(22)} input ${m.input} LUFS, gain ${m.gain.toFixed(1)} dB, limiter peak reduction ${m.limiting.toFixed(1)} dB`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeManifest();
  writeCredits();
  measure();
}

main();
