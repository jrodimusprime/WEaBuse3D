// Plays a recorded run under the 3D rules (tests/depth-win.test.mjs, tools/depth-run-search.mjs).
//
// WEaBuse's recorded runs (sim/web/data/ppo-demo.json) are 2D: they say only what to press along the
// plane. Replayed with the depth layer on, an autopilot walks across the hall to whatever the run is about to
// use (a switch on the wall, a pad, an item) and lines up with each doorway, shaft and ladder hole it passes.
//
// A piece whose 2D inputs no longer survive under the 3D rules can have inputs of its own found for the 3D
// rules (tools/depth-run-search.mjs); they are kept in tests/data/depth-runs.json, by level and by the
// piece's place among that level's pieces, and used instead.
import { readFile } from 'node:fs/promises';
import { STEP } from '../client/sim-host.js';
import { LANE } from '../content/compile.mjs';

export const ppo = await import('../sim/web/src/ppo.js');
export const demo = JSON.parse(await readFile(new URL('../sim/web/data/ppo-demo.json', import.meta.url), 'utf8'));
const OWN = new URL('../tests/data/depth-runs.json', import.meta.url);
export const ownRuns = JSON.parse(await readFile(OWN, 'utf8').catch(() => '{}'));
export const OWN_FILE = OWN;

// The pieces of level L as the 3D rules play them: [{seed, acts (decoded), steps, own}]
export function piecesOf(L) {
  return demo.pieces.filter((p) => p.levelIdx === L).map((p, k) => {
    const o = ownRuns[L]?.[k];
    const acts = ppo.decodeActs(o ? o.acts : p.acts);
    return { seed: p.seed || null, acts, steps: Math.min(o ? o.steps : p.steps, acts.length * 4), own: !!o };
  });
}

// One step of a piece: the autopilot across the hall, then the recorded keys.
export function autopilotStep(g, d, act, face) {
  const p = g.player;
  let target = null, best = 70;
  for (const e of g.entities) {
    const k = e.dead ? null : d.kind(e);
    if (k !== 'wall' && k !== 'floor' && k !== 'item') continue;
    const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (dist < best) { best = dist; target = k === 'wall' ? LANE - 30 : d.depthOf(e); }
  }
  // line up with a doorway or a shaft ahead (the frame walls let the player through only there)
  for (const z of d.zones()) {
    if (p.x + 60 < z.x0 || p.x - 60 > z.x1 || p.y + 40 < z.y0 || p.y - 70 > z.y1) continue;
    target = z.c;
  }
  d.movePlayer(target === null ? 0 : Math.max(-1, Math.min(1, (target - d.pd) / 20)), STEP);
  ppo.applyAction(g, act, face);
  g.update(STEP);
}

// Plays one piece from its saved state; stops early on death or an exit. Returns the step it stopped at.
export async function playPiece(g, d, L, piece, levelFile, { onStep } = {}) {
  d.uninstall();
  await ppo.startRun(g, levelFile(L), piece.seed); // (checkpoints were recorded under the 2D rules)
  d.install();
  let face = 1, act = 0, i = 0;
  for (; i < piece.steps && !g.transitioning && !g.player.dead; i++) {
    if (i % 4 === 0) { act = piece.acts[i / 4]; const mv = (act % 3) - 1; if (mv !== 0) face = mv; }
    autopilotStep(g, d, act, face);
    onStep?.(i);
  }
  return i;
}
