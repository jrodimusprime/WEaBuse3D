// The compiled level: reproducible, structurally sound, and solid exactly where
// the simulation's tiles are solid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLevel } from '../content/build.mjs';
import { simTileSolid } from '../content/level-input.mjs';
import { loadBSP, CONTENTS_SOLID, CONTENTS_EMPTY } from '../engine/bsp.js';
import { pointContents, boxInSolid } from '../engine/trace.js';
import { LANE } from '../content/compile.mjs';

const built = await buildLevel(0);
const m = loadBSP(built.bytes);

test('rebuilding gives the same bytes', async () => {
  const again = await buildLevel(0);
  assert.deepEqual(again.bytes, built.bytes);
});

test('the committed web/maps/level00.bsp is up to date', async () => {
  const onDisk = new Uint8Array(await readFile(new URL('../web/maps/level00.bsp', import.meta.url)));
  assert.ok(Buffer.from(onDisk).equals(Buffer.from(built.bytes)), 'run: npm run build:maps');
});

test('indices are in range and faces lie on their planes', () => {
  assert.ok(m.bsp2);
  for (const n of m.nodes) {
    assert.ok(n.plane, 'node plane');
    for (const c of n.children) assert.ok(c, 'node child');
  }
  for (const l of m.leafs.slice(1)) {
    assert.equal(l.contents, CONTENTS_EMPTY);
    for (const s of l.surfaces) assert.ok(s, 'marksurface');
  }
  assert.equal(m.leafs[0].contents, CONTENTS_SOLID);
  for (const c of m.clipnodes) {
    assert.ok(m.planes[c.planenum]);
    for (const ch of c.children) assert.ok(ch === CONTENTS_SOLID || ch === CONTENTS_EMPTY || (ch >= 0 && ch < m.clipnodes.length));
  }
  for (const s of m.surfaces) {
    assert.ok(s.verts.length >= 3);
    const { normal, dist } = s.plane;
    for (const v of s.verts) assert.ok(Math.abs(normal[0] * v[0] + normal[1] * v[1] + normal[2] * v[2] - dist) < 0.01, 'vertex off its plane');
    // clockwise seen from the side the face is drawn on (qbsp winding)
    const [a, b, c] = s.verts;
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], w = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const facing = (n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2]) * (s.planeback ? -1 : 1);
    assert.ok(facing > 0, 'winding');
    assert.ok(s.extents[0] <= 256 && s.extents[1] <= 256, 'surface extents');
    const size = ((s.extents[0] >> 4) + 1) * ((s.extents[1] >> 4) + 1);
    assert.ok(s.lightofs >= 0 && s.lightofs + size <= m.lightdata.length, 'lightmap in range');
    assert.ok(m.textures[s.texinfo.miptex], 'texture');
  }
});

test('the world is solid exactly where the simulation is', () => {
  const input = built.input;
  let checked = 0;
  const away = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]];
  for (let py = 0; py < input.height; py += 3) {
    for (let px = 0; px < input.width; px += 3) {
      const solid = simTileSolid(input, px, py);
      if (away.some(([dx, dy]) => simTileSolid(input, px + dx, py + dy) !== solid)) continue; // too close to an edge
      for (const Y of [1 - LANE, 0, LANE - 1]) {
        const c = pointContents(m, [2 * px + 1, Y, -2 * py - 1]);
        if ((c === CONTENTS_SOLID) !== solid) assert.fail(`pixel (${px}, ${py}) depth ${Y}: sim ${solid ? 'solid' : 'open'}, BSP ${c}`);
      }
      checked++;
    }
  }
  assert.ok(checked > 300000, `checked ${checked}`);
});

test('outside the lane and the level is solid', () => {
  assert.equal(pointContents(m, [100, LANE + 6, -200]), CONTENTS_SOLID);
  assert.equal(pointContents(m, [100, -LANE - 6, -200]), CONTENTS_SOLID);
  assert.equal(pointContents(m, [-100, 0, -200]), CONTENTS_SOLID);
  assert.equal(pointContents(m, [100, 0, 100]), CONTENTS_SOLID);
});

test('the player start is clear for the player hull', () => {
  const st = m.entities.find((e) => e.classname === 'info_player_start');
  const org = st.origin.split(' ').map(Number);
  assert.equal(boxInSolid(m, org, [-16, -16, -24], [16, 16, 32]), false);
});

test('brush model *1 holds the front caps, each over solid', () => {
  const caps = m.models[1];
  assert.ok(caps && caps.numfaces > 100, 'caps model');
  assert.equal(caps.firstface, m.models[0].numfaces);
  for (let i = caps.firstface; i < caps.firstface + caps.numfaces; i++) {
    const s = m.surfaces[i];
    assert.equal(s.plane.normal[1], 1);
    assert.ok(s.planeback, 'faces out of the lane (-Y)');
    const c = s.verts.reduce((a, v) => [a[0] + v[0] / s.verts.length, a[2] + v[2] / s.verts.length], [0, 0]);
    // a hair inside the lane behind the cap's centre is solid (corners of slope pieces can be thin, so use the centroid)
    assert.equal(pointContents(m, [c[0], 1 - LANE, c[1]]), CONTENTS_SOLID, `cap ${i} at ${c}`);
  }
});
