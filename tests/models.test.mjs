// Designed models (CLAUDE.md 3D conversion rules): closed solids in the
// sprite's colours, posed from the simulation's state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../sim/web/tools/headless.mjs';
import { createGame, levelFile } from '../client/sim-host.js';
import { Depth } from '../client/depth.js';
import { design, designed } from '../client/models.js';
import { LANE } from '../content/compile.mjs';

const g = await createGame();
await g.start(levelFile(0));
g.freshRun();
const depth = new Depth(g, LANE);
depth.install();
const palette = new Uint8Array(768);
for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) palette[i * 3 + c] = g.assets.palette[i * 4 + c];
const ctx = { palette, lane: LANE, time: 1234, g, depthOf: (e) => depth.depthOf(e) ?? 0, zoneOf: (e) => depth.zoneOf(e) };
const spriteFor = (e) => { const img = g.spriteOf(e); return { e, img, x: e.x - img.xcfg, y: e.y - img.h + 1, flip: e.dir < 0 }; };
const first = (type) => g.entities.find((e) => e.type === type);

// volume by the divergence theorem: positive and finite only for a closed, outward-facing mesh
function volume(m) {
  let v = 0;
  const d = m.data;
  for (let k = 0; k < m.count; k += 3) {
    const o = k * 9, p = [0, 1, 2].map((i) => [d[o + i * 9], d[o + i * 9 + 1], d[o + i * 9 + 2]]), n = [d[o + 3], d[o + 4], d[o + 5]];
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    v += ((n[0] * p[0][0] + n[1] * p[0][1] + n[2] * p[0][2]) * Math.sqrt(c[0] ** 2 + c[1] ** 2 + c[2] ** 2)) / 6;
  }
  return v;
}

test('level 0 objects that matter have designed models, made of closed parts', () => {
  for (const type of ['WHO', 'SWITCH_DOOR', 'SMART_PLAT_SMALL', 'SWITCH', 'TELE2', 'TRAP_DOOR2']) {
    const e = first(type);
    assert.ok(e && designed(e), `${type} has a design`);
    const parts = design(spriteFor(e), ctx);
    assert.ok(parts.length >= 2, `${type} has parts`);
    for (const p of parts) {
      assert.ok(p.mesh.count > 0 && p.mesh.count % 3 === 0);
      assert.ok(volume(p.mesh) > 0, `${type}: a part is not closed or faces inward`);
      assert.ok(p.offset.every(Number.isFinite) && p.basis.length === 9);
    }
  }
});

test('a door panel rises as the door opens, and its doorway is door-sized', () => {
  const door = first('SWITCH_DOOR');
  const z = depth.zoneOf(door);
  assert.ok(z && z.h < LANE / 2, 'a doorway, not the whole hall');
  const panelZ = (state, frame) => { door.setState(state); door.frame = frame; return design(spriteFor(door), ctx)[0].offset[2]; };
  const shut = panelZ('stopped', 0), half = panelZ('running', 2), open = panelZ('blocking', 0), closing = panelZ('walking', 4);
  assert.ok(shut < half && half < open, `${shut} < ${half} < ${open}`);
  assert.ok(closing < open && closing >= shut);
  door.setState('stopped');
});

test('a lift is lift-sized and its shaft covers its run', () => {
  const lift = first('SMART_PLAT_SMALL');
  const z = depth.zoneOf(lift);
  assert.ok(z.h < LANE / 2);
  const stops = lift.links.slice(0, 2).map((l) => l.y);
  assert.ok(z.y0 < Math.min(...stops) && z.y1 >= Math.max(...stops));
});

test('a trap door is hatch-sized: the floor around it holds, its opening lets the player drop', async () => {
  const hatchE = first('TRAP_DOOR2');
  const z = depth.zoneOf(hatchE);
  assert.ok(z && z.floor && z.h < LANE / 2, 'a hatch-sized hole');
  // open it, with nothing to close it again
  hatchE.links = []; hatchE.aistate = 2; hatchE.setState('blocking'); g.refreshSolids();
  const drop = async (pd) => {
    const x = (z.x0 + z.x1) / 2;
    g.teleportPlayer(x, z.y0 - 1); g.cam.x = x - 160; g.cam.y = z.y0 - 100;
    depth.pd = pd; depth._legal = { x, y: z.y0 - 1 };
    for (let i = 0; i < 60; i++) { g.keys.clear(); g.update(1 / 60); }
    return g.player.y;
  };
  const beside = await drop(z.c > 0 ? z.c - z.h - 40 : z.c + z.h + 40);
  assert.ok(beside <= z.y0, `stood on the floor beside the hatch (feet at ${beside}, floor at ${z.y0})`);
  const through = await drop(z.c);
  assert.ok(through > z.y1, `dropped through the open hatch (feet at ${through})`);
});
