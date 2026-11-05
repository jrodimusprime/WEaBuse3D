// Finds inputs for one piece of a recorded run that survive the 3D rules, and keeps them in
// tests/data/depth-runs.json (tools/depth-harness.mjs plays them in place of the 2D ones).
//
//   node tools/depth-run-search.mjs LEVEL [--piece K] [--minutes M] [--seed S]
//
// Without --piece it plays the level's pieces in turn and works on the first that dies. A piece is done when
// the player, alive, stands where the next piece starts (or takes the level's exit, for the last piece).
// The search is a hill climb from the recorded inputs: it rewrites a stretch of them at random and keeps the
// change when the piece gets no worse (dies later, ends nearer the goal, with more health). Deterministic for
// a given --seed.
import { readFile, writeFile } from 'node:fs/promises';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile } from '../client/sim-host.js';
import { Depth } from '../client/depth.js';
import { LANE } from '../content/compile.mjs';
import { ppo, piecesOf, playPiece, OWN_FILE } from './depth-harness.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };
const L = Number(process.argv[2]);
const MINUTES = Number(arg('minutes', 10));
let seed = Number(arg('seed', 1)) >>> 0 || 1;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const g = await createGame();
g.audio.muted = true;
let exit = null;
g.nextLevel = (n) => { exit = n; g.transitioning = true; };
const d = new Depth(g, LANE);
const pieces = piecesOf(L);

let K = arg('piece', null);
if (K === null) {
  for (let k = 0; k < pieces.length && K === null; k++) {
    exit = null;
    await playPiece(g, d, L, pieces[k], levelFile);
    if (g.player.dead) K = k;
  }
  if (K === null) { console.log(`level ${L}: every piece survives the 3D rules`); process.exit(0); }
}
K = Number(K);
const piece = pieces[K], last = K === pieces.length - 1;
// the goal: where the next piece starts
let goal = null;
if (!last) { d.uninstall(); await ppo.startRun(g, levelFile(L), pieces[K + 1].seed); goal = { x: g.player.x, y: g.player.y }; }
console.log(`level ${L} piece ${K} of ${pieces.length}: ${piece.steps} steps, goal ${last ? 'the exit' : `${Math.round(goal.x)},${Math.round(goal.y)}`}`);

// Plays a set of inputs; the score (higher is better) and the step at which the goal was reached, if it was.
async function score(acts) {
  exit = null;
  let reached = null, nearest = Infinity;
  const p = g.player;
  await playPiece(g, d, L, { seed: piece.seed, acts, steps: acts.length * 4 }, levelFile, {
    onStep: (i) => {
      if (reached !== null) return;
      if (last) { if (exit === L + 1) reached = i; return; }
      const dist = Math.hypot(p.x - goal.x, p.y - goal.y);
      nearest = Math.min(nearest, dist);
      if (dist < 16 && p.ground) { reached = i; g.transitioning = true; } // (stops the piece there)
    },
  });
  const hp = p.dead ? 0 : p.hp;
  if (reached !== null && !p.dead) return { s: 1e6 + hp * 100 - reached / 100, reached, hp };
  return { s: (p.dead ? 0 : 5e5) - nearest * 10 + hp, reached: null, hp };
}

let best = piece.acts.slice(), cur = await score(best);
console.log(`recorded inputs: ${cur.reached !== null ? `reach it with ${cur.hp} health` : `do not (score ${Math.round(cur.s)})`}`);
const t0 = Date.now();
let tries = 0;
while (Date.now() - t0 < MINUTES * 60e3 && !(cur.reached !== null && cur.hp >= 40)) {
  tries++;
  const a = best.slice();
  const n = a.length, len = 1 + Math.floor(rnd() * 24), at = Math.floor(rnd() * n);
  const kind = rnd();
  for (let i = at; i < Math.min(n, at + len); i++) {
    if (kind < 0.4) a[i] = Math.floor(rnd() * 24); // anything
    else if (kind < 0.7) a[i] = a[at]; // hold one action
    else a[i] = a[i] ^ 12; // the same, firing or not
  }
  if (rnd() < 0.15) a.push(...Array.from({ length: 1 + Math.floor(rnd() * 20) }, () => a[n - 1])); // a little longer
  const s = await score(a);
  if (s.s >= cur.s) {
    if (s.s > cur.s) console.log(`try ${tries}: ${s.reached !== null ? `reaches it at step ${s.reached} with ${s.hp} health` : `score ${Math.round(s.s)}`}`);
    best = a; cur = s;
  }
}
if (cur.reached === null) { console.log(`no inputs found that reach it (${tries} tries)`); process.exit(1); }
const acts = best.slice(0, Math.ceil((cur.reached + 1) / 4));
const own = JSON.parse(await readFile(OWN_FILE, 'utf8').catch(() => '{}'));
(own[L] ??= {})[K] = { acts: String.fromCharCode(...acts.map((v) => v + 65)), steps: cur.reached + 1, note: `found for the 3D rules by tools/depth-run-search.mjs --seed ${arg('seed', 1)} (${tries} tries); reaches the next piece's start with ${cur.hp} health` };
await writeFile(OWN_FILE, JSON.stringify(own, null, 1) + '\n');
console.log(`kept: level ${L} piece ${K}, ${acts.length} decisions, ${cur.hp} health at the goal (${tries} tries)`);
process.exit(0);
