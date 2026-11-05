// Loads a Quake BSP (BSP2, or classic BSP29) into the structures the engine
// uses. A port of Quake's gl_model.c Mod_LoadBrushModel and its helpers
// (Mod_LoadPlanes, CalcSurfaceExtents, Mod_LoadNodes, Mod_LoadLeafs,
// Mod_LoadClipnodes, Mod_MakeHull0). Runs in browsers and in Node.

const LUMP = {
  ENTITIES: 0, PLANES: 1, TEXTURES: 2, VERTEXES: 3, VISIBILITY: 4, NODES: 5, TEXINFO: 6, FACES: 7,
  LIGHTING: 8, CLIPNODES: 9, LEAFS: 10, MARKSURFACES: 11, EDGES: 12, SURFEDGES: 13, MODELS: 14,
};

export const CONTENTS_EMPTY = -1;
export const CONTENTS_SOLID = -2;

export function loadBSP(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const ident = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
  const bsp2 = ident === 'BSP2';
  const version = dv.getInt32(0, true);
  if (!bsp2 && version !== 29) throw new Error(`not a BSP2 or BSP29 file (${ident})`);
  const lump = (i) => ({ ofs: dv.getInt32(4 + i * 8, true), len: dv.getInt32(8 + i * 8, true) });
  const f32 = (p) => dv.getFloat32(p, true), i32 = (p) => dv.getInt32(p, true), u32 = (p) => dv.getUint32(p, true);
  const i16 = (p) => dv.getInt16(p, true), u16 = (p) => dv.getUint16(p, true);
  const items = (i, size, fn) => {
    const { ofs, len } = lump(i);
    if (len % size) throw new Error(`lump ${i}: funny size`);
    return Array.from({ length: len / size }, (_, k) => fn(ofs + k * size, k));
  };

  const m = { bsp2 };

  // entities
  { const { ofs, len } = lump(LUMP.ENTITIES); m.entities = parseEntities(new TextDecoder().decode(u8.subarray(ofs, ofs + len)).replace(/\0.*$/s, '')); }

  // Mod_LoadPlanes: signbits speed up box tests
  m.planes = items(LUMP.PLANES, 20, (p) => {
    const normal = [f32(p), f32(p + 4), f32(p + 8)];
    let signbits = 0;
    for (let j = 0; j < 3; j++) if (normal[j] < 0) signbits |= 1 << j;
    return { normal, dist: f32(p + 12), type: i32(p + 16), signbits };
  });

  // Mod_LoadTextures (miptex level 0 only: our renderer makes its own mipmaps)
  {
    const { ofs, len } = lump(LUMP.TEXTURES);
    m.textures = [];
    if (len) {
      const n = i32(ofs);
      for (let i = 0; i < n; i++) {
        const o = i32(ofs + 4 + i * 4);
        if (o < 0) { m.textures.push(null); continue; }
        const b = ofs + o;
        const name = String.fromCharCode(...u8.subarray(b, b + 16)).replace(/\0.*$/s, '');
        const w = u32(b + 16), h = u32(b + 20), off0 = u32(b + 24);
        m.textures.push({ name, width: w, height: h, pixels: off0 ? u8.slice(b + off0, b + off0 + w * h) : null });
      }
    }
  }

  m.vertexes = items(LUMP.VERTEXES, 12, (p) => [f32(p), f32(p + 4), f32(p + 8)]);
  { const { ofs, len } = lump(LUMP.LIGHTING); m.lightdata = len ? u8.slice(ofs, ofs + len) : null; }
  { const { ofs, len } = lump(LUMP.VISIBILITY); m.visdata = len ? u8.slice(ofs, ofs + len) : null; }

  m.texinfo = items(LUMP.TEXINFO, 40, (p) => ({
    vecs: [[f32(p), f32(p + 4), f32(p + 8), f32(p + 12)], [f32(p + 16), f32(p + 20), f32(p + 24), f32(p + 28)]],
    miptex: i32(p + 32), flags: i32(p + 36),
  }));

  const edges = bsp2 ? items(LUMP.EDGES, 8, (p) => [u32(p), u32(p + 4)]) : items(LUMP.EDGES, 4, (p) => [u16(p), u16(p + 2)]);
  const surfedges = items(LUMP.SURFEDGES, 4, (p) => i32(p));

  // Mod_LoadFaces + CalcSurfaceExtents
  const faceSize = bsp2 ? 28 : 20;
  m.surfaces = items(LUMP.FACES, faceSize, (p) => {
    const planenum = bsp2 ? i32(p) : u16(p);
    const side = bsp2 ? i32(p + 4) : i16(p + 2);
    const firstedge = bsp2 ? i32(p + 8) : i32(p + 4);
    const numedges = bsp2 ? i32(p + 12) : i16(p + 8);
    const texinfo = bsp2 ? i32(p + 16) : i16(p + 10);
    const so = bsp2 ? p + 20 : p + 12;
    const styles = [u8[so], u8[so + 1], u8[so + 2], u8[so + 3]];
    const lightofs = i32(so + 4);
    const verts = [];
    for (let i = 0; i < numedges; i++) {
      const e = surfedges[firstedge + i];
      verts.push(m.vertexes[e >= 0 ? edges[e][0] : edges[-e][1]]);
    }
    const tex = m.texinfo[texinfo];
    const s = { plane: m.planes[planenum], planeback: side !== 0, verts, texinfo: tex, styles, lightofs, samples: lightofs >= 0 ? lightofs : -1 };
    calcSurfaceExtents(s);
    return s;
  });

  m.marksurfaces = bsp2 ? items(LUMP.MARKSURFACES, 4, (p) => u32(p)) : items(LUMP.MARKSURFACES, 2, (p) => u16(p));

  // Mod_LoadLeafs
  m.leafs = bsp2
    ? items(LUMP.LEAFS, 44, (p) => ({
      contents: i32(p), visofs: i32(p + 4),
      mins: [f32(p + 8), f32(p + 12), f32(p + 16)], maxs: [f32(p + 20), f32(p + 24), f32(p + 28)],
      firstmarksurface: u32(p + 32), nummarksurfaces: u32(p + 36),
    }))
    : items(LUMP.LEAFS, 28, (p) => ({
      contents: i32(p), visofs: i32(p + 4),
      mins: [i16(p + 8), i16(p + 10), i16(p + 12)], maxs: [i16(p + 14), i16(p + 16), i16(p + 18)],
      firstmarksurface: u16(p + 20), nummarksurfaces: u16(p + 22),
    }));
  for (const l of m.leafs) l.surfaces = Array.from({ length: l.nummarksurfaces }, (_, i) => m.surfaces[m.marksurfaces[l.firstmarksurface + i]]);

  // Mod_LoadNodes: children >= 0 are nodes, negative are -(leaf + 1)
  m.nodes = bsp2
    ? items(LUMP.NODES, 44, (p) => ({
      planenum: i32(p), childnums: [i32(p + 4), i32(p + 8)],
      mins: [f32(p + 12), f32(p + 16), f32(p + 20)], maxs: [f32(p + 24), f32(p + 28), f32(p + 32)],
      firstsurface: u32(p + 36), numsurfaces: u32(p + 40),
    }))
    : items(LUMP.NODES, 24, (p) => ({
      planenum: i32(p), childnums: [i16(p + 4), i16(p + 6)],
      mins: [i16(p + 8), i16(p + 10), i16(p + 12)], maxs: [i16(p + 14), i16(p + 16), i16(p + 18)],
      firstsurface: u16(p + 20), numsurfaces: u16(p + 22),
    }));
  for (const n of m.nodes) {
    n.plane = m.planes[n.planenum];
    n.contents = 0;
    n.children = n.childnums.map((c) => (c >= 0 ? m.nodes[c] : m.leafs[-1 - c]));
  }

  // Mod_LoadClipnodes: children are clipnode numbers or contents
  m.clipnodes = bsp2
    ? items(LUMP.CLIPNODES, 12, (p) => ({ planenum: i32(p), children: [i32(p + 4), i32(p + 8)] }))
    : items(LUMP.CLIPNODES, 8, (p) => ({ planenum: i32(p), children: [i16(p + 4), i16(p + 6)] }));

  m.models = items(LUMP.MODELS, 64, (p) => ({
    mins: [f32(p), f32(p + 4), f32(p + 8)], maxs: [f32(p + 12), f32(p + 16), f32(p + 20)],
    origin: [f32(p + 24), f32(p + 28), f32(p + 32)],
    headnode: [i32(p + 36), i32(p + 40), i32(p + 44), i32(p + 48)],
    visleafs: i32(p + 52), firstface: i32(p + 56), numfaces: i32(p + 60),
  }));

  // Mod_MakeHull0: hull 0 is the drawing tree seen as clipnodes
  const hull0nodes = m.nodes.map((n) => ({
    planenum: n.planenum,
    children: n.childnums.map((c) => (c >= 0 ? c : m.leafs[-1 - c].contents)),
  }));
  const head = m.models[0].headnode;
  m.hulls = [
    { clipnodes: hull0nodes, planes: m.planes, firstclipnode: head[0], lastclipnode: hull0nodes.length - 1, clip_mins: [0, 0, 0], clip_maxs: [0, 0, 0] },
    { clipnodes: m.clipnodes, planes: m.planes, firstclipnode: head[1], lastclipnode: m.clipnodes.length - 1, clip_mins: [-16, -16, -24], clip_maxs: [16, 16, 32] },
    { clipnodes: m.clipnodes, planes: m.planes, firstclipnode: head[2], lastclipnode: m.clipnodes.length - 1, clip_mins: [-32, -32, -24], clip_maxs: [32, 32, 64] },
  ];
  m.root = m.nodes[head[0]];
  return m;
}

// gl_model.c CalcSurfaceExtents
export function calcSurfaceExtents(s) {
  const mins = [999999, 999999], maxs = [-99999, -99999];
  const tex = s.texinfo;
  for (const v of s.verts) {
    for (let j = 0; j < 2; j++) {
      const val = v[0] * tex.vecs[j][0] + v[1] * tex.vecs[j][1] + v[2] * tex.vecs[j][2] + tex.vecs[j][3];
      if (val < mins[j]) mins[j] = val;
      if (val > maxs[j]) maxs[j] = val;
    }
  }
  s.texturemins = [0, 0];
  s.extents = [0, 0];
  for (let i = 0; i < 2; i++) {
    const bmin = Math.floor(mins[i] / 16), bmax = Math.ceil(maxs[i] / 16);
    s.texturemins[i] = bmin * 16;
    s.extents[i] = (bmax - bmin) * 16;
  }
}

export function parseEntities(text) {
  const out = [];
  const re = /\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const e = {};
    for (const kv of m[1].matchAll(/"([^"]*)"\s+"([^"]*)"/g)) e[kv[1]] = kv[2];
    out.push(e);
  }
  return out;
}
