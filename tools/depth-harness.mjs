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
import { piecesFor, autopilotStep as pilot } from '../client/autopilot.js';

export const ppo = await import('../sim/web/src/ppo.js');
export const demo = JSON.parse(await readFile(new URL('../sim/web/data/ppo-demo.json', import.meta.url), 'utf8'));
const OWN = new URL('../tests/data/depth-runs.json', import.meta.url);
export const ownRuns = JSON.parse(await readFile(OWN, 'utf8').catch(() => '{}'));
export const OWN_FILE = OWN;

export const piecesOf = (L) => piecesFor(demo, ownRuns, L, ppo.decodeActs);
export const autopilotStep = (g, d, act, face) => pilot(g, d, act, face, ppo.applyAction, STEP);

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
