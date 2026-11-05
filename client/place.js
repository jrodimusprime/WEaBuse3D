// Where each model of the scene goes in 3D: designed models (client/models.js)
// where there is a design, otherwise the voxel placeholder with a transform
// from the depth layer's kinds and depths:
//
//   door, lift  their own size, in their doorway or shaft (3D conversion rule 3)
//   full        stretched across the whole hall, as a slab (breakable walls, lava, force fields)
//   wall        flattened against the back wall
//   floor       as deep as it is wide, at its spot
//   item        at its spot, turning like a Quake item
//   enemy, fx and shots at their depth
import { MODEL_HALF } from '../engine/voxel.js';
import { design } from './models.js';

export function placeScene(scene, depth, lane, timeMs, g, palette) {
  const ctx = { palette, lane, time: timeMs, g, depthOf: (e) => depth.depthOf(e) ?? 0, zoneOf: (e) => depth.zoneOf(e) };
  const out = [];
  for (const s of scene.sprites) {
    const parts = !s.player && design(s, ctx);
    if (parts) { for (const p of parts) out.push({ ...p, e: s.e, player: false }); continue; }
    const k = s.shot ? 'shot' : s.e ? depth.kind(s.e) : s.player ? 'player' : 'full';
    let dep = 0, sy = 1, spin = 0;
    if (k === 'shot') dep = s.shot.d0 !== undefined ? depth.shotDepth(s.shot) : depth.pd;
    else if (k === 'player') dep = depth.pd;
    else if (k === 'full') { sy = lane / MODEL_HALF; s.flat = true; }
    else if (k === 'door' || k === 'lift') { const z = depth.zoneOf(s.e); sy = (z?.h ?? 48) / MODEL_HALF; dep = z?.c ?? 0; s.flat = true; }
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
    let tex = null;
    for (let ty = Math.floor(z.y0 / g.th) - 1; ty >= 0 && tex === null; ty--) {
      const n = lv.fgmap[ty * lv.fgW + cx];
      if (g.assets.foreTile(n)?.mask) tex = renderer.textureNamed(`fg${n}`);
    }
    tex ??= fallback;
    const x0 = 2 * z.x0, x1 = 2 * (z.x1 + 1), zt = -2 * z.y0, zb = -2 * (z.y1 + 1);
    if (z.c - z.h > -lane) out.push({ min: [x0, -lane, zb], max: [x1, z.c - z.h, zt], tex });
    if (z.c + z.h < lane) out.push({ min: [x0, z.c + z.h, zb], max: [x1, lane, zt], tex });
  }
  return out;
}
