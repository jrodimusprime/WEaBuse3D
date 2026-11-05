// Voxel models of real Abuse sprites: closed, the right size, the same every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAssets } from '../content/level-input.mjs';
import { voxelModel, thickness, SCALE } from '../engine/voxel.js';

const a = await loadAssets();
const palette = new Uint8Array(768);
for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) palette[i * 3 + c] = a.palette[i * 4 + c];

async function frames(name, max = 6) {
  const def = a.defs.get(name);
  await a.preloadDef(def);
  const out = [];
  for (const list of def.states.values()) for (const f of list) if (out.length < max) out.push(a.sprite(def.file, f));
  return out.filter(Boolean);
}
const sprites = [...await frames('DARNEL'), ...await frames('WHO'), ...await frames('SMART_PLAT_SMALL', 2)];

// Divergence theorem: with outward normals, V = 1/3 * sum over faces of (n . p) * area.
function volume(m) {
  let v = 0;
  const d = m.data;
  for (let k = 0; k < m.count; k += 3) {
    const o = k * 9;
    const p = [0, 1, 2].map((i) => [d[o + i * 9], d[o + i * 9 + 1], d[o + i * 9 + 2]]);
    const n = [d[o + 3], d[o + 4], d[o + 5]];
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const area = Math.hypot(...c) / 2;
    v += ((n[0] * p[0][0] + n[1] * p[0][1] + n[2] * p[0][2]) * area) / 3;
  }
  return v;
}

test('models are closed: their volume is the sum of their columns', () => {
  assert.ok(sprites.length >= 10);
  for (const img of sprites) {
    for (const flip of [false, true]) {
      const m = voxelModel(img, palette, flip);
      const { t } = thickness(img, flip);
      let want = 0;
      for (const th of t) want += SCALE * SCALE * 2 * SCALE * th;
      assert.ok(Math.abs(volume(m) - want) < 1e-6 * want + 1e-3, `${img.w}x${img.h}: ${volume(m)} vs ${want}`);
    }
  }
});

test('models span the sprite and are mirrored when flipped', () => {
  for (const img of sprites) {
    const m = voxelModel(img, palette, false);
    let x1 = -Infinity, z0 = Infinity, y1 = 0;
    for (let k = 0; k < m.count; k++) { x1 = Math.max(x1, m.data[k * 9]); y1 = Math.max(y1, m.data[k * 9 + 1]); z0 = Math.min(z0, m.data[k * 9 + 2]); }
    assert.ok(x1 <= SCALE * img.w && z0 >= -SCALE * img.h && y1 <= 14 && y1 >= 2);
    const f = voxelModel(img, palette, true);
    assert.equal(f.count > 0, m.count > 0);
    assert.ok(Math.abs(volume(f) - volume(m)) < 1e-6 * volume(m) + 1e-3, 'mirror keeps the volume');
  }
});

test('a model is the same bytes every time', () => {
  for (const img of sprites.slice(0, 4)) {
    assert.deepEqual(voxelModel(img, palette, true).data, voxelModel(img, palette, true).data);
  }
});
