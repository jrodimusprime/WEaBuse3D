// Every level can be finished under the 3D rules: the recorded 2D run, replayed
// with the depth layer on and an autopilot that walks across the hall to
// whatever the run is about to use (a switch on the wall, a pad, an item) and
// lines up with each doorway, lift shaft and ladder hole it passes, still reaches the exit
// (tools/depth-harness.mjs). So every switch, teleporter, pickup, door, lift and ladder it needs works in 3D.
// A piece whose 2D inputs no longer survive the 3D rules plays inputs found for them (tests/data/depth-runs.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile } from '../client/sim-host.js';
import { Depth } from '../client/depth.js';
import { LANE } from '../content/compile.mjs';
import { piecesOf, playPiece } from '../tools/depth-harness.mjs';

for (const L of [0, 1, 2, 3, 4, 6, 8, 9, 12, 13, 14, 15, 17, 18, 19, 20, 21]) test(`level ${L} is finished under the 3D rules`, async () => {
  const g = await createGame();
  g.audio.muted = true;
  let exit = null;
  g.nextLevel = (n) => { exit = n; g.transitioning = true; };
  g.onEndGame = () => { exit = L + 1; g.transitioning = true; }; // (the last level ends the game)
  const d = new Depth(g, LANE);
  for (const piece of piecesOf(L)) {
    exit = null;
    await playPiece(g, d, L, piece, levelFile);
    assert.equal(g.player.dead, false, `died at ${Math.round(g.player.x)},${Math.round(g.player.y)}`);
  }
  assert.equal(exit, L + 1, `took the exit to level ${L + 1}`);
});
