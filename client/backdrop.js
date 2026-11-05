// Where each window looks out (presentation only).
//
// Abuse paints its background only where its camera shows it behind a window: on many levels small patches
// shaped to the windows, the rest of the map black. Scrolled at the level's rate (often 5/8 across and 1:1 up
// and down) that background sits just behind the wall; in 3D it read as painted on the glass. So each window
// is given a far backdrop of its own: the see-through cells that show art are grouped into windows (cells within REACH of each other),
// and each window is anchored where Abuse shows it, at its centre. The renderer puts that picture on a plane far
// behind the wall, seen along the ray from the eye, and keeps the view inside the art Abuse ever shows behind
// that window (mirrored at its edges).
//
// Per foreground cell, three RGBA float texels in a row (cell x * 3 + k):
//   0: the window's centre in 2D pixels (x, y), and the background pixel Abuse shows there (x, y)
//   1: the box of background pixels Abuse ever shows behind the window, out to where its art ends: x0, y0, x1, y1
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
  // the art often goes on past what the camera shows: take the box out to where it turns black
  const artShare = (x0, y0, x1, y1) => {
    let n = 0, a = 0;
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { n++; if (bgPix(x, y) > 30) a++; }
    return n ? a / n : 0;
  };
  const grow = (b) => {
    const S = 6, LIMIT = 400;
    for (let k = 0; k < LIMIT && artShare(b[0] - S, b[1], b[0], b[3]) > 0.9; k += S) b[0] -= S;
    for (let k = 0; k < LIMIT && artShare(b[2], b[1], b[2] + S, b[3]) > 0.9; k += S) b[2] += S;
    for (let k = 0; k < LIMIT && artShare(b[0], b[1] - S, b[2], b[1]) > 0.9; k += S) b[1] -= S;
    for (let k = 0; k < LIMIT && artShare(b[0], b[3], b[2], b[3] + S) > 0.9; k += S) b[3] += S;
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
    grow(box);
    for (const i of cells) put(i, ext, box);
  }
  return { w: fgW * 3, h: fgH, data: out, tile: [tw, th] };
}
