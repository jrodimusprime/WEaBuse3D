// Collision against the world's clipping hulls: a port of Quake's world.c
// (SV_HullPointContents, SV_RecursiveHullCheck, SV_HullForEntity and the
// world part of SV_Move / SV_ClipMoveToEntity).
//
// Only + - * / and comparisons are used, which JavaScript defines exactly
// (IEEE 754 doubles), so a trace gives the same answer in every engine.
import { CONTENTS_EMPTY, CONTENTS_SOLID } from './bsp.js';

export const DIST_EPSILON = 0.03125; // world.c: 1/32 epsilon to keep floating point happy

export function hullPointContents(hull, num, p) {
  while (num >= 0) {
    if (num < hull.firstclipnode || num > hull.lastclipnode) throw new Error('SV_HullPointContents: bad node number');
    const node = hull.clipnodes[num];
    const plane = hull.planes[node.planenum];
    const d = plane.type < 3 ? p[plane.type] - plane.dist : dot(plane.normal, p) - plane.dist;
    num = d < 0 ? node.children[1] : node.children[0];
  }
  return num;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function newTrace(end) {
  return { allsolid: true, startsolid: false, inopen: false, inwater: false, fraction: 1, endpos: end.slice(), plane: { normal: [0, 0, 0], dist: 0 } };
}

// world.c SV_RecursiveHullCheck, line for line
export function recursiveHullCheck(hull, num, p1f, p2f, p1, p2, trace) {
  if (num < 0) { // check for empty
    if (num !== CONTENTS_SOLID) {
      trace.allsolid = false;
      if (num === CONTENTS_EMPTY) trace.inopen = true;
      else trace.inwater = true;
    } else trace.startsolid = true;
    return true;
  }
  if (num > hull.lastclipnode) throw new Error('SV_RecursiveHullCheck: bad node number');

  const node = hull.clipnodes[num];
  const plane = hull.planes[node.planenum];
  let t1, t2;
  if (plane.type < 3) {
    t1 = p1[plane.type] - plane.dist;
    t2 = p2[plane.type] - plane.dist;
  } else {
    t1 = dot(plane.normal, p1) - plane.dist;
    t2 = dot(plane.normal, p2) - plane.dist;
  }
  if (t1 >= 0 && t2 >= 0) return recursiveHullCheck(hull, node.children[0], p1f, p2f, p1, p2, trace);
  if (t1 < 0 && t2 < 0) return recursiveHullCheck(hull, node.children[1], p1f, p2f, p1, p2, trace);

  // put the crosspoint DIST_EPSILON pixels on the near side
  let frac = t1 < 0 ? (t1 + DIST_EPSILON) / (t1 - t2) : (t1 - DIST_EPSILON) / (t1 - t2);
  if (frac < 0) frac = 0;
  if (frac > 1) frac = 1;
  let midf = p1f + (p2f - p1f) * frac;
  let mid = [p1[0] + frac * (p2[0] - p1[0]), p1[1] + frac * (p2[1] - p1[1]), p1[2] + frac * (p2[2] - p1[2])];
  const side = t1 < 0 ? 1 : 0;

  // move up to the node
  if (!recursiveHullCheck(hull, node.children[side], p1f, midf, p1, mid, trace)) return false;

  if (hullPointContents(hull, node.children[side ^ 1], mid) !== CONTENTS_SOLID) {
    // go past the node
    return recursiveHullCheck(hull, node.children[side ^ 1], midf, p2f, mid, p2, trace);
  }
  if (trace.allsolid) return false; // never got out of the solid area

  // the other side of the node is solid, this is the impact point
  if (!side) {
    trace.plane.normal = plane.normal.slice();
    trace.plane.dist = plane.dist;
  } else {
    trace.plane.normal = [-plane.normal[0], -plane.normal[1], -plane.normal[2]];
    trace.plane.dist = -plane.dist;
  }
  while (hullPointContents(hull, hull.firstclipnode, mid) === CONTENTS_SOLID) {
    // shouldn't really happen, but does occasionally
    frac -= 0.1;
    if (frac < 0) {
      trace.fraction = midf;
      trace.endpos = mid;
      return false;
    }
    midf = p1f + (p2f - p1f) * frac;
    mid = [p1[0] + frac * (p2[0] - p1[0]), p1[1] + frac * (p2[1] - p1[1]), p1[2] + frac * (p2[2] - p1[2])];
  }
  trace.fraction = midf;
  trace.endpos = mid;
  return false;
}

// world.c SV_HullForEntity, for the world model: picks the hull by box size
// and returns the offset that turns the box's origin into the hull's point.
export function hullForBox(model, mins, maxs) {
  const size = maxs[0] - mins[0];
  const hull = size < 3 ? model.hulls[0] : size <= 32 ? model.hulls[1] : model.hulls[2];
  const offset = [hull.clip_mins[0] - mins[0], hull.clip_mins[1] - mins[1], hull.clip_mins[2] - mins[2]];
  return { hull, offset };
}

// SV_Move against the world only: traces a box from start to end.
export function traceBox(model, start, mins, maxs, end) {
  const { hull, offset } = hullForBox(model, mins, maxs);
  const s = [start[0] - offset[0], start[1] - offset[1], start[2] - offset[2]];
  const e = [end[0] - offset[0], end[1] - offset[1], end[2] - offset[2]];
  const trace = newTrace(end);
  recursiveHullCheck(hull, hull.firstclipnode, 0, 1, s, e, trace);
  if (trace.fraction !== 1) trace.endpos = [trace.endpos[0] + offset[0], trace.endpos[1] + offset[1], trace.endpos[2] + offset[2]];
  else trace.endpos = end.slice();
  // world.c SV_ClipMoveToEntity: fix trace up by the offset; mark the world as hit
  if (trace.fraction < 1 || trace.startsolid) trace.ent = 'world';
  return trace;
}

// world.c SV_TestEntityPosition, for the world: is the box stuck in solid?
export function boxInSolid(model, origin, mins, maxs) {
  return traceBox(model, origin, mins, maxs, origin).startsolid;
}

export function pointContents(model, p) {
  return hullPointContents(model.hulls[0], model.hulls[0].firstclipnode, p);
}
