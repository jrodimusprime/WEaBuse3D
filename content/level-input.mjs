// Reads an Abuse level through WEaBuse's own parser (sim/web/src/level.js) and
// turns it into what the BSP compiler needs: the solid tile outlines as convex
// polygons in Abuse pixel space (y down), the tile numbers for textures, the
// lights, the ambient areas and the player start.
//
// Coordinates stay in Abuse pixels here; the compiler converts to Quake units
// (X = 2x, Z = -2y) when it writes the BSP.

const SIM = new URL('../sim/web/', import.meta.url);

let assetsPromise = null;

// The game's art and tile tables, loaded once per process.
export async function loadAssets() {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      await import(new URL('tools/headless.mjs', SIM)); // Node stand-ins for fetch and friends
      const { Assets } = await import(new URL('src/assets.js', SIM));
      const a = new Assets();
      await quiet(() => a.init()); // the Lisp reader logs harmless notes while loading
      return a;
    })();
  }
  return assetsPromise;
}

async function quiet(fn) {
  const { log, warn } = console;
  console.log = console.warn = () => {};
  try { return await fn(); } finally { console.log = log; console.warn = warn; }
}

// A tile's outline (sim/web/src/spec.js readForeTile: `points`) as a convex
// polygon inside its cell. Outline points are inclusive pixel coordinates, so a
// point on the last column or row (tw-1, th-1) is the cell's far edge.
export function tileOutline(tile, tw, th) {
  const pts = tile.points.slice();
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  if (pts.length < 3) return null;
  const snap = (v, max) => Math.min(max, v >= max - 1 ? max : v);
  let poly = pts.map(([x, y]) => [snap(x, tw), snap(y, th)]);
  // drop repeated points, then make the winding counter-clockwise in (x, y-down) terms
  poly = poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]; return p[0] !== q[0] || p[1] !== q[1]; });
  if (poly.length < 3) return null;
  if (area2(poly) < 0) poly.reverse();
  return poly;
}

export function area2(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s;
}

function isRect(poly) {
  if (poly.length !== 4) return null;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const corners = poly.every(([x, y]) => (x === x0 || x === x1) && (y === y0 || y === y1));
  return corners ? { x0, x1, y0, y1 } : null;
}

const rectPoly = ({ x0, y0, x1, y1 }) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// Solid shapes of the level in pixel space. Full-width rectangles in a row are
// merged into runs, and runs of full cells are merged downwards, so the BSP
// does not have to split thousands of identical blocks one by one.
export function levelShapes(lv, assets, tw, th) {
  const W = lv.fgW, H = lv.fgH;
  const cellRect = new Array(W * H).fill(null); // {y0,y1} within the cell when full width
  const shapes = [];
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const tile = assets.foreTile(lv.fgmap[ty * W + tx]);
      if (!tile || !tile.mask) continue;
      const poly = tileOutline(tile, tw, th);
      if (!poly) continue;
      const r = isRect(poly);
      if (r && r.x0 === 0 && r.x1 === tw) cellRect[ty * W + tx] = r;
      else shapes.push(poly.map(([x, y]) => [x + tx * tw, y + ty * th]));
    }
  }
  // horizontal runs of rectangles with the same vertical span
  const runs = [];
  for (let ty = 0; ty < H; ty++) {
    let tx = 0;
    while (tx < W) {
      const r = cellRect[ty * W + tx];
      if (!r) { tx++; continue; }
      let end = tx + 1;
      while (end < W && cellRect[ty * W + end] && cellRect[ty * W + end].y0 === r.y0 && cellRect[ty * W + end].y1 === r.y1) end++;
      runs.push({ x0: tx * tw, x1: end * tw, y0: ty * th + r.y0, y1: ty * th + r.y1, full: r.y0 === 0 && r.y1 === th });
      tx = end;
    }
  }
  // stack full-height runs that line up exactly
  const open = new Map(); // "x0,x1" -> rect still growing downwards
  const done = [];
  for (const run of runs) {
    if (!run.full) { done.push(run); continue; }
    const key = `${run.x0},${run.x1}`;
    const prev = open.get(key);
    if (prev && prev.y1 === run.y0) prev.y1 = run.y1;
    else { if (prev) done.push(prev); open.set(key, { ...run }); }
  }
  for (const r of open.values()) done.push(r);
  done.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0 || a.y1 - b.y1 || a.x1 - b.x1);
  return [...done.map(rectPoly), ...shapes];
}

// Everything the compiler needs about one level.
export async function loadLevelInput(file) {
  const assets = await loadAssets();
  const { loadLevel } = await import(new URL('src/level.js', SIM));
  const lv = await loadLevel(file);
  // game.js start(): the tile size is that of foreground tile 1 (loader2.cpp f_wid/f_hi)
  const ft = assets.foreTile(1) || assets.foreTile(0);
  const bt = assets.backTile(0) || assets.backTile([...assets.back.keys()][0]);
  const tw = ft.w, th = ft.h;
  const start = lv.objects.find((o) => o.type === 'START');
  return {
    name: file.replace(/\.spe$/, ''),
    lv, assets, tw, th, bw: bt.w, bh: bt.h,
    width: lv.fgW * tw, height: lv.fgH * th,
    shapes: levelShapes(lv, assets, tw, th),
    start: start ? { x: start.x, y: start.y } : { x: 100, y: 100 },
  };
}

// Whether the simulation counts pixel (px, py) as solid tile (sim game.js tileSolid).
export function simTileSolid(input, px, py) {
  const { lv, assets, tw, th } = input;
  if (px < 0 || px >= lv.fgW * tw) return true;
  if (py < 0 || py >= lv.fgH * th) return false;
  const tx = Math.floor(px / tw), ty = Math.floor(py / th);
  const tile = assets.foreTile(lv.fgmap[ty * lv.fgW + tx]);
  if (!tile || !tile.mask) return false;
  return tile.mask[(py - ty * th) * tile.w + (px - tx * tw)] === 1;
}
