// Ladders through floors (client/ladders.js): the map leaves the floor open where a ladder runs up through it,
// frame walls close it again but for a hole against the back wall, and a climber is drawn to the ladder.
// Space jumps off a ladder (Jared: "you should be able to jump off a ladder").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile, STEP } from '../client/sim-host.js';
import { Depth } from '../client/depth.js';
import { LANE } from '../content/compile.mjs';

const g = await createGame();
g.audio.muted = true;
const onLevel2Ladder = async () => {
  await g.start(levelFile(2));
  const d = new Depth(g, LANE); d.install();
  const p = g.player; p.x = 555; p.y = 1078; d.pd = -100; // at the foot of the ladder by the blocks, near the front of the hall
  for (let i = 0; i < 20; i++) { g.keys.clear(); d.movePlayer(0, STEP); g.update(STEP); }
  return { d, p };
};

test('level 2: the floor the ladder climbs through has a hole against the back wall', async () => {
  const { d } = await onLevel2Ladder();
  const z = d.zones().find((q) => q.kind === 'ladder' && q.x0 <= 555 && q.x1 >= 555);
  assert.ok(z, 'a hole');
  assert.ok(z.y0 > 900 && z.y1 < 935, 'in the floor at the top of the ladder');
  assert.equal(z.c + z.h, LANE, 'against the back wall');
  d.uninstall();
});

test('a climber from the front of the hall is drawn to the ladder and climbs up through the hole', async () => {
  const { d, p } = await onLevel2Ladder();
  let top = false, stuck = 0, lastY = p.y;
  for (let i = 0; i < 240 && !top; i++) {
    g.keys.clear(); g.keys.add('ArrowUp');
    d.movePlayer(0, STEP); g.update(STEP);
    if (p.climbing && p.y === lastY) stuck++;
    lastY = p.y;
    if (!p.climbing && p.ground && p.y < 930) top = true;
  }
  d.uninstall();
  assert.ok(top, `reached the floor above (at ${Math.round(p.x)},${Math.round(p.y)})`);
  assert.ok(d.pd > LANE - 2 * 28, `at the ladder (depth ${Math.round(d.pd)})`);
  assert.ok(stuck < 10, `held on the ladder ${stuck} frames`);
});

test('Space jumps off a ladder, back into the hall, and the ladder lets go', async () => {
  const { d, p } = await onLevel2Ladder();
  for (let i = 0; i < 60; i++) { g.keys.clear(); g.keys.add('ArrowUp'); d.movePlayer(0, STEP); g.update(STEP); }
  assert.ok(p.climbing, 'climbing');
  const pd0 = d.pd;
  g.keys.clear(); g.keys.add('Space'); d.movePlayer(0, STEP); g.update(STEP);
  assert.equal(p.climbing, false, 'off the ladder');
  assert.ok(p.vy < 0, 'jumping');
  for (let i = 0; i < 20; i++) { g.keys.clear(); d.movePlayer(0, STEP); g.update(STEP); }
  d.uninstall();
  assert.ok(pd0 - d.pd > 50, `pushed back off it (${Math.round(pd0 - d.pd)} units)`);
});

// Every ladder in the game, from the front of the hall, up and down: never held in place more than half a
// second (Jared: "stuck on l2 ladder": a trap door at the top of a ladder opened away from it). God mode, and
// no enemies: only the climb is tested.
for (const dir of ['up', 'down']) test(`every ladder can be climbed ${dir} from the front of the hall`, async () => {
  const fails = [];
  let total = 0;
  for (let L = 0; L < 22; L++) {
    await g.start(levelFile(L));
    for (let k = 0; k < g.ladders.length; k++) {
      await g.start(levelFile(L));
      g.god = true;
      const d = new Depth(g, LANE); d.install();
      for (const e of g.entities) if (d.kind(e) === 'enemy') e.dead = true;
      const l = g.ladders[k], p = g.player;
      p.x = (l.x0 + l.x1) / 2; p.y = dir === 'up' ? l.y1 : l.y0; p.vy = 0; d.pd = -100;
      if (dir === 'down') for (let j = 0; j < 20; j++) { g.keys.clear(); d.movePlayer(0, STEP); g.update(STEP); }
      let held = 0, maxHeld = 0, lastY = p.y, done = false;
      for (let i = 0; i < 900 && !done; i++) {
        g.keys.clear(); g.keys.add(dir === 'up' ? 'ArrowUp' : 'ArrowDown');
        d.movePlayer(0, STEP); g.update(STEP);
        held = (dir === 'up' ? p.y >= lastY - 0.01 : p.y <= lastY + 0.01) ? held + 1 : 0;
        maxHeld = Math.max(maxHeld, held); lastY = p.y;
        done = dir === 'up' ? p.y <= l.y0 + 2 && !p.climbing : p.y >= l.y1 - 6 && (p.ground || !p.climbing);
      }
      d.uninstall();
      total++;
      if (!done || maxHeld >= 30) fails.push(`level ${L} ladder at ${l.x0},${l.y0}: ${done ? `held ${maxHeld} frames` : `stopped at ${Math.round(p.x)},${Math.round(p.y)}`}`);
    }
  }
  g.god = false;
  assert.ok(total > 20, `${total} ladders`);
  assert.deepEqual(fails, []);
});
