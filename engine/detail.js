// A skin for models, like the painted skins on Quake's guns (Jared: "quake used simple textures on guns
// to improve their look"). There are no painted skins here, so one is made: a 256x256 greyscale metal
// skin of grain, brushed streaks, panel seams with rivets at their corners, scratches and grime. The
// model shader projects it along the model's own axes (triplanar), so it needs no texture coordinates
// and stays put on the model as it moves; it multiplies the model's colours.
//
// Deterministic: integer hashing and + - * / only, so it is the same everywhere.
export const DETAIL_SIZE = 256;

const hash = (x, y, s) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// smooth value noise on a grid of `cell` pixels, wrapping at the texture's edge
function noise(x, y, cell, seed) {
  const n = DETAIL_SIZE / cell;
  const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const v = (i, j) => hash(((i % n) + n) % n, ((j % n) + n) % n, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx, b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

export function metalSkin() {
  const N = DETAIL_SIZE, out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    const streak = 0.94 + 0.12 * hash(0, y, 7); // brushed: each row a little lighter or darker
    for (let x = 0; x < N; x++) {
      let v = 0.78 + 0.18 * noise(x, y, 32, 1) + 0.1 * noise(x, y, 8, 2) + 0.06 * noise(x, y, 2, 3);
      v *= streak;
      v *= 0.88 + 0.12 * noise(x, y, 64, 4); // grime
      // panel seams every 64 pixels, with a light edge beside the dark line, and rivets at the corners
      const px = x % 64, py = y % 64;
      if (px === 0 || py === 0) v *= 0.5;
      else if (px === 1 || py === 1) v *= 1.12;
      const rx = Math.min(px, 64 - px), ry = Math.min(py, 64 - py);
      if (rx >= 4 && rx <= 7 && ry >= 4 && ry <= 7) v *= (rx - 5.5) ** 2 + (ry - 5.5) ** 2 < 2.2 ? 1.3 : 0.75;
      out[y * N + x] = Math.max(0, Math.min(255, Math.round(v * 200)));
    }
  }
  // scratches: short bright diagonal strokes
  for (let k = 0; k < 90; k++) {
    let x = Math.floor(hash(k, 1, 9) * N), y = Math.floor(hash(k, 2, 9) * N);
    const len = 6 + Math.floor(hash(k, 3, 9) * 22), dx = hash(k, 4, 9) < 0.5 ? 1 : -1;
    for (let i = 0; i < len; i++, x += dx, y++) {
      const o = (((y % N) + N) % N) * N + (((x % N) + N) % N);
      out[o] = Math.min(255, out[o] + 40);
    }
  }
  return out;
}

// An organic skin for creatures: armour plates with dark seams between them (cellular noise: the gap
// between the nearest and second-nearest centre of a coarse grid), fine pores inside the plates (the same
// on a fine grid), ribbed striations across them, mottled, with a fine grain.
function cells(x, y, C, seed) {
  const N = DETAIL_SIZE, n = N / C, ci = Math.floor(x / C), cj = Math.floor(y / C);
  let d1 = Infinity, d2 = Infinity;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, j = cj + dj, ii = ((i % n) + n) % n, jj = ((j % n) + n) % n;
    const cx = i * C + hash(ii, jj, seed) * C, cy = j * C + hash(ii, jj, seed + 1) * C;
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return { d1, d2 };
}
export function organicSkin() {
  const N = DETAIL_SIZE, out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const big = cells(x, y, 32, 21), fine = cells(x, y, 8, 31);
      const seam = Math.min(1, (big.d2 - big.d1) / 4); // 0 on a seam between plates
      const pore = Math.min(1, (fine.d2 - fine.d1) / 1.6);
      const dome = 1 - (big.d1 / 32) * 0.35; // plates rise in the middle
      const ribs = 0.9 + 0.1 * Math.sin((y + 6 * noise(x, y, 32, 41)) * 0.9); // ribbed striations
      let v = (0.35 + 0.65 * seam) * (0.86 + 0.14 * pore) * dome * ribs;
      v *= 0.84 + 0.22 * noise(x, y, 64, 23) + 0.06 * noise(x, y, 4, 24);
      out[y * N + x] = Math.max(0, Math.min(255, Math.round(v * 215)));
    }
  }
  return out;
}

// Muscle: sinew for the box-art creature (Jared's reference: Abuse's cover). Long fibres running along X
// (dark grooves between them, wavering), bundles, a mottled sheen, dark grime blotches and dirt specks. Laid on unit bone meshes, the
// fibres run along each limb.
export function muscleSkin() {
  const N = DETAIL_SIZE, out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const wy = y + 6 * noise(x, y, 64, 51) + 2 * noise(x, y, 16, 52); // fibres waver
      const fibre = 0.5 + 0.5 * Math.cos(wy * 0.85); // thin fibres
      const bundle = 0.5 + 0.5 * Math.cos(wy * 0.12 + noise(x, y, 64, 53) * 3); // bundles of them
      let v = 0.4 + 0.3 * fibre * fibre + 0.3 * bundle; // deeper grooves between the fibres
      v *= 0.8 + 0.25 * noise(x, y, 32, 54) + 0.06 * noise(x, y, 4, 55);
      // grime: dark blotches, and dirt specks
      const blot = noise(x, y, 32, 56) * 0.6 + noise(x, y, 8, 57) * 0.4;
      if (blot > 0.58) v *= 1 - Math.min(0.55, (blot - 0.58) * 2.6);
      if (hash(x, y, 58) > 0.965) v *= 0.45;
      out[y * N + x] = Math.max(0, Math.min(255, Math.round(v * 220)));
    }
  }
  return out;
}
