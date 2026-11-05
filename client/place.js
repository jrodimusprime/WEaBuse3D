// Where each model of the scene goes in 3D: designed models (client/models.js)
// where there is a design, otherwise the voxel placeholder with a transform
// from the depth layer's kinds and depths:
//
//   door, lift, hatch  their own size, in their doorway, shaft or hole (3D conversion rule 3)
//   full        stretched across the whole hall, as a slab (breakable walls, lava, force fields)
//   wall        flattened against the back wall
//   floor       as deep as it is wide, at its spot
//   item        at its spot, turning like a Quake item
//   enemy, fx and shots at their depth
import { MODEL_HALF } from '../engine/voxel.js';
import { design } from './models.js';
import { antHusks } from './ant.js';
import { Mesh } from '../engine/mesh.js';

// a unit tracer (0..1 along X, 1 across), stretched by its transform; one per colour
const tracers = new Map();
function tracerMesh(rgb) {
  const k = rgb.map((v) => v.toFixed(2)).join();
  if (!tracers.has(k)) tracers.set(k, new Mesh().box([0.5, 0, 0], [0.5, 1, 1], rgb).done());
  return tracers.get(k);
}

export function placeScene(scene, depth, lane, timeMs, g, palette) {
  const ctx = { palette, lane, time: timeMs, g, depthOf: (e) => depth.depthOf(e) ?? 0, zoneOf: (e) => depth.zoneOf(e), padOf: (e) => depth.padOf(e), pd: depth.pd, antVariant: placeScene.antVariant };
  const out = [];
  for (const s of scene.sprites) {
    const parts = !s.player && design(s, ctx);
    if (parts) { for (const p of parts) out.push({ ...p, e: s.e, player: false }); continue; }
    const k = s.shot ? 'shot' : s.e ? depth.kind(s.e) : s.player ? 'player' : 'full';
    let dep = 0, sy = 1, spin = 0;
    if (k === 'shot') dep = s.shot.d0 !== undefined ? depth.shotDepth(s.shot) : depth.pd;
    else if (k === 'player') dep = depth.pd;
    else if (k === 'full') { sy = lane / MODEL_HALF; s.flat = true; }
    else if (k === 'door' || k === 'lift' || k === 'hatch') { const z = depth.zoneOf(s.e); sy = (z?.h ?? 48) / MODEL_HALF; dep = z?.c ?? 0; s.flat = true; }
    else if (k === 'wall') { sy = 0.5; dep = lane - MODEL_HALF * 0.5; }
    else if (k === 'floor') { sy = s.img.w / MODEL_HALF; dep = depth.depthOf(s.e); }
    else if (k === 'item') { dep = depth.depthOf(s.e); spin = (timeMs / 1000) * 2.2 + (s.e.id || 0); }
    else dep = depth.depthOf(s.e) ?? 0;
    const c = Math.cos(spin), sn = Math.sin(spin), half = s.img.w; // the model's middle, in units (2 per pixel)
    // basis = rotation about the vertical (Z) through the middle, after stretching in depth; column-major
    s.basis = new Float32Array([c, sn, 0, -sn * sy, c * sy, 0, 0, 0, 1]);
    s.offset = [2 * s.x + half - c * half, dep - sn * half, -2 * s.y];
    out.push(s);
  }
  for (const p of antHusks(ctx)) out.push(p); // the torn cocoons hatched ants leave on the ceiling
  // bullets: one glowing tracer each, along its path since the last tick, through 3D
  const tracers = new Set();
  for (const b of scene.boxes) if (b.shot?.kind === 'bullet') tracers.add(b.shot);
  for (const b of tracers) {
    const dAt = (x, y) => (b.d0 === undefined ? depth.pd : Math.max(-lane, Math.min(lane, b.d0 + Math.sqrt((x - b.sx) ** 2 + (y - b.sy) ** 2) * b.ratio)));
    const a = [2 * b.px, dAt(b.px, b.py), -2 * b.py], e = [2 * b.x, dAt(b.x, b.y), -2 * b.y];
    const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
    const len = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
    if (len < 0.5) continue;
    const f = d.map((v) => v / len);
    let p1 = [f[1], -f[0], 0];
    const l1 = Math.sqrt(p1[0] ** 2 + p1[1] ** 2);
    p1 = l1 < 1e-3 ? [1, 0, 0] : p1.map((v) => v / l1);
    const p2 = [f[1] * p1[2] - f[2] * p1[1], f[2] * p1[0] - f[0] * p1[2], f[0] * p1[1] - f[1] * p1[0]];
    // the player's bullets are red (weapons.js: "the player's are red"); enemies' carry their own colour
    const w = 1.1, idx = b.bright ?? (b.mine ? g?.colors?.redBright : 0) ?? 0;
    const rgb = idx && palette ? [palette[idx * 3] / 255, palette[idx * 3 + 1] / 255, palette[idx * 3 + 2] / 255] : [1, 0.85, 0.45];
    out.push({ mesh: tracerMesh(rgb), basis: new Float32Array([d[0], d[1], d[2], p1[0] * w, p1[1] * w, p1[2] * w, p2[0] * w, p2[1] * w, p2[2] * w]), offset: a, additive: true, glowAmt: 2.2 });
  }
  scene.boxes = scene.boxes.filter((b) => b.shot?.kind !== 'bullet');
  for (const b of scene.boxes) {
    if (b.shot) b.depth = b.shot.d0 !== undefined ? depth.shotDepth(b.shot) : depth.pd;
    else if (b.e && depth.kind(b.e) === 'full') b.half = lane;
    else if (b.e) b.depth = depth.depthOf(b.e) ?? 0;
  }
  return { sprites: out, boxes: scene.boxes };
}

// The frame walls of the level's doorways and shafts: everything across the
// hall that the opening does not cover, textured with the wall tile above it.
export function frameBoxes(depth, lane, g, renderer) {
  const lv = g.level, out = [];
  const fallback = renderer.textureInfo.findIndex((t) => t.name.startsWith('fg'));
  for (const z of depth.zones()) {
    const cx = Math.max(0, Math.min(lv.fgW - 1, Math.floor((z.x0 + z.x1) / 2 / g.tw)));
    let tex = z.tile !== undefined ? renderer.textureNamed(`fg${z.tile}`) : null; // a ladder's hole: the floor's own tile
    for (let ty = Math.floor(z.y0 / g.th) - 1; ty >= 0 && tex === null; ty--) {
      const n = lv.fgmap[ty * lv.fgW + cx];
      if (g.assets.foreTile(n)?.mask) tex = renderer.textureNamed(`fg${n}`);
    }
    tex ??= fallback;
    const x0 = 2 * z.x0, x1 = 2 * (z.x1 + 1), zt = -2 * (z.top ?? z.y0), zb = -2 * (z.y1 + 1);
    if (z.c - z.h > -lane) out.push({ min: [x0, -lane, zb], max: [x1, z.c - z.h, zt], tex });
    if (z.c + z.h < lane) out.push({ min: [x0, z.c + z.h, zb], max: [x1, lane, zt], tex });
  }
  return out;
}
