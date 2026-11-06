// The splash screen, while the level loads (Jared: "add a splash screen like the 2d version had ... but 3d render
// it and add 3D after the word abuse"). WEaBuse shows Abuse's title picture (art/title.spe title_screen: the cop
// in his armour on a dark disc, ABUSE in stone and fire letters) for five seconds before the first level. Here
// the same picture, built in 3D: the letters solid, each of the title's pixels a block of its own colour, with
// "3D" after them in the same stone and fire (their colours taken from the letters' own rows); the cop and his
// disc a relief behind, nearer where the picture is brighter. A slow drift of the camera, firelight flickering
// on the letters, a cold light on the cop, embers rising; Quake's palette and resolution over it all.
// Shown once a session, at least MIN_MS and until the level is loaded; a click or a key skips it.
import { Mesh } from '../engine/mesh.js';
import { ShotFx } from './particles.js';

const MIN_MS = 3200, MAX_MS = 9000;
const LETTERS = { x0: 86, x1: 231, y0: 163, y1: 196 }; // ABUSE in the title picture
const TM = { x0: 232, x1: 245, y0: 155, y1: 170 };
const E0 = 203; // where the E begins
const PICTURE = { x0: 70, x1: 254, y0: 0, y1: 150 }; // the cop on his disc

// "3" and "D", h pixels high, as masks (1 = in), in the letters' own heavy shape
function glyph(ch, h) {
  const w = Math.round(h * 0.72), m = new Uint8Array(w * h);
  const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + 0.5, Y = y + 0.5, t = h * 0.24; // stroke
    let on = false;
    if (ch === 'D') {
      on = (X < t) || (X >= t * 0.8 && inEll(X, Y, t * 0.8, h / 2, w - t * 0.8, h / 2) && !inEll(X, Y, t * 0.8, h / 2, w - t * 1.9, h / 2 - t));
    } else { // 3: a bar along the top, two curves down the right, a short bar in the middle, a bar along the bottom
      const ring = (cy) => X >= w * 0.5 && inEll(X, Y, w * 0.5, cy, w * 0.5, h * 0.27) && !inEll(X, Y, w * 0.5, cy, w * 0.5 - t, h * 0.27 - t * 0.85);
      on = ring(h * 0.27) || ring(h * 0.73)
        || (Y < t * 0.9 && X >= w * 0.06 && X <= w * 0.5) || (Y > h - t * 0.9 && X >= w * 0.06 && X <= w * 0.5)
        || (Math.abs(Y - h / 2) < t * 0.5 && X >= w * 0.3 && X <= w * 0.6);
    }
    m[y * w + x] = on ? 1 : 0;
  }
  return { w, h, m };
}

// the splash's models, built once from the title picture (pixel colours through `palette`, 3 bytes an entry)
function build(im, pal) {
  const rgb = (i) => [pal[i * 3] / 255, pal[i * 3 + 1] / 255, pal[i * 3 + 2] / 255];
  const lum = (i) => pal[i * 3] + pal[i * 3 + 1] + pal[i * 3 + 2];
  const X = (px) => (px - 160) * 2, Z = (py) => (98 - py) * 2; // (the picture's middle at the origin)
  // the letters: a block for each of their pixels, 14 units deep
  const letters = new Mesh(), rows = [];
  for (let y = LETTERS.y0; y <= LETTERS.y1; y++) {
    const row = [];
    for (let x = LETTERS.x0; x <= LETTERS.x1; x++) {
      const i = im.pix[y * im.w + x];
      if (lum(i) < 60) continue;
      row.push(i);
      letters.box([X(x), 0, Z(y)], [1, 7, 1], rgb(i));
    }
    rows.push(row);
  }
  // "3D" after them, in their colours, then the trade mark
  const h = LETTERS.y1 - LETTERS.y0 + 1, gap = 7;
  let x = LETTERS.x1 + gap;
  for (const ch of ['3', 'D']) {
    const gl = glyph(ch, h);
    for (let y = 0; y < gl.h; y++) for (let k = 0; k < gl.w; k++) {
      if (!gl.m[y * gl.w + k]) continue;
      // the E's stone and fire, column by column (where the E has a gap, the nearest of its row)
      let i = im.pix[(LETTERS.y0 + y) * im.w + E0 + (k % (LETTERS.x1 - E0 + 1))];
      if (lum(i) < 60) { const row = rows[y].length ? rows[y] : rows[Math.floor(h / 2)]; i = row[Math.min(row.length - 1, Math.floor((k / gl.w) * row.length))]; }
      letters.box([X(x + k), 0, Z(LETTERS.y0 + y)], [1, 7, 1], rgb(i));
    }
    x += gl.w + 4;
  }
  for (let y = TM.y0; y <= TM.y1; y++) for (let k = TM.x0; k <= TM.x1; k++) {
    const i = im.pix[y * im.w + k];
    if (lum(i) > 120) letters.box([X(x - 2 + (k - TM.x0)), 0, Z(y - 6)], [1, 2, 1], rgb(i));
  }
  // the cop on his disc: a relief behind, in 2 x 2 blocks, nearer where brighter
  const picture = new Mesh();
  for (let y = PICTURE.y0; y < PICTURE.y1; y += 2) for (let x = PICTURE.x0; x < PICTURE.x1; x += 2) {
    let r = 0, g = 0, b = 0, n = 0, l = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = im.pix[(y + dy) * im.w + x + dx]; const c = rgb(i); if (lum(i) < 18) continue; r += c[0]; g += c[1]; b += c[2]; l += lum(i); n++; }
    if (n < 2) continue;
    const near = 4 + (l / n / 765) * 26;
    picture.box([X(x + 0.5), 70 - near / 2, Z(y + 0.5)], [2, near / 2, 2], [r / n, g / n, b / n]);
  }
  return { letters: letters.done(), picture: picture.done(), width: X(x) - X(LETTERS.x0), shift: -(X(LETTERS.x0) + X(x)) / 2 }; // (shift: the whole title, "3D" too, in the middle)
}

const ANGLE = (d) => (d * Math.PI) / 180;

// Runs the splash until `ready` has resolved and at least MIN_MS have passed (or a click or a key).
export function splash(renderer, g, canvas, ready, { forever = false } = {}) {
  const im = g.assets.sprite('art/title.spe', 'title_screen');
  if (!im) return ready;
  const M = build(im, renderer.palette);
  const fx = new ShotFx(7);
  const I3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  let loaded = false, skip = false;
  ready.then(() => { loaded = true; });
  const stop = () => { skip = true; };
  addEventListener('keydown', stop, { once: true });
  canvas.addEventListener('mousedown', stop, { once: true });
  renderer.setAbuseLights([], 34, true);
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = t0;
    const frame = (now) => {
      const t = (now - t0) / 1000;
      if (!forever && ((loaded && (skip || now - t0 > MIN_MS)) || now - t0 > MAX_MS)) {
        removeEventListener('keydown', stop); canvas.removeEventListener('mousedown', stop);
        resolve();
        return;
      }
      const w = Math.floor(canvas.clientWidth * devicePixelRatio), h = Math.floor(canvas.clientHeight * devicePixelRatio);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      // the camera drifts round and in
      // (closer on a narrow screen, a phone's held upright, so the title fills its width)
      const yawOff = 14 * Math.sin(t * 0.55), dist = (640 - 60 * Math.min(1, t / 4)) * Math.min(1, Math.max(0.42, w / h)), lift = -10 + 14 * Math.sin(t * 0.4);
      const eye = [Math.sin(ANGLE(yawOff)) * dist, -Math.cos(ANGLE(yawOff)) * dist, lift];
      const yaw = 90 + yawOff, pitch = (Math.atan2(lift + 20, dist) * 180) / Math.PI;
      const fade = Math.min(1, t / 0.8);
      const flick = 0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 5.3);
      // embers rising off the letters
      if (fx.rnd() < 0.6) fx.burst([(fx.rnd() - 0.5) * M.width + 10, -10, -150 + fx.rnd() * 30], 2, 10, 40, [[1, 0.85, 0.45], [1, 0.5, 0.15], [0.6, 0.15, 0.04]], { life: [0.8, 1.8], size: [0.8, 1.6], grav: 50, drag: 0.6, up: 30 });
      fx.update({ projs: [], entities: [] }, () => [0, 0, 0], () => 0, (now - last) / 1000);
      last = now;
      const parts = fx.draws();
      renderer.frame({ eye, angles: [pitch, yaw, 0] }, w, h, {
        mode: 'abuse', world: false, fovY: (2 * Math.atan(Math.tan(Math.PI / 4) / (w / h)) * 180) / Math.PI,
        sprites: [
          { mesh: M.picture, basis: I3, offset: [M.shift, 0, 0], bright: 0.95 * fade },
          { mesh: M.letters, basis: I3, offset: [M.shift, 0, 0], bright: 1.15 * fade, skin: 0.5, skinKind: 0, skinScale: 1 / 6 },
        ],
        glows: [{ pos: [0, 30, -120], size: 200, rgb: [1, 0.45, 0.12], intensity: 0.22 * flick * fade }, ...parts.glows],
        smoke: parts.smoke,
        dyn: [
          { pos: [0, -70, -130], radius: 420, rgb: [1, 0.55, 0.2], intensity: 1.5 * flick * fade },
          { pos: [-120, 20, 160], radius: 380, rgb: [0.45, 0.6, 1], intensity: 0.9 * fade },
        ],
        eye,
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
