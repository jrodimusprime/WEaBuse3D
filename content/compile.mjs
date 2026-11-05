// Compiles one Abuse level (from level-input.mjs) into the parts of a Quake
// BSP: planes, nodes, leaves, faces, clip hulls, textures and lightmaps. The
// writer (bsp2-write.mjs) turns the result into a BSP2 file.
//
// The world is the 2D BSP of the tile outlines, extruded through the lane:
//
//   Y = -LANE  front wall      (the side the classic camera will look from)
//   Y = +LANE  back wall       (textured with the level's background tiles)
//
// Abuse pixel (x, y), y down, is Quake (X = 2x, Z = -2y). See README
// "Turning 2D maps into 3D" for why the scale is 2.
import * as B from './bsp2d.mjs';
import { lightRange } from '../sim/web/src/lighting.js';

export const SCALE = 2;
export const LANE = 64; // half the lane's depth, in Quake units

// Quake's clipping hulls (gl_model.c Mod_LoadBrushModel / bspfile.h)
export const HULLS = [
  { mins: [0, 0, 0], maxs: [0, 0, 0] },
  { mins: [-16, -16, -24], maxs: [16, 16, 32] },
  { mins: [-32, -32, -24], maxs: [32, 32, 64] },
];

const CONTENTS_EMPTY = -1, CONTENTS_SOLID = -2;

// ---- planes ----

class Planes {
  constructor() { this.list = []; this.byKey = new Map(); }
  // a 2D line (canonical) as a Quake plane
  line(l) {
    const key = `L${l.key}`;
    if (this.byKey.has(key)) return this.byKey.get(key);
    const len = Math.hypot(l.a, l.b);
    const normal = [l.a / len, 0, -l.b / len];
    const type = l.b === 0 ? 0 : l.a === 0 ? 2 : Math.abs(l.a) >= Math.abs(l.b) ? 3 : 5;
    return this.add(key, { normal, dist: (SCALE * l.c) / len, type });
  }
  // the plane Y = dist
  depth(dist) {
    const key = `Y${dist}`;
    return this.byKey.get(key) ?? this.add(key, { normal: [0, 1, 0], dist, type: 1 });
  }
  add(key, p) { this.list.push(p); this.byKey.set(key, this.list.length - 1); return this.list.length - 1; }
}

// ---- the 2D world: outer border, then the outline tree ----

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// Builds the 2D tree for a set of solid polygons inside the frame
// [x0, x1] x [y0, y1]; everything outside the frame is solid. Returns a tree
// whose top nodes are the frame's four sides.
function world2D(polys, frame) {
  const [x0, y0, x1, y1] = frame;
  const huge = 1e6;
  let region = B.makeShape(rect(-huge, -huge, huge, huge));
  const sides = [
    B.canonLine(1, 0, x0).line, B.canonLine(1, 0, x1).line,
    B.canonLine(0, 1, y0).line, B.canonLine(0, 1, y1).line,
  ];
  const inner = [(x0 + x1) / 2, (y0 + y1) / 2];
  const chain = [];
  for (const line of sides) {
    const [f, b] = B.splitShape(region, line);
    const innerFront = B.side(line, inner) > 0;
    chain.push({ line, region, innerFront });
    region = innerFront ? f : b;
  }
  const shapes = polys.map((p) => B.makeShape(B.area2(p) > 0 ? p : p.slice().reverse()));
  let tree = B.buildTree(shapes, region);
  for (let i = chain.length - 1; i >= 0; i--) {
    const { line, region: r, innerFront } = chain[i];
    const solid = { solid: true, region: null };
    tree = innerFront ? { line, region: r, front: tree, back: solid } : { line, region: r, front: solid, back: tree };
  }
  return tree;
}

// ---- segments of a line pushed down a tree (to find visible faces) ----

function lineParam(l) {
  const n2 = l.a * l.a + l.b * l.b;
  return { p0: [(l.a * l.c) / n2, (l.b * l.c) / n2], d: [-l.b, l.a] };
}
const at = (lp, t) => [lp.p0[0] + t * lp.d[0], lp.p0[1] + t * lp.d[1]];

// the stretch of line `l` inside a convex region, as [t0, t1], or null
function clipLine(l, region) {
  const lp = lineParam(l);
  const dd = lp.d[0] * lp.d[0] + lp.d[1] * lp.d[1];
  let t0 = Infinity, t1 = -Infinity;
  const pts = region.pts;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const dp = B.side(l, p), dq = B.side(l, q);
    const hit = [];
    if (Math.abs(dp) < 1e-7) hit.push(p);
    if ((dp > 1e-7 && dq < -1e-7) || (dp < -1e-7 && dq > 1e-7)) {
      const s = dp / (dp - dq);
      hit.push([p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])]);
    }
    for (const h of hit) {
      const t = ((h[0] - lp.p0[0]) * lp.d[0] + (h[1] - lp.p0[1]) * lp.d[1]) / dd;
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
    }
  }
  return t1 - t0 > 1e-9 ? [t0, t1, lp] : null;
}

// pieces [t0, t1, leaf] of the stretch (t0, t1) of `lp` as it lands in leaves of `node`
function push(node, lp, t0, t1, out) {
  if (!node.line) { out.push([t0, t1, node]); return out; }
  const l = node.line;
  const s0 = B.side(l, lp.p0), ds = l.a * lp.d[0] + l.b * lp.d[1];
  const sideOf = (t) => (s0 + t * ds >= 0 ? node.front : node.back);
  if (Math.abs(ds) < 1e-12) return push(sideOf((t0 + t1) / 2), lp, t0, t1, out);
  const tc = -s0 / ds;
  if (tc <= t0 + 1e-9 || tc >= t1 - 1e-9) return push(sideOf((t0 + t1) / 2), lp, t0, t1, out);
  push(sideOf((t0 + tc) / 2), lp, t0, tc, out);
  push(sideOf((tc + t1) / 2), lp, tc, t1, out);
  return out;
}

// ---- the compiler ----

export function compileLevel(input) {
  const { lv, assets, tw, th, bw, bh, width, height } = input;
  const planes = new Planes();
  const frame = [-tw, -th, width + tw, height + th];
  const border = [
    rect(-tw, -th, width + tw, 0), rect(-tw, height, width + tw, height + th),
    rect(-tw, 0, 0, height), rect(width, 0, width + tw, height),
  ];
  const solids = [...input.shapes, ...border];

  // textures and texinfo
  const tex = new Textures(assets);
  const texinfo = new TexInfos();
  const rx = lv.bgRate.xmul / lv.bgRate.xdiv, ry = lv.bgRate.ymul / lv.bgRate.ydiv;

  // ---- hull 0: nodes, leaves and faces ----
  const tree = world2D(solids, frame);
  const faces = []; // {plane, side, pts3: [[X,Y,Z]...], texinfo, leaf}
  const nodeFaces = new Map(); // tree node -> face list
  const leafFaces = new Map(); // tree leaf -> face list
  const addFace = (node, leaf, f) => {
    faces.push(f);
    if (!nodeFaces.has(node)) nodeFaces.set(node, []);
    nodeFaces.get(node).push(f);
    if (!leafFaces.has(leaf)) leafFaces.set(leaf, []);
    leafFaces.get(leaf).push(f);
  };
  const Q = ([x, y], Y) => [SCALE * x, Y, -SCALE * y];

  // Edge faces: where a splitting line separates solid from empty.
  const walk2D = (node) => {
    if (!node.line) return;
    const seg = clipLine(node.line, node.region);
    if (seg) {
      const [t0, t1, lp] = seg;
      const fr = push(node.front, lp, t0, t1, []);
      const bk = push(node.back, lp, t0, t1, []);
      for (const [a, b, fl, bl] of overlay(fr, bk)) {
        if (fl.solid === bl.solid) continue;
        const facingFront = !fl.solid; // the open side is in front of the line
        const leaf = facingFront ? fl : bl;
        for (const [ta, tb] of splitAtGrid(lp, a, b, tw, th)) {
          const A = at(lp, ta), Bp = at(lp, tb);
          const mid = at(lp, (ta + tb) / 2);
          const n = Math.hypot(node.line.a, node.line.b);
          const into = facingFront ? -0.5 : 0.5; // half a pixel into the solid side
          const probe = [mid[0] + (into * node.line.a) / n, mid[1] + (into * node.line.b) / n];
          const tile = fgTileAt(lv, tw, th, probe);
          const floorish = Math.abs(node.line.b) >= Math.abs(node.line.a);
          const ti = texinfo.get(tex.fg(tile), floorish ? 'floor' : 'wall');
          const pts3 = [Q(A, -LANE), Q(Bp, -LANE), Q(Bp, LANE), Q(A, LANE)];
          addFace(node, leaf, { plane: planes.line(node.line), side: facingFront ? 0 : 1, pts3, texinfo: ti });
        }
      }
    }
    walk2D(node.front);
    walk2D(node.back);
  };
  walk2D(tree);

  // Wall faces: every empty leaf, cut along the foreground and background
  // grids, at both ends of the lane. A wall shows what Abuse draws behind the
  // player there: the cell's foreground tile when it has any picture (most
  // open space is covered by non-solid decorative tiles), else the background.
  const backNode = { y: LANE }, frontNode = { y: -LANE };
  const emptyLeaves = [];
  const collect = (n) => { if (n.line) { collect(n.front); collect(n.back); } else if (!n.solid) emptyLeaves.push(n); };
  collect(tree);
  const cellW = bw / rx, cellH = bh / ry; // one background tile, in level pixels
  const drawn = new Map(); // foreground tile number -> has a picture
  const fgDrawn = (n) => {
    if (!drawn.has(n)) { const im = assets.foreTile(n); drawn.set(n, !!im && im.pix.some((v) => v)); }
    return drawn.get(n);
  };
  for (const leaf of emptyLeaves) {
    for (const piece of gridPieces(leaf.region, [[tw, th], [cellW, cellH]])) {
      const c = B.centroid(piece.pts);
      const fgTile = fgTileAt(lv, tw, th, c);
      const ti = fgDrawn(fgTile)
        ? texinfo.get(tex.fg(fgTile), 'decor')
        : texinfo.get(tex.bg(bgTileAt(lv, Math.floor(c[0] / cellW), Math.floor(c[1] / cellH))), 'bgwall', rx, ry);
      addFace(backNode, leaf, { plane: planes.depth(LANE), side: 1, pts3: piece.pts.map((p) => Q(p, LANE)), texinfo: ti });
      addFace(frontNode, leaf, { plane: planes.depth(-LANE), side: 0, pts3: piece.pts.map((p) => Q(p, -LANE)), texinfo: ti });
    }
  }
  for (const f of faces) orientFace(f, planes.list[f.plane]);

  // Nodes and leaves in depth-first order, faces grouped by node.
  const nodes = [], leafs = [{ contents: CONTENTS_SOLID, visofs: -1, mins: [0, 0, 0], maxs: [0, 0, 0], faces: [] }];
  const orderedFaces = [];
  const worldMins = [SCALE * frame[0], -LANE, -SCALE * frame[3]], worldMaxs = [SCALE * frame[2], LANE, -SCALE * frame[1]];
  const box2 = (region) => {
    const xs = region.pts.map((p) => p[0]), ys = region.pts.map((p) => p[1]);
    const cl = (v, i) => Math.max(worldMins[i], Math.min(worldMaxs[i], v));
    return {
      mins: [cl(SCALE * Math.min(...xs), 0), -LANE, cl(-SCALE * Math.max(...ys), 2)],
      maxs: [cl(SCALE * Math.max(...xs), 0), LANE, cl(-SCALE * Math.min(...ys), 2)],
    };
  };
  const emitLeaf = (leaf) => {
    if (leaf.solid) return -1; // leaf 0
    leafs.push({ contents: CONTENTS_EMPTY, visofs: -1, ...box2(leaf.region), faces: leafFaces.get(leaf) || [] });
    return -leafs.length; // -(index + 1)
  };
  const emitNode = (key, plane, box, children) => {
    const idx = nodes.length;
    const nf = nodeFaces.get(key) || [];
    nodes.push({ plane, mins: box.mins, maxs: box.maxs, firstface: orderedFaces.length, numfaces: nf.length, children: [0, 0] });
    orderedFaces.push(...nf);
    nodes[idx].children = children.map((c) => c());
    return idx;
  };
  const emit2D = (n) => (n.line
    ? emitNode(n, planes.line(n.line), box2(n.region), [() => emit2D(n.front), () => emit2D(n.back)])
    : emitLeaf(n));
  const world = { mins: worldMins, maxs: worldMaxs };
  // root: Y = -LANE (front side is the lane), then Y = +LANE (back side is the lane)
  emitNode(frontNode, planes.depth(-LANE), world, [
    () => emitNode(backNode, planes.depth(LANE), world, [() => -1, () => emit2D(tree)]),
    () => -1,
  ]);
  const faceIndex = new Map(orderedFaces.map((f, i) => [f, i]));
  const marksurfaces = [];
  for (const l of leafs) {
    l.firstmarksurface = marksurfaces.length;
    l.nummarksurfaces = l.faces.length;
    for (const f of l.faces) marksurfaces.push(faceIndex.get(f));
    delete l.faces;
  }

  // ---- clip hulls 1 and 2 ----
  const clipnodes = [];
  const headnodes = [0, 0, 0, 0];
  for (const h of [1, 2]) {
    const { mins, maxs } = HULLS[h];
    // Minkowski sum with the box mirrored: a hull point is solid when the box there touches solid
    const l = maxs[0] / SCALE, r = -mins[0] / SCALE, u = -mins[2] / SCALE, d = maxs[2] / SCALE;
    const grown = solids.map((p) => B.expand(p, l, r, u, d));
    const htree = world2D(grown, frame);
    const emit = (n) => {
      if (!n.line) return n.solid ? CONTENTS_SOLID : CONTENTS_EMPTY;
      const idx = clipnodes.length;
      clipnodes.push({ plane: planes.line(n.line), children: [0, 0] });
      clipnodes[idx].children = [emit(n.front), emit(n.back)];
      return idx;
    };
    const lane = LANE - maxs[1];
    headnodes[h] = clipnodes.length;
    const root = clipnodes.length;
    clipnodes.push({ plane: planes.depth(-lane), children: [0, CONTENTS_SOLID] });
    const second = clipnodes.length;
    clipnodes.push({ plane: planes.depth(lane), children: [CONTENTS_SOLID, 0] });
    clipnodes[root].children[0] = second;
    clipnodes[second].children[1] = emit(htree);
  }

  // ---- lightmaps ----
  const lighting = bakeLights(orderedFaces, texinfo.list, lv);

  const start = { X: SCALE * input.start.x, Y: 0, Z: -SCALE * input.start.y - HULLS[1].mins[2] + 1 };
  const entities = entityText([
    { classname: 'worldspawn', message: input.name, _abuse_scale: String(SCALE), _abuse_lane: String(LANE) },
    { classname: 'info_player_start', origin: `${start.X} ${start.Y} ${start.Z}`, angle: '0' },
    ...lv.lights.map((l) => ({
      classname: 'light', origin: `${SCALE * l.x} 0 ${-SCALE * l.y}`, light: String(l.outer * SCALE),
      _abuse_type: String(l.type), _abuse_inner: String(l.inner), _abuse_outer: String(l.outer),
      _abuse_xs: String(l.xs), _abuse_ys: String(l.ys),
    })),
  ]);

  return {
    entities, planes: planes.list, textures: tex.list, texinfo: texinfo.list,
    nodes, leafs, faces: orderedFaces, marksurfaces, clipnodes, lighting,
    models: [{ mins: worldMins, maxs: worldMaxs, origin: [0, 0, 0], headnode: [0, headnodes[1], headnodes[2], 0], visleafs: leafs.length - 1, firstface: 0, numfaces: orderedFaces.length }],
    start,
  };
}

// The two piece lists cover the same stretch; returns [t0, t1, frontLeaf, backLeaf] runs.
function overlay(fr, bk) {
  const out = [];
  let i = 0, j = 0, t = fr[0][0];
  while (i < fr.length && j < bk.length) {
    const end = Math.min(fr[i][1], bk[j][1]);
    if (end - t > 1e-9) out.push([t, end, fr[i][2], bk[j][2]]);
    t = end;
    if (fr[i][1] <= end + 1e-12) i++;
    if (j < bk.length && bk[j][1] <= end + 1e-12) j++;
  }
  return out;
}

// cuts (t0, t1) along `lp` where it crosses the foreground tile grid
function splitAtGrid(lp, t0, t1, tw, th) {
  const cuts = [t0, t1];
  const A = at(lp, t0), Bp = at(lp, t1);
  for (const [axis, size] of [[0, tw], [1, th]]) {
    const d = lp.d[axis];
    if (Math.abs(d) < 1e-12) continue;
    const lo = Math.min(A[axis], Bp[axis]), hi = Math.max(A[axis], Bp[axis]);
    for (let k = Math.floor(lo / size) + 1; k * size < hi - 1e-9; k++) {
      cuts.push((k * size - lp.p0[axis]) / d);
    }
  }
  cuts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i++) if (cuts[i + 1] - cuts[i] > 1e-9) out.push([cuts[i], cuts[i + 1]]);
  return out;
}

// a convex region cut along one or more grids ([[cellW, cellH], ...]), as convex pieces
function gridPieces(region, grids) {
  let parts = [region];
  for (const [axis, size] of grids.flatMap(([cw, ch]) => [[0, cw], [1, ch]])) {
    const vs = region.pts.map((p) => p[axis]);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    for (let k = Math.floor(lo / size) + 1; k * size < hi - 1e-9; k++) {
      const line = axis === 0 ? { a: 1, b: 0, c: k * size, key: `gx${k}` } : { a: 0, b: 1, c: k * size, key: `gy${k}` };
      const next = [];
      for (const p of parts) for (const half of B.splitShape(p, line)) if (half) next.push(half);
      parts = next;
    }
  }
  return parts;
}

function fgTileAt(lv, tw, th, [x, y]) {
  const tx = Math.max(0, Math.min(lv.fgW - 1, Math.floor(x / tw)));
  const ty = Math.max(0, Math.min(lv.fgH - 1, Math.floor(y / th)));
  return lv.fgmap[ty * lv.fgW + tx];
}

function bgTileAt(lv, i, j) {
  if (!lv.bgW) return 0;
  i = Math.max(0, Math.min(lv.bgW - 1, i));
  j = Math.max(0, Math.min(lv.bgH - 1, j));
  return lv.bgmap[j * lv.bgW + i];
}

// Quake windings are clockwise seen from the side the face is drawn on
// (qbsp: plane normal = (p0 - p1) x (p2 - p1)). Fix the order to match.
function orientFace(f, plane) {
  const [p0, p1, p2] = f.pts3;
  const u = [p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]];
  const v = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const facing = f.side ? -1 : 1;
  const dot = (n[0] * plane.normal[0] + n[1] * plane.normal[1] + n[2] * plane.normal[2]) * facing;
  if (dot < 0) f.pts3.reverse();
}

// ---- textures ----

class Textures {
  constructor(assets) { this.assets = assets; this.list = []; this.byName = new Map(); }
  fg(n) { return this.add(`fg${n}`, () => this.assets.foreTile(n)); }
  bg(n) { return this.add(`bg${n}`, () => this.assets.backTile(n)); }
  add(name, load) {
    if (this.byName.has(name)) return this.byName.get(name);
    const img = load();
    const t = img ? { name, w: img.w, h: img.h, pix: Uint8Array.from(img.pix) } : { name, w: 16, h: 16, pix: new Uint8Array(256).fill(0) };
    this.list.push(t);
    this.byName.set(name, this.list.length - 1);
    return this.list.length - 1;
  }
}

// World-anchored texture axes, in texels per Quake unit (1 texel = 1 Abuse pixel = 2 units).
// Floors and ceilings: s along X, t along the lane. Walls: s along the lane, t down.
// The back and front walls: the background picture, squeezed by the parallax rate.
class TexInfos {
  constructor() { this.list = []; this.byKey = new Map(); }
  get(miptex, kind, rx = 1, ry = 1) {
    const key = `${miptex}|${kind}|${rx}|${ry}`;
    if (this.byKey.has(key)) return this.byKey.get(key);
    const h = 1 / SCALE;
    // 'decor' and 'bgwall' face the lane: s along X, t down (the 2D picture, as Abuse draws it)
    const vecs = kind === 'floor' ? [[h, 0, 0, 0], [0, h, 0, 0]]
      : kind === 'wall' ? [[0, h, 0, 0], [0, 0, -h, 0]]
        : [[h * rx, 0, 0, 0], [0, 0, -h * ry, 0]];
    this.list.push({ vecs, miptex, flags: 0 });
    this.byKey.set(key, this.list.length - 1);
    return this.list.length - 1;
  }
}

// ---- lightmaps ----

// Quake's surface extents (gl_model.c CalcSurfaceExtents), computed from the
// values as they are stored in the file (32-bit floats).
export function surfaceExtents(pts3, vecs) {
  const f = Math.fround;
  const mins = [Infinity, Infinity], maxs = [-Infinity, -Infinity];
  for (const v of pts3) {
    for (let j = 0; j < 2; j++) {
      const val = f(v[0]) * f(vecs[j][0]) + f(v[1]) * f(vecs[j][1]) + f(v[2]) * f(vecs[j][2]) + f(vecs[j][3]);
      if (val < mins[j]) mins[j] = val;
      if (val > maxs[j]) maxs[j] = val;
    }
  }
  const texturemins = [0, 0], extents = [0, 0];
  for (let i = 0; i < 2; i++) {
    const bmin = Math.floor(mins[i] / 16), bmax = Math.ceil(maxs[i] / 16);
    texturemins[i] = bmin * 16;
    extents[i] = (bmax - bmin) * 16;
  }
  return { texturemins, extents };
}

// Abuse's light level (0-63) at a pixel: the area ambient plus every light,
// exactly as WEaBuse computes it (sim/web/src/lighting.js LightMap.update,
// game.js applyArea for the ambient).
export function abuseLight(lv, px, py, ranges) {
  let best = null, size = Infinity;
  for (const a of lv.areas) {
    if (px >= a.x && py >= a.y && px <= a.x + a.w && py <= a.y + a.h && a.w * a.h < size) { best = a; size = a.w * a.h; }
  }
  let lev = best && best.ambient >= 0 ? best.ambient : 32;
  for (const { l, r, mul } of ranges) {
    if (px < r[0] || px > r[2] || py < r[1] || py > r[3]) continue;
    if (l.type === 9) { lev = l.inner; break; }
    const dx = Math.abs(l.x - px) << l.xs;
    const dy = Math.abs(l.y - py) << l.ys;
    const r2 = dx < dy ? dx + dy - (dx >> 1) : dx + dy - (dy >> 1);
    if (r2 < l.outer) lev += Math.floor(((l.outer - r2) * mul) / 65536);
  }
  return lev > 63 ? 63 : lev < 0 ? 0 : lev;
}

function bakeLights(faces, texinfo, lv) {
  const ranges = lv.lights.map((l) => ({ l, r: lightRange(l), mul: l.outer > l.inner ? Math.floor(65536 / (l.outer - l.inner)) * 64 : 0 }));
  const chunks = [];
  let size = 0;
  for (const f of faces) {
    const vecs = texinfo[f.texinfo].vecs;
    const { texturemins, extents } = surfaceExtents(f.pts3, vecs);
    const smax = (extents[0] >> 4) + 1, tmax = (extents[1] >> 4) + 1;
    const n = planeOf(f.pts3);
    const buf = new Uint8Array(smax * tmax);
    for (let t = 0; t < tmax; t++) {
      for (let s = 0; s < smax; s++) {
        const P = solve3(vecs[0], vecs[1], n, texturemins[0] + s * 16, texturemins[1] + t * 16);
        const px = Math.round(P[0] / SCALE), py = Math.round(-P[2] / SCALE);
        buf[t * smax + s] = Math.round((abuseLight(lv, px, py, ranges) * 255) / 63);
      }
    }
    f.styles = [0, 255, 255, 255];
    f.lightofs = size;
    chunks.push(buf);
    size += buf.length;
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function planeOf(pts) {
  const [p0, p1, p2] = pts;
  const u = [p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]];
  const v = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n);
  const nn = n.map((x) => x / len);
  return [...nn, nn[0] * p1[0] + nn[1] * p1[1] + nn[2] * p1[2]];
}

// the point on plane n (with n[3] = dist) whose texture coordinates are (s, t)
function solve3(S, T, n, s, t) {
  const m = [[S[0], S[1], S[2]], [T[0], T[1], T[2]], [n[0], n[1], n[2]]];
  const r = [s - S[3], t - T[3], n[3]];
  const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const D = det(m);
  return [0, 1, 2].map((c) => det(m.map((row, i) => row.map((v, j) => (j === c ? r[i] : v)))) / D);
}

function entityText(list) {
  return list.map((e) => `{\n${Object.entries(e).map(([k, v]) => `"${k}" "${v}"`).join('\n')}\n}\n`).join('');
}
