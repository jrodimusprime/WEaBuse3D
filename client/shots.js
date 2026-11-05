// What flies, in 3D (presentation only), in place of the 2D game's pixel art for its shots (Jared: "the gun
// effects are too pixel art and should be better quality like quakes weapons in terms of lighting, rockets
// and grenade styles"). Each shot gets a designed model along its course through the hall, and what burns or
// glows is drawn additive (it lights what is behind it); client/particles.js adds the trails and bursts and
// client/atmosphere.js the light they throw on the room.
//   rocket   Abuse's missile (art/missle.spe): a grey body, a red nose, four fins, its exhaust burning
//   grenade  a dark green egg with ribs and a band, tumbling as it flies
//   disc     the death frisbee: a silver disc with a glowing blue rim, spinning flat
//   beam     plasma: a pink line, bright at its core, fading over its five ticks (pgun_draw); the light saber's
//            blade: white with a blue-grey edge (lsaber_draw)
//   plasma, acid, spark (enemies' bolts): a glowing ball of their colour
// Bullets are drawn as tracers (client/place.js).
import { Mesh } from '../engine/mesh.js';

const cache = new Map();
const built = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// a basis turning model +X along `f`, scaled by k (column-major)
function along(f, k = 1, spin = 0) {
  f = norm(f);
  const u0 = Math.abs(f[2]) < 0.95 ? [0, 0, 1] : [0, 1, 0];
  let s = norm(cross(u0, f)), u = cross(f, s);
  if (spin) { const c = Math.cos(spin), n = Math.sin(spin); [s, u] = [s.map((v, i) => v * c + u[i] * n), u.map((v, i) => -s[i] * n + v * c)]; }
  return new Float32Array([f[0] * k, f[1] * k, f[2] * k, s[0] * k, s[1] * k, s[2] * k, u[0] * k, u[1] * k, u[2] * k]);
}

const rocketMesh = () => built('rocket', () => {
  const m = new Mesh().cylinderX([-7, 0, 0], 1.7, 11, 12, [0.42, 0.43, 0.45]) // the body
    .segment([4, 0, 0], [8.5, 0, 0], 1.7, 0.2, 12, [0.7, 0.12, 0.08]) // the red nose
    .cylinderX([1, 0, 0], 1.75, 0.8, 12, [0.15, 0.15, 0.16]).cylinderX([-7.6, 0, 0], 1.3, 0.7, 10, [0.15, 0.15, 0.16]); // band, nozzle
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    m.hexa([[-7, c * 1.4, s * 1.4], [-3.5, c * 1.4, s * 1.4], [-3.5, c * 1.4 + 0.01, s * 1.4 + 0.01], [-7, c * 1.4 + 0.01, s * 1.4 + 0.01],
      [-7.5, c * 3.6 - s * 0.25, s * 3.6 + c * 0.25], [-5.5, c * 3.6 - s * 0.25, s * 3.6 + c * 0.25], [-5.5, c * 3.6 + s * 0.25, s * 3.6 - c * 0.25], [-7.5, c * 3.6 + s * 0.25, s * 3.6 - c * 0.25]], [0.3, 0.3, 0.32]);
  }
  return m.done();
});
const flameMesh = () => built('flame', () => new Mesh().segment([-7.8, 0, 0], [-13, 0, 0], 1.3, 0.2, 10, [1, 0.6, 0.2]).ellipsoid([-8.4, 0, 0], [1.2, 1.2, 1.2], 4, 8, [1, 0.9, 0.6]).done());
const grenadeMesh = () => built('grenade', () => {
  const m = new Mesh().ellipsoid([0, 0, 0], [3.2, 2.4, 2.4], 6, 12, [0.22, 0.3, 0.16]);
  for (const x of [-1.6, 0, 1.6]) m.cylinderX([x - 0.25, 0, 0], 2.45, 0.5, 12, [0.13, 0.17, 0.09]); // ribs
  return m.cylinderX([2.6, 0, 0], 1, 1.2, 8, [0.4, 0.4, 0.42]).cylinderX([-0.5, 0, 0], 2.5, 0.5, 12, [0.7, 0.55, 0.15]).done(); // fuse cap, band
});
const discMesh = () => built('disc', () => new Mesh().lathe([0, 0, 0], [[0, -0.6], [4.6, -0.4], [5.2, 0], [4.6, 0.4], [0, 0.7]], 18, [0.66, 0.68, 0.72]).cylinder([0, 0, 0.5], 1.5, 0.4, 10, [0.15, 0.15, 0.17]).done());
const discRim = () => built('discRim', () => new Mesh().torus([0, 0, 0], 5.2, 0.55, 20, 4, [0.45, 0.75, 1]).done());
const beamMesh = (rgb) => built(`beam:${rgb}`, () => new Mesh().cylinderX([0, 0, 0], 1, 1, 8, rgb).done());
const ballMesh = (rgb) => built(`ball:${rgb}`, () => new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 5, 10, rgb).done());

// The parts for every shot in flight. at(b, x, y): the shot's 3D position at plane point (x, y) on its course.
export function shotParts(g, at, time) {
  const out = [];
  const t = time / 1000;
  for (const b of g.projs) {
    if (b.dead) continue;
    const p = at(b, b.x, b.y);
    if (b.kind === 'rocket') {
      const q = at(b, b.px ?? b.x, b.py ?? b.y);
      let f = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
      if (Math.hypot(...f) < 0.5) f = [b.vx || 1, 0, -(b.vy || 0)];
      const B = along(f, 1.1, t * 8);
      out.push({ mesh: rocketMesh(), basis: B, offset: p, skin: 0.7, skinScale: 1 / 4 });
      out.push({ mesh: flameMesh(), basis: along(f, 1.1 * (0.85 + 0.3 * Math.sin(t * 60 + p[0]))), offset: p, additive: true, glowAmt: 2.2 });
    } else if (b.kind === 'grenade') {
      const f = [b.vx || 1, Math.sin(t * 3) * 0.5, -(b.vy || 0)];
      out.push({ mesh: grenadeMesh(), basis: along(f, 1, t * 11 * (b.dir || 1)), offset: p, skin: 0.6, skinScale: 1 / 3 });
    } else if (b.kind === 'disc') {
      const spin = t * 25, c = Math.cos(spin), s = Math.sin(spin);
      const B = new Float32Array([c, s, 0, -s, c, 0, 0, 0, 1]); // flat, spinning
      out.push({ mesh: discMesh(), basis: B, offset: p, skin: 0.6, skinScale: 1 / 3 });
      out.push({ mesh: discRim(), basis: B, offset: p, additive: true, glowAmt: 1.8 });
    } else if (b.kind === 'beam' && !b.pending) {
      const a = at(b, b.ox, b.oy), d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], len = Math.hypot(...d);
      if (len < 1) continue;
      const fade = b.style === 'plasma' ? Math.max(0.15, (b.life || 1) / 5) : 1;
      const rgbs = b.style === 'plasma' ? [[1, 0.45, 1], [1, 0.9, 1]] : [[0.6, 0.65, 1], [1, 1, 1]];
      const widths = b.style === 'plasma' ? [2.2, 0.8] : [1.8, 0.7];
      for (let k = 0; k < 2; k++) {
        const B = along(d, 1);
        const f = norm(d), w = widths[k];
        // stretch: X by the length, the other two by the width
        out.push({ mesh: beamMesh(rgbs[k]), basis: new Float32Array([f[0] * len, f[1] * len, f[2] * len, B[3] * w, B[4] * w, B[5] * w, B[6] * w, B[7] * w, B[8] * w]), offset: a, additive: true, glowAmt: (k ? 2.4 : 1.4) * fade });
      }
    } else if (b.kind === 'plasma' || b.kind === 'acid' || b.kind === 'spark') {
      const rgb = b.kind === 'acid' ? [0.5, 1, 0.35] : b.kind === 'spark' ? [1, 0.6, 0.25] : [0.5, 0.85, 1];
      const k = b.big || b.kind === 'acid' ? 3 : 2.2;
      out.push({ mesh: ballMesh(rgb), basis: new Float32Array([k, 0, 0, 0, k, 0, 0, 0, k]), offset: p, additive: true, glowAmt: 2 });
      out.push({ mesh: ballMesh([1, 1, 1]), basis: new Float32Array([k * 0.45, 0, 0, 0, k * 0.45, 0, 0, 0, k * 0.45]), offset: p, additive: true, glowAmt: 2 });
    }
  }
  return out;
}

// the kinds drawn here (scene.js leaves them out of the 2D drawing it records)
export const SHOT_KINDS = new Set(['rocket', 'grenade', 'disc', 'beam', 'firebomb', 'plasma', 'acid', 'spark']);
