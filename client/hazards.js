// Level 4's hazards (CLAUDE.md, 3D conversion rules): each designed from its frames (duong.lsp, misc.spe)
// and posed from the simulation's state. Presentation only.
//
//   CONC       a floor mine (mine_ai): a bronze dish on the floor with a domed top, a ring of studs, a
//              plunger and a red light blinking; touched, it blows (its frames: a yellow flash, then white and
//              orange rings spreading out), here a shock ring spreading over the floor where it sat.
//   CONC_AIR   a floating mine (air_mine_ai): a dark iron sphere hanging in the air, a ring of contact horns
//              round it and a red eye blinking (its two frames), bobbing a little.
//   LIGHTIN    a lightning barrier (lightin_ai): a grated plate across the floor of the hall with yellow lamps
//              at its corners; now and then white-blue bolts crackle up from it (its running frames), across
//              the whole hall. It does no damage in the original; it is a barrier you wait out.
import { Mesh, spriteColours, shade } from '../engine/mesh.js';

const I3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const cache = new Map();
const built = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const hash = (a, b) => ((Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503)) >>> 0) % 10007 / 10007;
const progress = (e) => { const n = e.def.states.get(e.state)?.length || 1; return n <= 1 ? 1 : Math.min(1, (Math.floor(e.frame) % n) / (n - 1)); };
const scaled = (k, kz = k) => new Float32Array([k, 0, 0, 0, k, 0, 0, 0, kz]);

function mine(s, ctx) {
  const { e, img } = s;
  const P = built('mine', () => {
    const c = spriteColours(img, ctx.palette);
    const bronze = shade(c.main, 1.05), dark = shade(c.dark, 1.2);
    const m = new Mesh().lathe([0, 0, 0], [[10, 0], [10.5, 1.5], [9, 3.5], [7, 4.5], [0, 4.5]], 16, bronze) // the dish
      .lathe([0, 0, 4.5], [[6.5, 0], [6, 2.5], [4, 4.2], [0, 5]], 14, shade(bronze, 0.8)) // its dome
      .cylinder([0, 0, 9], 1.3, 3, 8, [0.5, 0.5, 0.52]).cylinder([0, 0, 12], 2, 0.8, 8, dark); // the plunger
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; m.cylinder([Math.cos(a) * 8.2, Math.sin(a) * 8.2, 3.4], 0.8, 1.2, 6, dark); } // studs
    return { body: m.done(), led: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 4, 8, [1, 0.15, 0.08]).done(), ring: new Mesh().torus([0, 0, 0], 1, 0.08, 24, 5, [1, 0.75, 0.3]).done(), flash: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 6, 10, [1, 0.95, 0.7]).done() };
  });
  const x = 2 * e.x, d = ctx.depthOf(e), floor = -2 * e.y;
  if (e.state === 'running') { // blowing up: a flash, then a ring of fire spreading over the floor
    const p = progress(e);
    const out = [{ mesh: P.ring, basis: scaled(10 + 60 * p, 10 + 60 * p), offset: [x, d, floor + 2], additive: true, glowAmt: 1.8 * (1 - p) }];
    if (p < 0.35) out.push({ mesh: P.flash, basis: scaled(12 * (1 - p)), offset: [x, d, floor + 8], additive: true, glowAmt: 2 * (1 - p / 0.35) });
    return out;
  }
  const blink = Math.floor(ctx.time / 400 + (e.id || 0)) % 2 === 0;
  return [
    { mesh: P.body, basis: I3, offset: [x, d, floor], skin: 0.7, skinScale: 1 / 4 },
    { mesh: P.led, basis: scaled(1.2), offset: [x + 5.5, d - 3, floor + 6.5], additive: true, glowAmt: blink ? 2 : 0.15 },
  ];
}

function airMine(s, ctx) {
  const { e, img } = s;
  const P = built('airMine', () => {
    const iron = [0.2, 0.2, 0.23], horn = [0.42, 0.42, 0.45];
    const m = new Mesh().ellipsoid([0, 0, 0], [7, 7, 7], 8, 14, iron);
    m.lathe([0, 0, -0.8], [[7.2, 0], [7.2, 1.6]], 16, [0.32, 0.3, 0.28]); // the band round its middle
    for (let i = 0; i < 6; i++) { // contact horns, three above the band and three below, staggered
      const a = (i / 6) * Math.PI * 2, up = i % 2 ? 0.55 : -0.55, c = Math.cos(up);
      const dir = [Math.cos(a) * c, Math.sin(a) * c, Math.sin(up)];
      m.segment(dir.map((v) => v * 6), dir.map((v) => v * 10), 1, 0.6, 6, horn).ellipsoid(dir.map((v) => v * 10.4), [0.9, 0.9, 0.9], 3, 6, horn);
    }
    m.segment([0, 0, 6.5], [0, 0, 10], 0.8, 0.8, 6, horn).segment([0, 0, -6.5], [0, 0, -10], 0.8, 0.8, 6, horn);
    return { body: m.done(), eye: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 5, 10, [1, 0.18, 0.08]).done(), socket: new Mesh().cylinder([0, 0, 0], 3, 1, 12, [0.08, 0.08, 0.09]).done() };
  });
  const x = 2 * e.x, d = ctx.depthOf(e), z = -2 * (e.y - img.h / 2) + 1.5 * Math.sin(ctx.time / 500 + (e.id || 0));
  const lit = Math.floor(e.frame) % 2 === 0;
  const front = new Float32Array([1, 0, 0, 0, 0, 1, 0, -1, 0]); // the eye's socket turned to face the front of the hall
  return [
    { mesh: P.body, basis: I3, offset: [x, d, z], skin: 0.8, skinScale: 1 / 4 },
    { mesh: P.socket, basis: front, offset: [x, d - 6.6, z] },
    { mesh: P.eye, basis: scaled(2.2), offset: [x, d - 7.2, z], additive: true, glowAmt: lit ? 2.2 : 0.4, eggGlow: lit },
  ];
}

function lightning(s, ctx) {
  const { e, img } = s;
  const lane = ctx.lane, W = lane - 8;
  const P = built(`lightin:${lane}`, () => {
    const steel = [0.3, 0.31, 0.33], dark = [0.08, 0.08, 0.09];
    const m = new Mesh().box([0, 0, 2], [24, W, 2], steel); // the plate, across the hall
    for (let y = -W + 10; y < W - 6; y += 12) m.box([0, y, 4.3], [22, 1, 0.4], dark); // its grating
    m.box([0, 0, 4.2], [0.8, W, 0.5], dark);
    const lamp = new Mesh();
    for (const [x, y] of [[-22, -W + 4], [22, -W + 4], [-22, W - 4], [22, W - 4]]) lamp.box([x, y, 5.2], [1.6, 1.6, 1], [1, 0.82, 0.25]);
    return { plate: m.done(), lamps: lamp.done(), bolt: new Mesh().segment([0, 0, 0], [1, 0, 0], 1, 1, 5, [0.75, 0.85, 1]).done(), core: new Mesh().segment([0, 0, 0], [1, 0, 0], 1, 1, 5, [1, 1, 1]).done() };
  });
  const x = 2 * e.x, floor = -2 * e.y;
  const out = [
    { mesh: P.plate, basis: I3, offset: [x, 0, floor], skin: 0.7, skinScale: 1 / 6 },
    { mesh: P.lamps, basis: I3, offset: [x, 0, floor], additive: true, glowAmt: 0.9 },
  ];
  if (e.state === 'running') { // bolts crackling up across the hall, a new shape every frame
    const f = Math.floor(e.frame), fade = 1 - progress(e) * 0.7, H = 2 * Math.max(40, img.h);
    for (let k = 0; k < 5; k++) {
      let p = [x + (hash(f, k) - 0.5) * 20, -W + 20 + ((2 * W - 40) * (k + hash(k, f) * 0.6)) / 5, floor + 4];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const q = [x + (hash(f * 7 + i, k) - 0.5) * 26, p[1] + (hash(i, f * 3 + k) - 0.5) * 18, floor + 4 + (H * (i + 1)) / n];
        const dv = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], l = Math.hypot(...dv);
        const u0 = [0, 0, 1], f0 = dv.map((v) => v / l);
        let a = [u0[1] * f0[2] - u0[2] * f0[1], u0[2] * f0[0] - u0[0] * f0[2], u0[0] * f0[1] - u0[1] * f0[0]];
        const al = Math.hypot(...a) || 1; a = a.map((v) => v / al);
        const b = [f0[1] * a[2] - f0[2] * a[1], f0[2] * a[0] - f0[0] * a[2], f0[0] * a[1] - f0[1] * a[0]];
        for (const [mesh, w, g] of [[P.bolt, 1.6, 1.1], [P.core, 0.6, 2]]) {
          out.push({ mesh, basis: new Float32Array([dv[0], dv[1], dv[2], a[0] * w, a[1] * w, a[2] * w, b[0] * w, b[1] * w, b[2] * w]), offset: p, additive: true, glowAmt: g * fade, lightning: k === 0 && i === 3 });
        }
        p = q;
      }
    }
  }
  return out;
}

export const HAZARDS = { mine_ai: mine, air_mine_ai: airMine, lightin_ai: lightning };
