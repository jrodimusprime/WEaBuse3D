// What the windows look out on (presentation only).
//
// Abuse paints its background only where its camera shows it behind a window: on many levels islands of art
// shaped to the windows, the rest of the map black. Scrolled at the level's rate (often 5/8 across and 1:1 up
// and down) it sits just behind the wall; in 3D it read as painted on the glass, and a window seen at a slant
// looked off the islands into black.
//
// Quake's sky has no such holes: it is one whole picture. So, two parts:
//
// backdropCanvas: one whole picture of the level's background, made from Abuse's own. Every pixel of its art
//   stays where it is; only the empty tiles are filled, by carrying the art on: first along each row (each band
//   of skyline reflected on from its ends, the two sides blended where they meet), then up and down each column
//   (the sky's top row drawn on upwards, the ground's bottom row downwards). The map repeats, as Abuse's does, so it wraps.
//
// windowCells: the see-through cells that show art are grouped into windows (cells within REACH of each other,
//   so the panes either side of a pillar are one window), and each window is anchored on the picture Abuse
//   shows behind it. The renderer puts the canvas on a plane well behind the wall and centres each window's
//   view on its anchor, so in front of a window you see Abuse's art, and walking past it slides by slowly.
//
// windowCells gives per foreground cell three RGBA float texels in a row (cell x * 3 + k):
//   0: the window's centre in 2D pixels (x, y), and the background pixel Abuse shows there (x, y)
//   1: the box of background pixels Abuse ever shows behind the window: x0, y0, x1, y1
//   2: the window's extent in 2D pixels: x0, y0, x1, y1
const REACH = 3; // cells

export function windowCells({ fgW, fgH, fgmap, bgW, bgH, bgmap, rate, tile, back, fore, palette, view = [320, 200] }) {
  const [tw, th] = tile, [bw, bh] = back.size, rx = rate.xmul / (rate.xdiv || 1), ry = rate.ymul / (rate.ydiv || 1);
  const world = [fgW * tw, fgH * th], r = [rx, ry];
  const cam = (p, k) => Math.max(0, Math.min(p - view[k] / 2, world[k] - view[k]));
  const shown = (p, k) => { const c = cam(p, k); return r[k] * c + (p - c); }; // what Abuse shows behind 2D pixel p
  const bgPix = (x, y) => {
    x = Math.floor(x); y = Math.floor(y);
    const t = back.tile(bgmap[((Math.floor(y / bh) % bgH + bgH) % bgH) * bgW + ((Math.floor(x / bw) % bgW) + bgW) % bgW]);
    if (!t) return 0;
    const i = t.pix[(((y % bh) + bh) % bh) * t.w + (((x % bw) + bw) % bw)];
    return palette[i * 4] + palette[i * 4 + 1] + palette[i * 4 + 2];
  };
  // see-through cells: no foreground, or a foreground tile with see-through pixels
  const clear = new Map();
  const seeThrough = (n) => {
    if (!clear.has(n)) { const t = fore(n); clear.set(n, !t || t.pix.some((v) => v === 0)); }
    return clear.get(n);
  };
  const N = fgW * fgH, win = new Uint8Array(N);
  for (let y = 0; y < fgH; y++) for (let x = 0; x < fgW; x++) {
    const i = y * fgW + x;
    if (!seeThrough(fgmap[i])) continue;
    let art = 0; // does Abuse show anything but black behind it?
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const px = x * tw + (sx + 0.5) * tw / 3, py = y * th + (sy + 0.5) * th / 3;
      if (bgPix(shown(px, 0), shown(py, 1)) > 30) art++;
    }
    win[i] = art ? 1 : 0;
  }
  // the box of background Abuse ever shows behind a cell: every camera that has it on screen
  const range = (a0, a1, k) => {
    const lo = Math.max(0, Math.min(a0 - view[k], world[k] - view[k])), hi = Math.max(lo, Math.min(a1, world[k] - view[k]));
    return [r[k] * hi + a0 - hi, r[k] * lo + a1 - lo];
  };
  const out = new Float32Array(fgW * 3 * fgH * 4);
  const put = (i, ext, box) => {
    const x = i % fgW, y = Math.floor(i / fgW), o = (y * fgW * 3 + x * 3) * 4;
    const cx = (ext[0] + ext[2]) / 2, cy = (ext[1] + ext[3]) / 2;
    out.set([cx, cy, shown(cx, 0), shown(cy, 1)], o);
    out.set(box, o + 4);
    out.set(ext, o + 8);
  };
  const comp = new Int32Array(N).fill(-1);
  for (let s = 0; s < N; s++) {
    const x0 = s % fgW, y0 = Math.floor(s / fgW);
    if (!win[s]) { // not a window onto art: its own cell
      const ext = [x0 * tw, y0 * th, (x0 + 1) * tw, (y0 + 1) * th], [a, b] = range(ext[0], ext[2], 0), [c, d] = range(ext[1], ext[3], 1);
      put(s, ext, [a, c, b, d]);
      continue;
    }
    if (comp[s] >= 0) continue;
    const cells = [s], ext = [Infinity, Infinity, -Infinity, -Infinity], box = [Infinity, Infinity, -Infinity, -Infinity];
    comp[s] = s;
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k], x = i % fgW, y = Math.floor(i / fgW);
      ext[0] = Math.min(ext[0], x * tw); ext[1] = Math.min(ext[1], y * th); ext[2] = Math.max(ext[2], (x + 1) * tw); ext[3] = Math.max(ext[3], (y + 1) * th);
      const [a, b] = range(x * tw, (x + 1) * tw, 0), [c, d] = range(y * th, (y + 1) * th, 1);
      box[0] = Math.min(box[0], a); box[1] = Math.min(box[1], c); box[2] = Math.max(box[2], b); box[3] = Math.max(box[3], d);
      // panes either side of a pillar or a mullion look onto the same sky: one window
      for (let ny = y - REACH; ny <= y + REACH; ny++) for (let nx = x - REACH; nx <= x + REACH; nx++) {
        if (nx < 0 || ny < 0 || nx >= fgW || ny >= fgH) continue;
        const j = ny * fgW + nx;
        if (win[j] && comp[j] < 0) { comp[j] = s; cells.push(j); }
      }
    }
    for (const i of cells) put(i, ext, box);
  }
  return { w: fgW * 3, h: fgH, data: out, tile: [tw, th] };
}

const FADE = 48; // px over which the two sides of a filled gap blend (dithered)
const hash = (a, b) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mirror = (d, n) => { const m = d % (2 * n); return m < n ? m : 2 * n - 1 - m; };

// Fills the empty stretches of one line (a row or a column, which wraps) from the art either side of each:
// reflected on from it (rows: a skyline carries on), or its edge drawn on (columns: sky up, ground down).
function fillLine(n, at, pix, has, salt, reflect) {
  let f = -1;
  for (let k = 0; k < n; k++) if (has[at(k)]) { f = k; break; }
  if (f < 0) return [];
  const runs = []; // [start, length, filled], starting at the first filled pixel, going round
  for (let k = 0; k < n;) {
    const full = has[at((f + k) % n)];
    let len = 0;
    while (k + len < n && has[at((f + k + len) % n)] === full) len++;
    runs.push([(f + k) % n, len, full]);
    k += len;
  }
  const done = [];
  runs.forEach(([s, len, full], i) => {
    if (full) return;
    const [ps, pl] = runs[(i - 1 + runs.length) % runs.length], [ns, nl] = runs[(i + 1) % runs.length];
    for (let k = 0; k < len; k++) {
      const dl = k, dr = len - 1 - k;
      const t = Math.max(0, Math.min(1, (dl - dr) / FADE + 0.5));
      const src = hash(s + k, salt) < t ? (ns + (reflect ? mirror(dr, nl) : 0)) % n : (((ps + pl - 1 - (reflect ? mirror(dl, pl) : 0)) % n) + n) % n;
      const o = at((s + k) % n);
      pix[o] = pix[at(src)];
      done.push(o);
    }
  });
  return done;
}

export function backdropCanvas({ bgW, bgH, bgmap, back, palette }) {
  const [bw, bh] = back.size, W = bgW * bw, H = bgH * bh;
  const pix = new Uint8Array(W * H), has = new Uint8Array(W * H);
  const empty = new Map(); // a tile with nothing but black in it is a hole in the art
  for (let ty = 0; ty < bgH; ty++) for (let tx = 0; tx < bgW; tx++) {
    const n = bgmap[ty * bgW + tx], t = back.tile(n);
    if (!t) continue;
    if (!empty.has(n)) empty.set(n, !t.pix.some((i) => palette[i * 4] + palette[i * 4 + 1] + palette[i * 4 + 2] > 30));
    const art = !empty.get(n);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const o = (ty * bh + y) * W + tx * bw + x;
      pix[o] = x < t.w && y < t.h ? t.pix[y * t.w + x] : 0;
      has[o] = art ? 1 : 0;
    }
  }
  // along the rows, then up and down the columns
  const rowsDone = [];
  for (let y = 0; y < H; y++) rowsDone.push(fillLine(W, (x) => y * W + x, pix, has, y, true));
  for (const row of rowsDone) for (const o of row) has[o] = 1;
  for (let x = 0; x < W; x++) fillLine(H, (y) => y * W + x, pix, has, 7919 + x, false);
  return { w: W, h: H, pix };
}
