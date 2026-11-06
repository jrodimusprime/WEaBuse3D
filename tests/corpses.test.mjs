// The dead stay where they fall (client/corpses.js): an ant lies on the floor in its dead pose; a machine is a
// wreck of its own parts on the floor; a turret hangs on, broken. Jared: "when a creature dies it should have a
// dead body pose or broken parts for robots... similar to quake dead bodies".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile, STEP } from '../client/sim-host.js';
import { Depth } from '../client/depth.js';
import { LANE } from '../content/compile.mjs';
import { Corpses } from '../client/corpses.js';
import { design } from '../client/models.js';

// every vertex's height, the parts posed (each mesh's own vertices, 9 floats each, turned and placed)
const heights = (parts) => {
  const out = [];
  for (const q of parts) {
    const d = q.mesh.data, B = q.basis, o = q.offset;
    for (let i = 0; i < d.length; i += 9) out.push(B[2] * d[i] + B[5] * d[i + 1] + B[8] * d[i + 2] + o[2]);
  }
  return out;
};
const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;

const g = await createGame();
g.audio.muted = true;

async function killAndLook(L, pick) {
  await g.start(levelFile(L));
  g.god = true;
  const d = new Depth(g, LANE); d.install();
  const c = new Corpses();
  const ctx = { palette: new Uint8Array(768).fill(128), lane: LANE, time: 0, g, depthOf: (e) => d.depthOf(e) ?? 0, zoneOf: (e) => d.zoneOf(e), padOf: (e) => d.padOf(e), pd: 0 };
  const e = g.entities.find(pick);
  assert.ok(e, 'one to kill');
  const img0 = g.spriteOf(e);
  const living = design({ e, img: img0, x: e.x - img0.xcfg, y: e.y - img0.h + 1, flip: e.dir < 0 }, ctx) || [];
  const hs = heights(living.filter((q) => !q.additive)), midHigh = mean(hs) - Math.min(...hs); // how high it is, on average, standing
  g.player.x = e.x - 80; g.player.y = e.y; g.cam.x = e.x - 160; g.cam.y = e.y - 100; // (so it is awake)
  let now = 0;
  c.update(g, d, now);
  e.hp = 0;
  for (let i = 0; i < 180 && g.entities.includes(e) && !e.dead; i++) { g.keys.clear(); g.update(STEP); now += 16; c.update(g, d, now); }
  now += 16; c.update(g, d, now);
  assert.ok(!g.entities.includes(e) || e.dead, 'the game took it out');
  assert.equal(c.list.length, 1, 'one corpse');
  const parts = c.parts(g, { ...ctx, time: now + 2000 }, design, now + 2000);
  d.uninstall();
  return { e, corpse: c.list[0], parts, midHigh };
}

const sound = (parts) => {
  assert.ok(parts.length > 0, 'parts');
  for (const q of parts) assert.ok(q.offset.every(Number.isFinite) && [...q.basis].every(Number.isFinite), 'a finite pose');
};

test('a dead ant lies on the floor in its dead pose, over a stain', async () => {
  const { corpse, parts, midHigh } = await killAndLook(1, (e) => e.ai === 'ant_ai' && e.state !== 'hanging' && e.state !== 'hiding');
  sound(parts);
  const floorZ = -2 * corpse.floor, body = heights(parts.filter((q) => q.basis[0] <= 5)); // (not the stain)
  assert.ok(Math.min(...body) > floorZ - 6 && Math.min(...body) < floorZ, `a little into the floor (${Math.round(Math.min(...body) - floorZ)})`);
  const mid = mean(body) - floorZ;
  assert.ok(mid < 0.75 * midHigh, `lying down: on average ${Math.round(mid)} up, ${Math.round(midHigh)} standing`);
  assert.ok(parts.some((q) => q.offset[2] < floorZ + 1 && q.basis[0] > 5), 'a stain under it');
});

test('a dead jugger is a wreck of its own parts on the floor, some thrown clear', async () => {
  const { corpse, parts, midHigh } = await killAndLook(2, (e) => e.ai === 'jug_ai');
  sound(parts);
  const floorZ = -2 * corpse.floor, hs = heights(parts);
  assert.ok(Math.min(...hs) > floorZ - 2 && Math.min(...hs) < floorZ + 4, `down on the floor (${Math.round(Math.min(...hs) - floorZ)})`);
  assert.ok(mean(hs) - floorZ < 0.85 * midHigh, `lying down: on average ${Math.round(mean(hs) - floorZ)} up, ${Math.round(midHigh)} standing`);
  assert.ok(parts.every((q) => !q.additive), 'its lights out');
});

test('a destroyed track gun hangs on where it was, broken', async () => {
  const { corpse, parts } = await killAndLook(2, (e) => e.ai === 'track_ai');
  sound(parts);
  const high = parts.filter((q) => q.offset[2] > -2 * corpse.y - 60);
  assert.ok(high.length >= parts.length - 1, 'still hanging, but for one fallen part');
});
