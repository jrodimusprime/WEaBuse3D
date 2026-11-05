// Writes a compiled level as a BSP2 file: Quake's BSP29 layout (bspfile.h,
// same 15 lumps in the same order) with the 32-bit indices and float bounding
// boxes of the BSP2 variant, as read by QuakeSpasm, FTE and ericw-tools.
//
//   node     int32 planenum, int32 children[2], float mins[3], maxs[3], uint32 firstface, numfaces   (44)
//   leaf     int32 contents, visofs, float mins[3], maxs[3], uint32 firstmarksurface, nummarksurfaces, u8 ambient[4] (44)
//   clipnode int32 planenum, int32 children[2]                                                   (12)
//   edge     uint32 v[2]                                                                         (8)
//   face     int32 planenum, side, firstedge, numedges, texinfo, u8 styles[4], int32 lightofs    (28)
//   marksurface uint32

export const LUMPS = ['entities', 'planes', 'textures', 'vertexes', 'visibility', 'nodes', 'texinfo', 'faces',
  'lighting', 'clipnodes', 'leafs', 'marksurfaces', 'edges', 'surfedges', 'models'];

class Out {
  constructor(size = 1 << 16) { this.buf = new ArrayBuffer(size); this.dv = new DataView(this.buf); this.p = 0; }
  need(n) {
    if (this.p + n <= this.buf.byteLength) return;
    let s = this.buf.byteLength * 2;
    while (s < this.p + n) s *= 2;
    const nb = new ArrayBuffer(s);
    new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.p));
    this.buf = nb; this.dv = new DataView(nb);
  }
  i32(v) { this.need(4); this.dv.setInt32(this.p, v, true); this.p += 4; }
  u32(v) { this.need(4); this.dv.setUint32(this.p, v, true); this.p += 4; }
  f32(v) { this.need(4); this.dv.setFloat32(this.p, v, true); this.p += 4; }
  u8(v) { this.need(1); this.dv.setUint8(this.p, v); this.p += 1; }
  bytes(b) { this.need(b.length); new Uint8Array(this.buf, this.p, b.length).set(b); this.p += b.length; }
  align() { while (this.p & 3) this.u8(0); }
  result() { return new Uint8Array(this.buf, 0, this.p).slice(); }
}

// Turns face polygons into shared vertices, edges and surfedges (edge 0 unused).
function geometry(faces) {
  const verts = [], vkey = new Map();
  const edges = [[0, 0]], ekey = new Map();
  const surfedges = [];
  const vert = (p) => {
    const q = p.map(Math.fround);
    const k = q.join(',');
    if (!vkey.has(k)) { vkey.set(k, verts.length); verts.push(q); }
    return vkey.get(k);
  };
  const out = faces.map((f) => {
    const ids = f.pts3.map(vert);
    const first = surfedges.length;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i + 1) % ids.length];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let e = ekey.get(k);
      if (e === undefined) { e = edges.length; edges.push([a, b]); ekey.set(k, e); surfedges.push(e); }
      else surfedges.push(edges[e][0] === a ? e : -e);
    }
    return { first, num: ids.length };
  });
  return { verts, edges, surfedges, faceEdges: out };
}

export function writeBSP2(bsp) {
  const g = geometry(bsp.faces);
  const o = new Out();
  o.bytes([0x42, 0x53, 0x50, 0x32]); // "BSP2"
  const dir = o.p;
  for (let i = 0; i < LUMPS.length * 2; i++) o.i32(0);
  const lumps = {};
  const lump = (name, fn) => { o.align(); const start = o.p; fn(); lumps[name] = [start, o.p - start]; };

  lump('entities', () => { o.bytes(new TextEncoder().encode(bsp.entities)); o.u8(0); });
  lump('planes', () => { for (const p of bsp.planes) { p.normal.forEach((v) => o.f32(v)); o.f32(p.dist); o.i32(p.type); } });
  lump('textures', () => {
    const n = bsp.textures.length;
    const base = o.p;
    o.i32(n);
    for (let i = 0; i < n; i++) o.i32(0);
    bsp.textures.forEach((t, i) => {
      o.align();
      const at = o.p - base;
      o.dv.setInt32(base + 4 + i * 4, at, true);
      const name = new Uint8Array(16);
      name.set(new TextEncoder().encode(t.name).subarray(0, 15));
      o.bytes(name);
      o.u32(t.w); o.u32(t.h);
      const mips = mipLevels(t);
      let off = 40;
      for (const m of mips) { o.u32(off); off += m.length; }
      for (const m of mips) o.bytes(m);
    });
  });
  lump('vertexes', () => { for (const v of g.verts) v.forEach((x) => o.f32(x)); });
  lump('visibility', () => {});
  lump('nodes', () => {
    for (const n of bsp.nodes) {
      o.i32(n.plane); o.i32(n.children[0]); o.i32(n.children[1]);
      n.mins.forEach((v) => o.f32(v)); n.maxs.forEach((v) => o.f32(v));
      o.u32(n.firstface); o.u32(n.numfaces);
    }
  });
  lump('texinfo', () => { for (const t of bsp.texinfo) { t.vecs.flat().forEach((v) => o.f32(v)); o.i32(t.miptex); o.i32(t.flags); } });
  lump('faces', () => {
    bsp.faces.forEach((f, i) => {
      o.i32(f.plane); o.i32(f.side); o.i32(g.faceEdges[i].first); o.i32(g.faceEdges[i].num); o.i32(f.texinfo);
      f.styles.forEach((s) => o.u8(s)); o.i32(f.lightofs);
    });
  });
  lump('lighting', () => o.bytes(bsp.lighting));
  lump('clipnodes', () => { for (const c of bsp.clipnodes) { o.i32(c.plane); o.i32(c.children[0]); o.i32(c.children[1]); } });
  lump('leafs', () => {
    for (const l of bsp.leafs) {
      o.i32(l.contents); o.i32(l.visofs);
      l.mins.forEach((v) => o.f32(v)); l.maxs.forEach((v) => o.f32(v));
      o.u32(l.firstmarksurface); o.u32(l.nummarksurfaces);
      for (let i = 0; i < 4; i++) o.u8(0);
    }
  });
  lump('marksurfaces', () => { for (const m of bsp.marksurfaces) o.u32(m); });
  lump('edges', () => { for (const [a, b] of g.edges) { o.u32(a); o.u32(b); } });
  lump('surfedges', () => { for (const s of g.surfedges) o.i32(s); });
  lump('models', () => {
    for (const m of bsp.models) {
      m.mins.forEach((v) => o.f32(v)); m.maxs.forEach((v) => o.f32(v)); m.origin.forEach((v) => o.f32(v));
      m.headnode.forEach((v) => o.i32(v));
      o.i32(m.visleafs); o.i32(m.firstface); o.i32(m.numfaces);
    }
  });
  LUMPS.forEach((name, i) => { o.dv.setInt32(dir + i * 8, lumps[name][0], true); o.dv.setInt32(dir + i * 8 + 4, lumps[name][1], true); });
  return o.result();
}

// Four mip levels by point sampling (Quake stores them; our renderer uses level 0).
function mipLevels(t) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const w = Math.max(1, t.w >> k), h = Math.max(1, t.h >> k);
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = t.pix[Math.min(t.h - 1, y << k) * t.w + Math.min(t.w - 1, x << k)];
    out.push(m);
  }
  return out;
}
