// Turns an Abuse sprite frame (palette pixels, colour 0 transparent) into a 3D
// model: every opaque pixel becomes a column through the lane, as thick as the
// pixel is deep inside the silhouette, so bodies come out rounded and thin
// parts (legs, antennae, gun barrels) stay thin.
//
// Model space is Quake units with the sprite's top-left pixel at the origin:
//   X = 2 * column,  Z = -2 * row,  Y = depth (0 is the lane's centre)
// Each vertex is 9 floats: position (3), normal (3), colour (3, 0-1).
// Only + - * / and comparisons are used, so a model is the same everywhere.

export const SCALE = 2;
const MAX_HALF = 7; // the thickest a column gets: 7 px each side of the lane centre

// Half-thickness (in pixels) of every opaque pixel: grows by 3/4 px per pixel
// of distance from the outline (4-neighbour distance), in half-pixel steps.
export function thickness(img, flip, flat = false) {
  const { w, h } = img;
  const at = (i, j) => img.pix[j * w + (flip ? w - 1 - i : i)];
  const d = new Int32Array(w * h).fill(-1);
  const queue = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!at(i, j)) continue;
      const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1
        || !at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1);
      if (edge) { d[j * w + i] = 1; queue.push(j * w + i); }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % w, j = (k - i) / w;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni;
      if (d[nk] >= 0 || !at(ni, nj)) continue;
      d[nk] = d[k] + 1;
      queue.push(nk);
    }
  }
  const t = new Float32Array(w * h);
  for (let k = 0; k < t.length; k++) {
    if (d[k] < 0) continue;
    t[k] = flat ? MAX_HALF : Math.min(MAX_HALF, Math.round((1 + (d[k] - 1) * 0.75) * 2) / 2);
  }
  return { t, at };
}

// Builds the model. `palette` is 768 bytes (palette.lmp layout). A `flat`
// model is a slab, every column as thick as the thickest (doors, walls, lifts:
// things that are stretched across the whole hall).
export function voxelModel(img, palette, flip = false, flat = false) {
  const { w, h } = img;
  const { t, at } = thickness(img, flip, flat);
  const out = [];
  const S = SCALE;
  const col = (idx) => [palette[idx * 3] / 255, palette[idx * 3 + 1] / 255, palette[idx * 3 + 2] / 255];
  // a quad from four corners (model units), with one normal and colour
  const quad = (a, b, c, d, n, rgb) => {
    for (const v of [a, b, c, a, c, d]) out.push(v[0], v[1], v[2], n[0], n[1], n[2], rgb[0], rgb[1], rgb[2]);
  };

  for (let j = 0; j < h; j++) {
    // front and back faces: runs of pixels with the same colour and thickness
    let i = 0;
    while (i < w) {
      const idx = at(i, j);
      if (!idx) { i++; continue; }
      const th = t[j * w + i];
      let e = i + 1;
      while (e < w && at(e, j) === idx && t[j * w + e] === th) e++;
      const x0 = S * i, x1 = S * e, z0 = -S * j, z1 = -S * (j + 1), y = S * th, rgb = col(idx);
      quad([x0, -y, z0], [x1, -y, z0], [x1, -y, z1], [x0, -y, z1], [0, -1, 0], rgb); // front (toward -Y)
      quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], rgb); // back
      i = e;
    }
    // sides: wherever the neighbour is thinner (or empty), the step between them
    for (let i2 = 0; i2 < w; i2++) {
      const idx = at(i2, j);
      if (!idx) continue;
      const th = t[j * w + i2], rgb = col(idx);
      const x0 = S * i2, x1 = S * (i2 + 1), z0 = -S * j, z1 = -S * (j + 1);
      const side = (ni, nj, make) => {
        const inside = ni >= 0 && nj >= 0 && ni < w && nj < h && at(ni, nj);
        const tn = inside ? t[nj * w + ni] : 0;
        if (tn >= th) return;
        if (tn === 0) make(-S * th, S * th);
        else { make(-S * th, -S * tn); make(S * tn, S * th); }
      };
      side(i2 - 1, j, (ya, yb) => quad([x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0], [-1, 0, 0], rgb));
      side(i2 + 1, j, (ya, yb) => quad([x1, ya, z0], [x1, yb, z0], [x1, yb, z1], [x1, ya, z1], [1, 0, 0], rgb));
      side(i2, j - 1, (ya, yb) => quad([x0, ya, z0], [x0, yb, z0], [x1, yb, z0], [x1, ya, z0], [0, 0, 1], rgb));
      side(i2, j + 1, (ya, yb) => quad([x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1], [0, 0, -1], rgb));
    }
  }
  return { data: new Float32Array(out), count: out.length / 9 };
}

// Models are built once per image, facing and shape.
const cache = new WeakMap();
export function cachedModel(img, palette, flip, flat = false) {
  let set = cache.get(img);
  if (!set) { set = [null, null, null, null]; cache.set(img, set); }
  const k = (flip ? 1 : 0) + (flat ? 2 : 0);
  return (set[k] ??= voxelModel(img, palette, flip, flat));
}

export const MODEL_HALF = SCALE * MAX_HALF; // the deepest a model reaches from its centre, in units
