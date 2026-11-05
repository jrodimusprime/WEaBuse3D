// Where each model of the scene goes in 3D: a transform (basis and offset)
// for the renderer, from the depth layer's kinds and depths.
//
//   full   stretched across the whole hall, as a slab (doors, walls, lifts, lava)
//   wall   flattened against the back wall (switches, turrets, signs)
//   floor  as deep as it is wide, at its spot (teleporters, springs)
//   item   at its spot, turning like a Quake item
//   enemy, fx and shots at their depth
import { MODEL_HALF } from '../engine/voxel.js';

export function placeScene(scene, depth, lane, timeMs) {
  for (const s of scene.sprites) {
    const k = s.shot ? 'shot' : s.e ? depth.kind(s.e) : s.player ? 'player' : 'full';
    let dep = 0, sy = 1, spin = 0;
    if (k === 'shot') dep = s.shot.d0 !== undefined ? depth.shotDepth(s.shot) : depth.pd;
    else if (k === 'player') dep = depth.pd;
    else if (k === 'full') { sy = lane / MODEL_HALF; s.flat = true; }
    else if (k === 'wall') { sy = 0.5; dep = lane - MODEL_HALF * 0.5; }
    else if (k === 'floor') { sy = s.img.w / MODEL_HALF; dep = depth.depthOf(s.e); }
    else if (k === 'item') { dep = depth.depthOf(s.e); spin = (timeMs / 1000) * 2.2 + (s.e.id || 0); }
    else dep = depth.depthOf(s.e) ?? 0;
    const c = Math.cos(spin), sn = Math.sin(spin), half = s.img.w; // the model's middle, in units (2 per pixel)
    // basis = rotation about the vertical (Z) through the middle, after stretching in depth; column-major
    s.basis = new Float32Array([c, sn, 0, -sn * sy, c * sy, 0, 0, 0, 1]);
    s.offset = [2 * s.x + half - c * half, dep - sn * half, -2 * s.y];
  }
  for (const b of scene.boxes) {
    if (b.shot) b.depth = b.shot.d0 !== undefined ? depth.shotDepth(b.shot) : depth.pd;
    else if (b.e && depth.kind(b.e) === 'full') b.half = lane;
    else if (b.e) b.depth = depth.depthOf(b.e) ?? 0;
  }
  return scene;
}
