// Makes the voice-overs for the hints this game says in its own controls (client/hints.js), in the manner of
// Abuse's (Jared: "the atmosphere of the initial voiceover has been lost, can you generate the audio in the same
// fashion?"). Abuse's own clips (sim/web/data/sfx/voice) cannot say "press E", and its voice cannot be had again,
// so: eSpeak NG (open source; what it says is free to publish, unlike the macOS voices' output), its en-us+f3
// voice held on one pitch as the originals are (measured: about 235 Hz throughout, dipping at the ends of phrases), then made to sound as they do: 11025 Hz, 8-bit, mono, band-limited,
// an echo at 70 ms and a short room (their envelopes repeat at 70 ms; their tails ring 0.3-1 s), squeezed loud
// (their peaks sit at full scale, their RMS near 0.19), with a breath of silence before.
//
//   node tools/make-voices.mjs        (it needs espeak-ng: `brew install espeak-ng`)
//
// Writes web/voice/<name>.wav for each line below. Deterministic for a given eSpeak NG version (1.52.0).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = new URL('../web/voice/', import.meta.url);
const VOICE = 'en-us+f3', PITCH = 75, RATE = 150; // espeak-ng -p (0-99): 75 gives about 235 Hz; -s words a minute
export const LINES = {
  switch_e: 'Press E to activate objects. This is a switch.',
  save_e: 'This console saves the state of the game, press E.',
  platform_e: 'Press E to activate the platform.',
  weapon_e: 'Use 1 to 7, or the mouse wheel, to select weapons.',
  ladder_e: 'Walk forward, looking up, to climb ladders.',
  start_e: 'Press E to start!',
  teleport_e: 'Press E to teleport.',
  // and the hints whose words hold as they are, so that every hint is said in the one voice (Jared: "make all
  // human audio captions sound the same on level 00")
  aim_e: 'Aim gun with mouse, fire with left mouse button.',
  ammo_e: 'Collect ammo to increase firing speed.',
  power_e: 'Hold down the right mouse button to use special powers.',
  walls_e: 'Shoot hidden walls to destroy them.',
  ball_e: 'Shoot switch ball to activate.',
};

function readWav(path) {
  const b = readFileSync(path);
  let o = 12, rate = 22050, data = null;
  while (o < b.length - 8) {
    const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(o + 12);
    if (id === 'data') data = b.subarray(o + 8, o + 8 + n);
    o += 8 + n + (n & 1);
  }
  const x = new Float64Array(data.length / 2);
  for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  return { x, rate };
}

function writeWav8(path, x, rate) {
  const n = x.length, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = Math.max(0, Math.min(255, Math.round(128 + x[i] * 127)));
  writeFileSync(path, b);
}

// a windowed-sinc low pass, then every other sample: 22050 -> 11025
function halve(x, cutoff = 0.21) {
  const taps = 63, h = new Float64Array(taps), m = (taps - 1) / 2;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const t = i - m, s = t === 0 ? 2 * Math.PI * cutoff : Math.sin(2 * Math.PI * cutoff * t) / t;
    h[i] = s * (0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1)));
    sum += h[i];
  }
  const y = new Float64Array(Math.floor(x.length / 2));
  for (let j = 0; j < y.length; j++) {
    let a = 0;
    for (let k = 0; k < taps; k++) { const i = 2 * j + k - m; if (i >= 0 && i < x.length) a += x[i] * h[k]; }
    y[j] = a / sum;
  }
  return y;
}

// RBJ biquads
function biquad(x, rate, type, f, q = 0.707, gainDb = 0) {
  const w = (2 * Math.PI * f) / rate, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else { b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; } // peaking
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// an echo at 70 ms, and a small room (Schroeder: four combs, two all-passes), with room for the tail
function room(x, rate, tail = 0.9) {
  const n = x.length + Math.round(tail * rate), y = new Float64Array(n);
  y.set(x);
  const d = Math.round(0.07 * rate);
  for (let i = d; i < n; i++) y[i] += 0.34 * y[i - d];
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((t) => Math.round(t * rate)), wet = new Float64Array(n);
  for (const c of combs) { const buf = new Float64Array(n); for (let i = 0; i < n; i++) { buf[i] = y[i] + (i >= c ? 0.8 * buf[i - c] : 0); wet[i] += buf[i] / 4; } }
  let out = wet;
  for (const [t, gk] of [[0.005, 0.7], [0.0017, 0.7]]) {
    const dd = Math.round(t * rate), z = new Float64Array(n);
    for (let i = 0; i < n; i++) z[i] = -gk * out[i] + (i >= dd ? out[i - dd] + gk * z[i - dd] : 0);
    out = z;
  }
  for (let i = 0; i < n; i++) out[i] = y[i] + 0.38 * out[i];
  return out;
}

export function make(text, name) {
  const dir = join(tmpdir(), `voice-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const raw = join(dir, `${name}.wav`);
  // (SSML: its pitch range held very low, so it keeps to one note, as Abuse's voice does)
  execFileSync('espeak-ng', ['-v', VOICE, '-s', String(RATE), '-p', String(PITCH), '-m', '-w', raw, `<speak><prosody range="x-low">${text}</prosody></speak>`]);
  let { x } = readWav(raw);
  rmSync(dir, { recursive: true, force: true });
  // trim the silence round it
  let a = 0, b = x.length - 1;
  while (a < b && Math.abs(x[a]) < 0.01) a++;
  while (b > a && Math.abs(x[b]) < 0.01) b--;
  x = x.slice(Math.max(0, a - 200), b + 200);
  let y = halve(x);
  const rate = 11025;
  y = biquad(y, rate, 'hp', 110);
  // the originals' tone: a quarter to a half of them below 300 Hz, 14-30% at 1-2.5 kHz (eSpeak is thin and bright)
  y = biquad(y, rate, 'peak', 240, 0.7, 4);
  y = biquad(y, rate, 'peak', 1600, 0.7, 1);
  y = biquad(y, rate, 'peak', 3000, 1, 4);
  y = biquad(y, rate, 'lp', 4300);
  y = room(y, rate);
  // loud: to the originals' RMS, then a soft clip (their peaks sit at full scale)
  const rms = Math.sqrt(y.reduce((t, v) => t + v * v, 0) / y.length), k = 0.14 / rms;
  for (let i = 0; i < y.length; i++) y[i] = Math.tanh(1.5 * y[i] * k) / Math.tanh(1.5);
  // fade the tail out, a breath of silence before
  const fade = Math.round(0.15 * rate);
  for (let i = 0; i < fade; i++) y[y.length - 1 - i] *= i / fade;
  const lead = new Float64Array(Math.round(0.12 * rate)), out = new Float64Array(lead.length + y.length);
  out.set(y, lead.length);
  mkdirSync(OUT, { recursive: true });
  writeWav8(new URL(`${name}.wav`, OUT), out, rate);
  return out.length / rate;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, text] of Object.entries(LINES)) console.log(`${name}.wav  ${make(text, name).toFixed(2)} s  "${text}"`);
}
