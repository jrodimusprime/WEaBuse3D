// Level 2's machines and its robot (CLAUDE.md, 3D conversion rules): each one designed from its frames
// (art/jug.spe, gun2.spe, rob1.spe, chars/push.spe, chars/step.spe, chars/block.spe, misc.spe, bold.spe)
// and posed from the simulation's state. Presentation only.
//
//   JUGGER     a hulking walker: an olive armoured carapace hunched over a low head with a red visor slit,
//              a cannon arm and a grenade-drum arm glowing orange, thick legs on blue-black feet; it walks
//              (12 frames), heaves up its arms to throw, and bursts apart when it dies.
//   TRACK_GUN  an armoured ball hung from the ceiling: its shells part (opening) to show a core with a gun
//              pod running round a ring, aimed at the player; it flares as it fires.
//   ROB1       "the cleaner": a sweeper as wide as the hall (it shoves the player along in front of it):
//              a stone-grey armoured hull on track housings at the walls, a rotor drum across the hall
//              bristling with gold claws that spin as it trundles, a ribbed intake and an amber beacon.
//   PUSHER     a force field over a pit: emitter pylons at both side walls and a band of glowing chevrons
//              across the hall, running the way it pushes.
//   STEP       a steel step as wide as the hall: it slides out of the back wall when its link turns on.
//   BLOCK      ribbed steel blocks across the hall; shot apart they burst and tumble, shedding rust.
//   INDICATOR  a lamp on the back wall, red until its link turns on, then green; it lights the wall.
//   BOLDER     a spiked iron roller as wide as the hall (it hits the player anywhere across it): banded,
//              its spikes in staggered rows, turning as it rolls.
import { Mesh, spriteColours, shade } from '../engine/mesh.js';

const I3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const cache = new Map();
const built = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const hash = (a, b) => ((Math.imul(a + 1, 2654435761) ^ Math.imul(b + 3, 40503)) >>> 0) % 10007 / 10007;
const progress = (e) => { const n = e.def.states.get(e.state)?.length || 1; return n <= 1 ? 1 : Math.min(1, ((Math.floor(e.frame) % n) + 1) / n); };
// a basis laying a mesh built along X across the hall instead (X -> Y), turned about that axis by a
const acrossHall = (a) => new Float32Array([0, 1, 0, Math.cos(a), 0, Math.sin(a), -Math.sin(a), 0, Math.cos(a)]);

// a closed n-sided frustum from a to b, radius r0 at a and r1 at b
function prism(m, a, b, r0, r1, rgb, n = 6) {
  const f = norm(sub(b, a)), u0 = Math.abs(f[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(f, u0)), w = cross(f, u);
  const ring = (p, r, i) => { const t = (i / n) * Math.PI * 2; return add(p, add(mul(u, r * Math.cos(t)), mul(w, r * Math.sin(t)))); };
  return m.inside(mul(add(a, b), 0.5), () => {
    for (let i = 0; i < n; i++) {
      m.quad(ring(a, r0, i), ring(b, r1, i), ring(b, r1, i + 1), ring(a, r0, i + 1), rgb);
      if (r0 > 0) m.tri(a, ring(a, r0, i), ring(a, r0, i + 1), rgb);
      if (r1 > 0) m.tri(b, ring(b, r1, i + 1), ring(b, r1, i), rgb);
    }
  });
}
// a unit bone (along +X from 0 to 1, radius 1 tapering to `tip`), posed by boneBasis
const boneMesh = (rgb, tip = 0.8, n = 6) => prism(new Mesh(), [0, 0, 0], [1, 0, 0], 1, tip, rgb, n).done();
function boneBasis(a, b, r) {
  const d = sub(b, a), f = norm(d), u0 = Math.abs(f[2]) < 0.95 ? [0, 0, 1] : [1, 0, 0];
  const p1 = norm(cross(u0, f)), p2 = cross(f, p1);
  return [d, mul(p1, r), mul(p2, r)];
}
// two-bone IK in the plane of the limb: the knee/elbow, bent towards `bend`
function solve(root, end, l1, l2, bend) {
  const d = sub(end, root), dist = Math.max(1e-3, Math.min(len(d), l1 + l2 - 0.01)), f = norm(d);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const side = norm(sub(bend, mul(f, bend[0] * f[0] + bend[1] * f[1] + bend[2] * f[2])));
  return add(add(root, mul(f, a)), mul(side, h));
}

// ---- JUGGER (jugger.lsp jug_ai) ----
const JUG = { armour: [0.15, 0.19, 0.1], plate: [0.2, 0.25, 0.13], dark: [0.05, 0.06, 0.05], joint: [0.1, 0.11, 0.1], foot: [0.09, 0.11, 0.17], metal: [0.27, 0.28, 0.27], glow: [1, 0.55, 0.15], visor: [1, 0.16, 0.08] };
function jugKit() {
  return built('jug', () => ({
    limb: boneMesh(JUG.armour, 0.8), thin: boneMesh(JUG.joint, 0.9), piston: boneMesh(JUG.metal, 1, 5),
    ball: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 5, 8, JUG.joint).done(),
    shell: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 6, 10, JUG.armour).done(),
    plate: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 4, 8, JUG.plate).done(),
    foot: new Mesh().hexa([[-9, -7, 0], [13, -7, 0], [13, 7, 0], [-9, 7, 0], [-6, -6, 7], [7, -5, 5], [7, 5, 5], [-6, 6, 7]], JUG.foot)
      .box([14, -4.5, 2], [2.5, 2, 2], JUG.dark).box([14, 4.5, 2], [2.5, 2, 2], JUG.dark).done(), // the foot, its two toes
    head: new Mesh().hexa([[-10, -11, -8], [13, -8, -6], [13, 8, -6], [-10, 11, -8], [-9, -10, 6], [10, -7, 4], [10, 7, 4], [-9, 10, 6]], JUG.plate)
      .box([2, 0, 6.5], [8, 3, 1.5], JUG.dark).done(), // a heavy brow ridge
    visor: new Mesh().box([0, 0, 0], [1, 7, 1.2], JUG.visor).done(),
    cannon: new Mesh().cylinderX([0, 0, 0], 5, 22, 8, JUG.dark).cylinderX([4, 0, 0], 6.5, 8, 8, JUG.metal).box([10, 0, 6], [6, 2, 2.5], JUG.dark).done(),
    drum: new Mesh().cylinderX([0, 0, 0], 8, 12, 10, JUG.metal).cylinderX([12, 0, 0], 3.5, 8, 8, JUG.dark).done(),
    stack: new Mesh().cylinder([0, 0, 0], 3, 14, 8, JUG.dark).torus([0, 0, 12], 3.4, 1, 8, 4, JUG.metal).done(),
    glow: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 4, 8, JUG.glow).done(),
  }));
}
function jugger(s, ctx) {
  const { e, img } = s;
  const K = jugKit(), t = ctx.time / 1000, out = [];
  const n = e.def.states.get(e.state)?.length || 1, fr = (Math.floor(e.frame) % n) / n;
  const ox = s.flip ? img.w - img.xcfg - 1 : img.xcfg;
  const ax = 2 * (s.x + ox), feet = -2 * (s.y + img.h - 1), d = ctx.depthOf(e);
  // facing: along the hall, turned a little towards the player across it
  const p = ctx.g.player, across = Math.max(-0.5, Math.min(0.5, Math.atan2(ctx.pd - d, Math.max(40, Math.abs(2 * (p.x - e.x))))));
  const yaw = (e.dir > 0 ? 0 : Math.PI) + (e.dir > 0 ? across : -across);
  const dying = e.state === 'dieing' ? progress(e) : 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const W = (v) => [ax + v[0] * cy - v[1] * sy, d + v[0] * sy + v[1] * cy, feet + v[2]];
  const R = (v) => [v[0] * cy - v[1] * sy, v[0] * sy + v[1] * cy, v[2]];
  const bone = (mesh, a, b, r, extra = {}) => { const [X, Y, Z] = boneBasis(a, b, r); out.push({ mesh, basis: new Float32Array([...R(X), ...R(Y), ...R(Z)]), offset: W(a), skin: 0.95, skinScale: 1 / 6, ...extra }); };
  const ball = (mesh, c, r, extra = {}) => out.push({ mesh, basis: new Float32Array([...R([r[0], 0, 0]), ...R([0, r[1], 0]), ...R([0, 0, r[2]])]), offset: W(c), skin: 0.95, skinScale: 1 / 8, ...extra });
  const at = (mesh, c, extra = {}) => out.push({ mesh, basis: new Float32Array([cy, sy, 0, -sy, cy, 0, 0, 0, 1]), offset: W(c), skin: 0.95, skinScale: 1 / 12, ...extra });
  const glowAt = (c, r, amt) => out.push({ mesh: K.glow, basis: new Float32Array([r, 0, 0, 0, r, 0, 0, 0, r]), offset: W(c), additive: true, glowAmt: amt });

  // the pose: walking (running, 12 frames), heaving up to throw (weapon_fire), standing
  const walking = e.state === 'running', throwing = e.state === 'weapon_fire' ? Math.sin(fr * Math.PI) : 0;
  const ph = fr * Math.PI * 2, bob = walking ? Math.abs(Math.sin(ph)) * 2.5 : 0;
  const hip = [-4, 0, 42 - bob * 0.5], chest = [4, 0, 62 + bob - throwing * 3];
  // legs: thick, knees forward, big feet planted by IK
  for (const side of [-1, 1]) {
    const k = side > 0 ? 0 : Math.PI;
    const stride = walking ? 14 * Math.sin(ph + k) : 0, lift = walking ? Math.max(0, Math.cos(ph + k)) * 7 : 0;
    const hipJ = add(hip, [0, side * 16, -2]), foot = [stride + 2, side * 19, lift];
    const knee = solve(hipJ, add(foot, [0, 0, 8]), 23, 25, [1, side * 0.2, 0.3]);
    ball(K.ball, hipJ, [8, 8, 8]);
    bone(K.limb, hipJ, knee, 9);
    ball(K.plate, add(knee, [3, 0, 1]), [7, 7.5, 7]); // knee guard
    bone(K.limb, knee, add(foot, [0, 0, 8]), 7.5);
    bone(K.piston, add(hipJ, [-5, side * 3, -4]), add(foot, [-5, 0, 9]), 2); // a hydraulic ram down the back of the leg
    at(K.foot, foot, { skin: 0.6 });
  }
  // the body: pelvis, a hunched carapace, plates down its back, two exhaust stacks
  ball(K.ball, hip, [12, 14, 8]);
  bone(K.thin, hip, chest, 10);
  ball(K.shell, add(chest, [-2, 0, 4]), [24, 25, 19]);
  ball(K.plate, add(chest, [-8, 0, 20]), [15, 16, 6]); // the ridge
  for (let i = 0; i < 3; i++) ball(K.plate, add(chest, [-16 - i * 4, 0, 14 - i * 6]), [8, 18 - i * 2, 4]); // plates down the back
  for (const side of [-1, 1]) at(K.stack, add(chest, [-16, side * 9, 16]), { skin: 0.4 });
  // the head: low, sunk between the shoulders, a red visor slit
  const neck = add(chest, [22, 0, 2 - throwing * 2]);
  at(K.head, neck);
  out.push({ mesh: K.visor, basis: new Float32Array([...R([1.2, 0, 0]), ...R([0, 1, 0]), ...R([0, 0, 1])]), offset: W(add(neck, [11.6, 0, 0])), bright: 1.8 });
  glowAt(add(neck, [12.5, 0, 0]), 2.2, 0.22 + 0.1 * Math.sin(t * 5));
  // the arms: shoulders under pauldrons; a cannon on the right, a grenade drum on the left. They heave up to throw.
  for (const side of [-1, 1]) {
    const sh = add(chest, [4, side * 25, 6]);
    ball(K.plate, add(sh, [0, side * 3, 6]), [12, 11, 9]); // pauldron
    const swing = walking ? -6 * Math.sin(ph + (side > 0 ? Math.PI : 0)) : 0;
    const hand = add(sh, [20 + swing - throwing * 4, side * 4, -16 + throwing * 26]);
    const elbow = solve(sh, hand, 15, 16, [-0.4, side * 0.6, -0.6]);
    ball(K.ball, sh, [7, 7, 7]);
    bone(K.limb, sh, elbow, 7);
    bone(K.limb, elbow, hand, 6.5);
    const aim = norm([1, 0, -0.15 + throwing * 1.1]), pitch = Math.atan2(aim[2], aim[0]);
    const cp = Math.cos(pitch), spp = Math.sin(pitch);
    const B = (v) => R([v[0] * cp - v[2] * spp, v[1], v[0] * spp + v[2] * cp]);
    const gun = side < 0 ? K.cannon : K.drum, muzzle = add(hand, mul(aim, side < 0 ? 22 : 20));
    out.push({ mesh: gun, basis: new Float32Array([...B([1, 0, 0]), ...B([0, 1, 0]), ...B([0, 0, 1])]), offset: W(add(hand, mul(aim, -4))), skin: 0.7, skinScale: 1 / 8 });
    glowAt(muzzle, 1.8 + 2.4 * throwing, 0.35 + 0.15 * Math.sin(t * 6 + side) + 1.1 * throwing);
  }
  if (!dying) return out;
  // dying: it bursts apart (the frames scatter it in sparks): every part flies out from the middle, falls
  // and dims, with embers
  const mid = W([0, 0, 50]);
  for (const q of out) {
    const v = sub(q.offset, mid), k = 1 + 1.4 * dying;
    q.offset = add(add(mid, mul(v, k)), [0, 0, -30 * dying * dying]);
    q.bright = (q.bright ?? 1) * (1 - 0.6 * dying);
  }
  for (let i = 0; i < 10; i++) {
    const a = hash(e.id ?? 0, i) * Math.PI * 2, r = 20 + 60 * dying * hash(i, 7), up = 40 * Math.sin(dying * Math.PI) * hash(i, 3);
    out.push({ mesh: K.glow, basis: new Float32Array([2, 0, 0, 0, 2, 0, 0, 0, 2]), offset: add(mid, [Math.cos(a) * r, Math.sin(a) * r * 0.6, up - 20 * dying]), additive: true, glowAmt: 1.2 * (1 - dying) });
  }
  return out;
}

// ---- TRACK_GUN (track_ai): hung from the ceiling ----
function hemisphere(R, side, rgb) {
  const m = new Mesh(), rings = 6, segs = 8;
  const pt = (i, j) => { const th = (i / rings) * Math.PI, ph = -Math.PI / 2 + (j / segs) * Math.PI; return [side * R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th)]; };
  m.inside([side * R * 0.4, 0, 0], () => {
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) m.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1), rgb);
    for (let i = 0; i < rings; i++) m.tri([0, 0, 0], pt(i, 0), pt(i + 1, 0), rgb).tri([0, 0, 0], pt(i, segs), pt(i + 1, segs), rgb); // the cut face
  });
  return m.done();
}
function trackGun(s, ctx) {
  const { e, img } = s;
  const R = 27;
  const P = built('trackgun', () => {
    const c = spriteColours(img, ctx.palette);
    const shell = [0, 1, 2].map((k) => 0.25 * shade(c.main, 1.5)[k] + 0.75 * [0.2, 0.23, 0.19][k]), dark = [0.06, 0.07, 0.06], metal = [0.34, 0.36, 0.34]; // the art's dark grey-green
    const seams = new Mesh();
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) { const a = -0.9 + k * 0.9; seams.box([side * R * 0.2, Math.sin(a) * R * 0.98, Math.cos(a) * R * 0.98], [R * 0.18, 0.8, 0.8], dark); }
    return {
      left: hemisphere(R, -1, shell), right: hemisphere(R, 1, shell), seams: seams.done(),
      mount: new Mesh().box([0, 0, 0], [16, 16, 2.5], dark).cylinder([0, 0, -14], 5, 14, 8, metal).torus([0, 0, -12], 6, 1.6, 10, 4, dark).done(),
      core: new Mesh().ellipsoid([0, 0, 0], [R * 0.8, R * 0.8, R * 0.8], 7, 12, shade(shell, 0.7)).done(),
      ring: new Mesh().torus([0, 0, 0], R * 0.86, 2.2, 20, 5, metal).done(), // lies in the plane of the hall (posed below)
      pod: new Mesh().box([0, 0, 0], [5, 6, 6], metal).cylinderX([4, 0, 0], 2, 13, 8, dark).box([17, 0, 0], [1.5, 2.6, 2.6], dark).done(),
      flash: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 4, 8, [1, 0.8, 0.4]).done(),
    };
  });
  const st = e.state;
  const open = st === 'opening' ? progress(e) : st === 'shuting' ? 1 - progress(e) : st === 'stopped' ? 0 : 1;
  const x = 2 * (s.x + img.w / 2), z = -2 * (s.y + img.h / 2), y = ctx.depthOf(e);
  const top = -2 * s.y + 10; // the ceiling over it
  const out = [
    { mesh: P.mount, basis: I3, offset: [x, y, top], skin: 0.7, skinScale: 1 / 10 },
    { mesh: P.mount, basis: new Float32Array([0.6, 0, 0, 0, 0.6, 0, 0, 0, Math.max(0.1, (top - z - R) / 14)]), offset: [x, y, z + R], skin: 0.7, skinScale: 1 / 10 }, // the neck down to the ball
    { mesh: P.left, basis: I3, offset: [x - open * R * 1.05, y, z + open * 4], skin: 0.9, skinScale: 1 / 12 },
    { mesh: P.right, basis: I3, offset: [x + open * R * 1.05, y, z + open * 4], skin: 0.9, skinScale: 1 / 12 },
  ];
  if (open < 0.05) { out.push({ mesh: P.seams, basis: I3, offset: [x, y, z] }); return out; }
  out.push({ mesh: P.core, basis: I3, offset: [x, y, z], skin: 0.7, skinScale: 1 / 12 });
  out.push({ mesh: P.ring, basis: new Float32Array([1, 0, 0, 0, 0, 1, 0, 1, 0]), offset: [x, y, z] }); // the ring stood up in the plane
  // the pod on the ring at the gun's angle (degrees, up positive), its barrel tilted across the hall to the player
  const a = ((e.a?.angle ?? 270) * Math.PI) / 180, p = ctx.g.player;
  const dist = Math.max(40, 2 * Math.sqrt((p.x - e.x) ** 2 + (p.y - e.y) ** 2)), tilt = Math.atan2(ctx.pd - y, dist);
  const F = [Math.cos(a) * Math.cos(tilt), Math.sin(tilt), Math.sin(a) * Math.cos(tilt)];
  const L = norm(cross(Math.abs(F[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], F)), U = cross(F, L);
  const at = [x + Math.cos(a) * R * 0.86 * open, y, z + Math.sin(a) * R * 0.86 * open];
  out.push({ mesh: P.pod, basis: new Float32Array([...F, ...L, ...U]), offset: at, skin: 0.6, skinScale: 1 / 8 });
  if (st === 'firing') out.push({ mesh: P.flash, basis: new Float32Array([5, 0, 0, 0, 5, 0, 0, 0, 5]), offset: add(at, mul(F, 22)), additive: true, glowAmt: 1.6 });
  return out;
}

// ---- ROB1, the cleaner (rob1_ai): a sweeper as wide as the hall ----
function rob1(s, ctx) {
  const { e, img } = s;
  if (e.state === 'rob_hiding') return [];
  const lane = ctx.lane, W = lane - 6;
  const P = built(`rob1:${lane}`, () => {
    const c = spriteColours(img, ctx.palette);
    const stone = [0, 1, 2].map((k) => 0.5 * shade(c.main, 1.4)[k] + 0.5 * [0.36, 0.37, 0.33][k]), moss = [0.26, 0.34, 0.16], dark = [0.08, 0.08, 0.08], steel = [0.45, 0.46, 0.46];
    const gold = [0.85, 0.62, 0.15], goldDark = [0.5, 0.34, 0.08];
    const hull = new Mesh()
      .taper([-10, 0, 14], [56, W - 30], [44, W - 40], 78, stone) // the hull, bevelled up to its roof
      .box([-10, 0, 80], [36, W - 46, 3], shade(stone, 0.8)) // the roof plate
      .box([-60, 0, 46], [6, W - 34, 26], shade(stone, 0.75)); // the back plate
    for (let i = 0; i < 7; i++) hull.box([-34 + i * 8, 0, 84], [2, 26, 3], dark); // the ribbed intake on the roof
    hull.box([-6, 0, 84], [30, 30, 1], dark);
    for (let k = 0; k < 6; k++) hull.ellipsoid([-40 + ((k * 37) % 70), ((k * 53) % 9 - 4) * (W / 6), 50 + ((k * 29) % 20)], [8, 14, 4], 3, 6, moss); // moss and grime on the stone
    for (const sd of [-1, 1]) {
      hull.box([-8, sd * (W - 16), 22], [62, 16, 22], shade(stone, 0.7)) // track housings at the walls
        .box([-8, sd * (W - 16), 3], [60, 15, 4], dark); // the tracks
      for (let i = 0; i < 6; i++) hull.box([-58 + i * 20, sd * (W - 16) - sd * 16.5, 12], [6, 1, 6], steel); // road-wheel hubs
      hull.cylinder([-30, sd * (W - 30), 82], 4, 18, 8, dark); // exhaust stacks
    }
    // the rotor: a drum across the hall, with rows of gold claws round it
    const drum = new Mesh().cylinderX([-W, 0, 0], 20, 2 * W, 12, steel);
    for (let r = 0; r < 6; r++) {
      const ang = (r / 6) * Math.PI * 2;
      for (let i = 0; i < 7; i++) {
        const yy = -W + 20 + i * ((2 * W - 40) / 6) + (r % 2) * 10;
        // a hooked claw: out from the drum, then curling back (two prisms)
        const base = [yy, Math.cos(ang) * 19, Math.sin(ang) * 19];
        const out1 = [yy, Math.cos(ang) * 34, Math.sin(ang) * 34], tip = [yy, Math.cos(ang + 0.5) * 40, Math.sin(ang + 0.5) * 40];
        prism(drum, base, out1, 4, 3, gold, 4);
        prism(drum, out1, tip, 3, 0.4, goldDark, 4);
      }
    }
    for (const sd of [-1, 1]) drum.cylinderX([sd > 0 ? W - 6 : -W - 4, 0, 0], 26, 10, 12, dark); // the drum's end discs
    return {
      hull: hull.done(), drum: drum.done(),
      arms: new Mesh().box([0, W - 16, 0], [30, 6, 8], dark).box([0, -(W - 16), 0], [30, 6, 8], dark).done(),
      beacon: new Mesh().ellipsoid([0, 0, 0], [5, 5, 4], 4, 8, [1, 0.6, 0.12]).done(),
    };
  });
  const dir = e.dir > 0 ? 1 : -1, t = ctx.time / 1000;
  const cx = 2 * (s.x + img.w / 2), floor = -2 * (s.y + img.h - 1);
  const flip = new Float32Array([dir, 0, 0, 0, 1, 0, 0, 0, 1]);
  const going = e.aistate === 1, rise = e.fade > 0 ? -e.fade * 5 : 0;
  const drumAt = [cx + dir * 62, 0, floor + 34 + rise];
  const spin = going ? -dir * t * 7 : 0;
  return [
    { mesh: P.hull, basis: flip, offset: [cx, 0, floor + rise], skin: 0.85, skinScale: 1 / 16 },
    { mesh: P.arms, basis: flip, offset: [cx + dir * 40, 0, floor + 34 + rise], skin: 0.6, skinScale: 1 / 10 },
    { mesh: P.drum, basis: acrossHall(spin), offset: drumAt, skin: 0.7, skinScale: 1 / 10 },
    { mesh: P.beacon, basis: I3, offset: [cx - dir * 20, 0, floor + 92 + rise], bright: going ? 1.6 + 0.8 * Math.sin(t * 8) : 0.8 },
  ];
}

// ---- PUSHER (pusher_ai): a force field over a pit ----
function pusher(s, ctx) {
  const { e, img } = s;
  const lane = ctx.lane;
  const P = built(`pusher:${lane}`, () => {
    const frame = [0.2, 0.22, 0.26], dark = [0.07, 0.08, 0.1], lit = [0.3, 0.42, 0.85];
    const pylons = new Mesh();
    for (const sd of [-1, 1]) {
      pylons.box([0, sd * (lane - 5), 0], [img.w + 4, 5, img.h + 5], frame) // the emitter along the wall
        .box([0, sd * (lane - 10.5), 0], [img.w, 1, img.h - 1], dark); // its slot
    }
    // a chevron row across the hall: one chevron every 40 units, each two struts meeting at a point
    const row = new Mesh();
    for (let y = -lane + 30; y <= lane - 30; y += 40) {
      prism(row, [-6, y - 9, 0], [5, y, 0], 2.2, 2.2, lit, 4);
      prism(row, [-6, y + 9, 0], [5, y, 0], 2.2, 2.2, lit, 4);
    }
    return { pylons: pylons.done(), row: row.done(), slotGlow: new Mesh().box([0, 0, 0], [1, 1, 1], lit).done() };
  });
  const x = 2 * (s.x + img.w / 2), z = -2 * (s.y + img.h / 2), half = img.w, t = ctx.time / 1000;
  const on = !e.links.length || e.links[0].aistate !== 0, dir = e.dir > 0 ? 1 : -1;
  const out = [{ mesh: P.pylons, basis: I3, offset: [x, 0, z], skin: 0.7, skinScale: 1 / 10 }];
  if (!on) return out;
  for (const sd of [-1, 1]) out.push({ mesh: P.slotGlow, basis: new Float32Array([img.w, 0, 0, 0, 1, 0, 0, 0, img.h - 1]), offset: [x, sd * (lane - 11), z], additive: true, glowAmt: 0.3 });
  // the chevrons run the way it pushes, brightest in a pulse that travels along (as the frames do)
  const gap = 21, shift = ((t * 60) % gap) * dir;
  for (let k = -4; k <= 4; k++) {
    const cx = k * gap + shift;
    if (Math.abs(cx) > half - 4) continue;
    const pulse = 0.5 + 0.5 * Math.cos((cx * dir) / 18 - t * 9);
    const fade = 1 - Math.abs(cx) / half;
    out.push({ mesh: P.row, basis: new Float32Array([dir, 0, 0, 0, 1, 0, 0, 0, 1]), offset: [x + cx, 0, z], additive: true, glowAmt: (0.1 + 0.4 * pulse) * fade });
  }
  return out;
}

// ---- STEP (step_ai): a steel step as wide as the hall ----
function step(s, ctx) {
  const { e, img } = s;
  const lane = ctx.lane;
  const P = built(`step:${lane}:${img.w}`, () => {
    const c = spriteColours(img, ctx.palette);
    const steel = [0, 1, 2].map((k) => 0.5 * shade(c.main, 1.3)[k] + 0.5 * [0.36, 0.37, 0.4][k]), dark = [0.1, 0.1, 0.11], hazard = [0.85, 0.66, 0.12];
    const m = new Mesh()
      .box([0, 0, -6], [img.w, lane, 6], steel) // the tread
      .box([-img.w + 6, 0, -img.h + 3], [6, lane, img.h - 9], shade(steel, 0.8)); // its riser at the near end
    for (let i = 0; i < 9; i++) m.box([-img.w + 14 + i * 11, 0, 0.6], [1.5, lane - 4, 0.8], dark); // grip ribs
    for (let k = 0; k < 8; k++) m.box([img.w - 2, -lane + 20 + k * 40, -6], [2.2, 9, 6.2], k % 2 ? dark : hazard); // the hazard edge
    for (const y of [-lane * 0.5, 0, lane * 0.5]) m.taper([-img.w + 20, y, -30], [8, 6], [16, 6], -12, dark); // brackets under it
    return m.done();
  });
  const x = 2 * (s.x + img.w / 2), top = -2 * s.y;
  // it slides out of the back wall when its link turns on (stopped: there, solid; running: in the wall)
  const k = Math.min(1, (e.stateTime || 0) / 5), out = e.state === 'stopped' ? k : 1 - k;
  if (out <= 0) return [];
  return [{ mesh: P, basis: I3, offset: [x, 2 * lane * (1 - out), top], skin: 0.8, skinScale: 1 / 14 }];
}

// ---- BLOCK (block_ai): ribbed steel blocks across the hall ----
function block(s, ctx) {
  const { e, img } = s;
  const lane = ctx.lane, n = 6, deep = (2 * lane) / n;
  const P = built(`block:${lane}`, () => {
    const base = spriteColours(img, ctx.palette);
    const steel = [0, 1, 2].map((k) => 0.5 * shade(base.main, 1.3)[k] + 0.5 * [0.3, 0.34, 0.42][k]), dark = [0.08, 0.09, 0.12];
    const cube = new Mesh().box([0, 0, 0], [26, deep / 2 - 3, 21], steel);
    for (let i = 0; i < 7; i++) cube.box([-21 + i * 7, -deep / 2 + 2.5, 0], [1.8, 1.2, 19], dark).box([-21 + i * 7, deep / 2 - 2.5, 0], [1.8, 1.2, 19], dark).box([-26.5, -deep / 2 + 6 + i * ((deep - 12) / 6), 0], [1.2, 1.8, 19], dark).box([26.5, -deep / 2 + 6 + i * ((deep - 12) / 6), 0], [1.2, 1.8, 19], dark); // ribs on its faces
    cube.box([0, 0, 21.5], [24, deep / 2 - 3, 1], shade(steel, 1.15)).box([0, 0, -21.5], [24, deep / 2 - 3, 1], shade(steel, 0.7));
    return { cube: cube.done(), rust: new Mesh().box([0, 0, 0], [2.5, 2.5, 2.5], [0.42, 0.12, 0.08]).done() };
  });
  const x = 2 * (s.x + img.w / 2), z = -2 * (s.y + img.h / 2);
  const dying = e.state === 'dieing' ? progress(e) : 0, id = e.id ?? 0, out = [];
  for (let k = 0; k < n; k++) {
    const y = -lane + deep * (k + 0.5);
    if (!dying) { out.push({ mesh: P.cube, basis: I3, offset: [x, y, z], skin: 0.75, skinScale: 1 / 12 }); continue; }
    // shot apart: each block bursts out its own way, tumbling and falling, shedding rust
    const h1 = hash(id, k), h2 = hash(k, id + 9), a = dying * (2 + 4 * h1);
    const R = new Float32Array([Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)].map((v) => v * (1 - 0.5 * dying)));
    out.push({ mesh: P.cube, basis: R, offset: [x + (h1 - 0.5) * 70 * dying, y + (h2 - 0.5) * 30 * dying, z + 30 * dying - 70 * dying * dying], skin: 0.75, skinScale: 1 / 12, bright: 1 - 0.5 * dying });
    for (let j = 0; j < 3; j++) out.push({ mesh: P.rust, basis: I3, offset: [x + (hash(k, j) - 0.5) * 90 * dying, y + (hash(j, k) - 0.5) * deep, z + 20 * dying - 90 * dying * dying * hash(j + 3, k)] });
  }
  return out;
}

// ---- INDICATOR (indicator_ai): a lamp on the back wall ----
function indicator(s, ctx) {
  const { e, img } = s;
  const P = built('indicator', () => ({
    housing: new Mesh().box([0, 0, 0], [img.w + 2, 5, img.h + 2], [0.24, 0.25, 0.27]).box([0, -5.5, 0], [img.w - 1, 0.8, img.h - 1], [0.06, 0.06, 0.07]).done(),
    red: new Mesh().box([0, 0, 0], [img.w - 3, 1.5, img.h - 3], [0.62, 0.1, 0.06]).done(),
    green: new Mesh().box([0, 0, 0], [img.w - 3, 1.5, img.h - 3], [0.4, 0.49, 0.43]).done(), // the Quake palette's greens are grey-greens (177-184): its palest, lit
    halo: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 4, 8, [1, 1, 1]).done(),
  }));
  const on = e.state === 'on_state', wall = ctx.lane - 5;
  const x = 2 * (s.x + img.w / 2), z = -2 * (s.y + img.h / 2), t = ctx.time / 1000;
  return [
    { mesh: P.housing, basis: I3, offset: [x, wall, z], skin: 0.6, skinScale: 1 / 8 },
    { mesh: on ? P.green : P.red, basis: I3, offset: [x, wall - 6.5, z], bright: on ? 1.25 : 1.1 + 0.15 * Math.sin(t * 4), lamp: on ? 'green' : 'red' },
  ];
}

// ---- BOLDER (bolder_ai): a spiked iron roller as wide as the hall ----
function boulder(s, ctx) {
  const { e, img } = s;
  const lane = ctx.lane, W = lane - 10, R = img.h - 4;
  const P = built(`bolder:${lane}:${R}`, () => {
    const c = spriteColours(img, ctx.palette);
    const iron = [0, 1, 2].map((k) => 0.5 * shade(c.main, 1.4)[k] + 0.5 * [0.3, 0.3, 0.33][k]), dark = [0.07, 0.07, 0.09], spike = [0.55, 0.55, 0.58];
    const m = new Mesh().cylinderX([-W, 0, 0], R, 2 * W, 14, iron);
    for (let b = 0; b <= 4; b++) m.cylinderX([-W + b * ((2 * W - 8) / 4), 0, 0], R + 2.5, 8, 14, dark); // iron bands
    for (let r = 0; r < 10; r++) {
      const a = (r / 10) * Math.PI * 2;
      for (let i = 0; i < 6; i++) {
        const y = -W + 26 + i * ((2 * W - 52) / 5) + (r % 2 ? 0 : 22);
        if (y > W - 12) continue;
        const base = [y, Math.cos(a) * (R - 1), Math.sin(a) * (R - 1)], tip = [y, Math.cos(a) * (R + 15), Math.sin(a) * (R + 15)];
        prism(m, base, tip, 5, 0.3, spike, 4);
      }
    }
    for (const sd of [-1, 1]) m.cylinderX([sd > 0 ? W - 2 : -W - 6, 0, 0], R * 0.45, 8, 10, dark); // hubs
    return m.done();
  });
  const x = 2 * (s.x + img.w / 2), z = -2 * (s.y + img.h / 2);
  return [{ mesh: P, basis: acrossHall((-2 * e.x) / R), offset: [x, 0, z], skin: 0.8, skinScale: 1 / 14 }];
}

export const MACHINES = { jug_ai: jugger, track_ai: trackGun, rob1_ai: rob1, pusher_ai: pusher, step_ai: step, block_ai: block, indicator_ai: indicator, bolder_ai: boulder };
