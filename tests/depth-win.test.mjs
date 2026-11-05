// Level 0 can be finished under the 3D rules: the recorded 2D run, replayed
// with the depth layer on and an autopilot that walks across the hall to
// whatever the run is about to use (a switch on the wall, a pad, an item) and
// lines up with each doorway and lift shaft it passes, still reaches the exit.
// So every switch, teleporter, pickup, door and lift it needs works in 3D.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile, STEP } from '../client/sim-host.js';
import { Depth } from '../client/depth.js';
import { LANE } from '../content/compile.mjs';

const ppo = await import('../sim/web/src/ppo.js');
const demo = JSON.parse(await readFile(new URL('../sim/web/data/ppo-demo.json', import.meta.url), 'utf8'));

test('level 0 is finished under the 3D rules', async () => {
  const g = await createGame();
  g.audio.muted = true;
  let exit = null;
  g.nextLevel = (n) => { exit = n; g.transitioning = true; };
  const d = new Depth(g, LANE);
  for (const piece of demo.pieces.filter((p) => p.levelIdx === 0)) {
    d.uninstall();
    await ppo.startRun(g, levelFile(0), piece.seed || null); // (checkpoints were recorded under the 2D rules)
    d.install();
    exit = null;
    const acts = ppo.decodeActs(piece.acts), n = Math.min(piece.steps, acts.length * 4);
    let face = 1, act = 0;
    for (let i = 0; i < n && exit === null && !g.player.dead; i++) {
      if (i % 4 === 0) { act = acts[i / 4]; const mv = (act % 3) - 1; if (mv !== 0) face = mv; }
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
    assert.equal(g.player.dead, false, `died at ${Math.round(g.player.x)},${Math.round(g.player.y)}`);
  }
  assert.equal(exit, 1, 'took the exit to level 1');
});
