// The alien ant (ant.lsp ANT_ROOF and its kin, ant_ai): Abuse's key enemy, as a real, posed 3D model.
//
// From its frames (art/ant.spe): a xenomorph-like creature: a long domed head that juts forward with a jaw
// that opens to spit, a hunched ribbed torso and abdomen with spines on its back, digitigrade hind legs,
// clawed forearms reaching forward, and a long whip tail curling up behind, ending in a blade. It hangs
// from the ceiling curled up like a pod (hanging), drops with its limbs splayed (fall_start, falling),
// runs on all fours (running, 10 frames), crouches flat to pounce (landing, pounce_wait), leaps stretched
// out (start_run_jump, run_jump, run_jump_fall), rears up (jump_up), spits with a flash at its mouth
// (weapon_fire, fire_wait), walks and spits upside down on the ceiling (top_walk, ceil_fire), turns round
// (turn_around), pales when hit (flinch_up, flinch_down) and dies flattened (blown_back_dead).
//
// The model is a skeleton of tapered bones and joints, posed every frame from the ant's state, frame and
// facing, with its two-bone legs solved so the feet stay on the floor. It turns a little towards the
// player across the hall. Colours come from the ant's own (tinted) sprite. Presentation only.
import { Mesh, spriteColours, shade } from '../engine/mesh.js';

const cache = new Map();
const built = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// unit meshes: a bone along +X from 0 to 1, radius 1 tapering to `tip`; a ball of radius 1
function boneMesh(rgb, tip) {
  const n = 8, m = new Mesh();
  const ring = (x, r, i) => { const a = (i / n) * Math.PI * 2; return [x, r * Math.cos(a), r * Math.sin(a)]; };
  m.inside((a, b, c) => [Math.min(Math.max((a[0] + b[0] + c[0]) / 3, 1e-3), 1 - 1e-3), 0, 0], () => {
    for (let i = 0; i < n; i++) {
      m.quad(ring(0, 1, i), ring(1, tip, i), ring(1, tip, i + 1), ring(0, 1, i + 1), rgb);
      m.tri([0, 0, 0], ring(0, 1, i), ring(0, 1, i + 1), rgb);
      m.tri([1, 0, 0], ring(1, tip, i + 1), ring(1, tip, i), rgb);
    }
  });
  return m.done();
}
const ballMesh = (rgb) => new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 5, 8, rgb).done();
const bladeMesh = (rgb) => new Mesh().hexa([[0, -0.15, -0.5], [1, -0.05, -0.1], [1, 0.05, -0.1], [0, 0.15, -0.5], [0, -0.15, 0.5], [1, -0.05, 0.1], [1, 0.05, 0.1], [0, 0.15, 0.5]], rgb).done();

// one kit per tint (ant_draw tints ants by aitype), coloured from that tint of its standing frame
const VARIANT_BODY = [null, [0.22, 0.12, 0.13], [0.42, 0.16, 0.08], [0.62, 0.3, 0.28], [0.45, 0.06, 0.05], [0.5, 0.1, 0.08], [0.36, 0.2, 0.12], [0.27, 0.08, 0.08], [0.66, 0.15, 0.13]];
// Jared: "that image on the left hand side is your best bet" (the creature on Abuse's box art): design 8
export const DEFAULT_ANT = 8;
// horn: the skin's colour lightened toward bone, so claws, pincers and teeth belong to the same creature
const horn = (body, k) => body.map((v, i) => Math.min(1, v * 1.35 + k * [0.62, 0.52, 0.42][i]));
function kit(e, g, palette, variant = 0) {
  const tint = g.assets.tintFor(e);
  return built(`${variant}:${tint ? g.assets.tints.ant_draw.indexOf(tint) : 'plain'}`, () => {
    let img = g.assets.sprite(e.def.file, (e.def.states.get('stopped') || [...e.def.states.values()][0])[0]);
    if (tint && img) img = g.assets.tinted(img, tint);
    const c = spriteColours(img, palette);
    let body = shade(c.body, 1.5);
    const V = VARIANT_BODY[variant];
    if (V) body = tint ? body.map((v, k) => 0.5 * v + 0.5 * V[k]) : V;
    const dark = variant === 1 || variant === 7 ? [0.1, 0.06, 0.07] : shade(c.dark, 1.8), hi = variant === 1 || variant === 7 ? [0.5, 0.42, 0.44] : shade(c.light, 1.05), bone = [0.8, 0.72, 0.62];
    return {
      body: boneMesh(body, 0.75), limb: boneMesh(body, 0.55), thin: boneMesh(dark, 0.4), tail: boneMesh(body, 0.7),
      ball: ballMesh(body), joint: ballMesh(dark), shell: ballMesh(shade(body, 0.85)), hi: ballMesh(hi),
      claw: boneMesh(bone, 0.15), blade: bladeMesh(bone), teeth: boneMesh(bone, 0.3),
      glow: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 4, 8, [0.55, 1, 0.35]).done(), // acid
      silver: boneMesh(variant === 7 ? horn(body, 0.62) : [0.82, 0.84, 0.86], 0.12), white: boneMesh(variant === 7 ? horn(body, 0.45) : [0.86, 0.82, 0.72], 0.6), whiteBall: ballMesh([0.86, 0.82, 0.72]),
      hornClaw: boneMesh(horn(body, 0.5), 0.15),
      // the box-art creature: flesh, pink highlights, dark creases, ivory teeth, dark gums, a tapering cranium
      flesh: boneMesh(body, 0.7), fleshBall: ballMesh(body), pink: ballMesh(body.map((v, i) => Math.min(1, v * 1.25 + [0.12, 0.1, 0.09][i]))),
      crease: boneMesh(body.map((v) => v * 0.35), 0.6), cranium: boneMesh(body, 0.45), ivory: boneMesh([0.86, 0.8, 0.68], 0.1),
      gums: ballMesh([0.3, 0.04, 0.04]), ember: ballMesh([1, 0.55, 0.15]), sinew: boneMesh(body.map((v) => v * 0.8), 0.5), mouth: ballMesh([0.06, 0.01, 0.01]), slit: ballMesh([0.35, 0.05, 0.03]), slitGlow: ballMesh([0.9, 0.25, 0.08]),
      socket: ballMesh([0.03, 0.02, 0.02]), redEye: ballMesh([1, 0.12, 0.06]), orangeEye: ballMesh([1, 0.55, 0.1]), yellowEye: ballMesh([1, 0.85, 0.2]),
      petal: bladeMesh(shade(body, 0.8)), crest: bladeMesh(bone), throat: ballMesh([1, 0.2, 0.08]), acid: ballMesh([0.5, 1, 0.3]),
    };
  });
}

// ---- small vector helpers (model space: X forward, Y left, Z up) ----
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// a bone from a to b with radius r: its basis (column-major) in model space
function boneBasis(a, b, r) {
  const d = sub(b, a);
  const f = norm(d);
  let u = Math.abs(f[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const p1 = norm(cross(f, u)), p2 = cross(f, p1);
  return [d, mul(p1, r), mul(p2, r)];
}

// two-bone leg: from hip to foot with bone lengths l1, l2, knee bending towards `bend`
function solve(hip, foot, l1, l2, bend) {
  let d = sub(foot, hip);
  let dist = len(d);
  if (dist > l1 + l2 - 0.01) { d = mul(norm(d), l1 + l2 - 0.01); dist = l1 + l2 - 0.01; foot = add(hip, d); }
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const f = norm(d), side = norm(sub(bend, mul(f, bend[0] * f[0] + bend[1] * f[1] + bend[2] * f[2])));
  return { knee: add(add(hip, mul(f, a)), mul(side, h)), foot };
}

// The pose for a state: body points, tail curve, limb targets. t: seconds, f: 0..1 through the state.
function pose(e, t, f) {
  const st = e.state;
  const P = { hip: [-8, 0, 24], chest: [14, 0, 30], headDir: [0.95, 0, -0.3], jaw: 0, crouch: 0, stride: 0, phase: 0, tailUp: 0.9, tailCurl: 0.22, sway: 0.2,
    arm: [24, 0, 4], splay: 0, curl: 0, pale: false, flat: 0, rear: 0, glow: 0, stretch: 0 };
  switch (st) {
    case 'running': case 'top_walk': P.stride = 13; P.phase = f * Math.PI * 2; break;
    case 'stopped': case 'fire_wait': case 'ceil_fire': P.crouch = 4; break;
    case 'landing': case 'pounce_wait': P.crouch = 11; P.tailUp = 0.5; P.headDir = [1, 0, -0.1]; break;
    case 'weapon_fire': P.crouch = 3; P.headDir = [0.9, 0, 0.15]; P.jaw = 0.35 + 0.35 * Math.sin(f * Math.PI); P.glow = Math.sin(f * Math.PI); break;
    case 'fall_start': case 'falling': P.splay = 1; P.tailUp = 1.4; P.sway = 0.6; break;
    case 'start_run_jump': case 'run_jump': case 'run_jump_fall': P.stretch = 1; P.tailUp = 0.15; P.tailCurl = 0.05; break;
    case 'jump_up': P.rear = 0.8; break;
    case 'hanging': P.curl = 1; break;
    case 'flinch_up': case 'flinch_down': P.pale = true; P.rear = st === 'flinch_up' ? 0.35 : -0.2; P.jaw = 0.4; break;
    case 'blown_back_dead': case 'dead': P.flat = 1; P.splay = 0.6; P.tailUp = 0.05; P.tailCurl = 0.02; P.sway = 0; break;
    default: break;
  }
  if (st === 'fire_wait' || st === 'ceil_fire') { P.jaw = 0.25; P.glow = 0.5 + 0.5 * Math.sin(t * 9); }
  return P;
}

// The ant's parts: [{mesh, basis, offset, bright, additive?}] in world space.
// s: the scene sprite (img, x, y, flip, e); ctx: {palette, time, depthOf, g, pd}
export function antModel(s, ctx) {
  const { e, img } = s;
  if (e.state === 'hiding' || !img) return [];
  const V = ctx.antVariant ?? DEFAULT_ANT;
  const K = kit(e, ctx.g, ctx.palette, V);
  const t = ctx.time / 1000;
  const n = e.def.states.get(e.state)?.length || 1;
  const fr = (Math.floor(e.frame) % n) / Math.max(1, n);
  const P = pose(e, t, fr);
  const ceiling = e.state === 'top_walk' || e.state === 'ceil_fire' || e.state === 'hanging';

  // where: its anchor in the level (feet, or the ceiling it clings to), and its depth across the hall
  const ox = s.flip ? img.w - img.xcfg - 1 : img.xcfg;
  const ax = 2 * (s.x + ox), feet = -2 * (s.y + img.h - 1), top = -2 * s.y;
  const d = ctx.depthOf(e);
  // facing: along the hall (its direction), turned a little towards the player across it
  const p = ctx.g.player;
  const across = Math.max(-0.6, Math.min(0.6, Math.atan2(ctx.pd - d, Math.max(40, Math.abs(2 * (p.x - e.x))))));
  let yaw = (e.dir > 0 ? 0 : Math.PI) + (e.dir > 0 ? across : -across);
  if (e.state === 'turn_around') yaw += Math.PI * (1 - fr);
  // the body's own lean (rearing, flinching, falling head-first, hanging head-down)
  const pitch = -P.rear * 0.9 + (P.splay ? 0.35 : 0) + (P.curl ? 1.4 : 0);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const roll = ceiling ? Math.PI : 0, cr = Math.cos(roll), sr = Math.sin(roll);
  const flat = 1 - 0.65 * P.flat;
  // model -> world: scale (flatten), pitch about Y, roll about X (upside down), yaw about Z
  const toWorld = (v) => {
    let x = v[0], y = v[1], z = v[2] * flat;
    [x, z] = [x * cp + z * sp, -x * sp + z * cp];
    [y, z] = [y * cr - z * sr, y * sr + z * cr];
    return [x * cy - y * sy, x * sy + y * cy, z];
  };
  const base = [ax, d, ceiling ? top : feet];
  const W = (v) => add(base, toWorld(v));
  const out = [];
  const bright = P.pale ? 1.8 : 1;
  const bone = (mesh, a, b, r, extra = {}) => {
    const [dx, p1, p2] = boneBasis(a, b, r);
    const X = toWorld(dx), Y = toWorld(p1), Z = toWorld(p2);
    out.push({ mesh, basis: new Float32Array([...X, ...Y, ...Z]), offset: W(a), bright, skin: 0.75, skinKind: 1, skinScale: 1 / 7, ...extra });
  };
  const ball = (mesh, c, r, extra = {}) => {
    const X = toWorld([r[0], 0, 0]), Y = toWorld([0, r[1], 0]), Z = toWorld([0, 0, r[2]]);
    out.push({ mesh, basis: new Float32Array([...X, ...Y, ...Z]), offset: W(c), bright, skin: 0.75, skinKind: 1, skinScale: 1 / 7, ...extra });
  };

  const glowBall = (mesh, c, r, amt) => out.push({ mesh, basis: new Float32Array(toWorld([r, 0, 0]).concat(toWorld([0, r, 0]), toWorld([0, 0, r]))), offset: W(c), additive: true, glowAmt: amt });
  const lit = (mesh, c, r, b = 2.2) => out.push({ mesh, basis: new Float32Array(toWorld([r[0], 0, 0]).concat(toWorld([0, r[1], 0]), toWorld([0, 0, r[2]]))), offset: W(c), bright: b });
  if (V === 8) return boxArt();
  // THE BOX-ART CREATURE (design 8, Jared's pick: the creature on Abuse's cover). Lean, sinewy, flesh red with
  // pink highlights and dark creases; a long bulbous cranium sweeping up and back from the face with an ember
  // at its tip; no eyes; a lipless grin of two rows of sharp ivory teeth on a jaw that opens and closes; long
  // gaunt limbs held high in a spider's crouch, elbows and knees above the body, long-fingered claws; ribs
  // under the skin, a ridge of vertebrae; a long beaded tail of vertebrae arching up and back.
  function boxArt() {
    const M = { skin: 0.55, skinKind: 2, skinScale: 0.9 }, Mb = { skin: 0.5, skinKind: 2, skinScale: 0.55 };
    const fb = (a, b, r, mesh = K.flesh) => bone(mesh, a, b, r, M);
    const fball = (c, r, mesh = K.fleshBall) => ball(mesh, c, r, Mb);
    const bob = P.stride ? Math.abs(Math.sin(P.phase)) * 2 : 0;
    const low = -P.crouch * 0.8 + bob + (P.stretch ? 6 : 0);
    const hip = [-10 - P.stretch * 4, 0, 18 + low], chest = [12 + P.stretch * 6, 0, 22 + low + (P.curl ? -5 : 0)];
    // the torso: pelvis, a lean ribcage, ribs under the skin, a ridge of vertebrae, bony shoulders
    fball(hip, [9, 7, 6]);
    fb(hip, chest, 6.5, K.sinew);
    fball(add(chest, [-3, 0, 0]), [11, 8.5, 7.5]);
    for (let i = 0; i < 5; i++) for (const sy of [-1, 1]) {
      const top = add(chest, [-10 + i * 3.6, sy * 2, 6.5]), bottom = add(chest, [-8 + i * 3.4, sy * 7.5, -4]);
      bone(K.crease, top, add(top, mul(sub(bottom, top), 0.55)).map((v, k) => v + (k === 1 ? sy * 2.5 : 0)), 0.9, M);
      bone(K.crease, add(top, mul(sub(bottom, top), 0.55)).map((v, k) => v + (k === 1 ? sy * 2.5 : 0)), bottom, 0.8, M);
    }
    for (let i = 0; i < 7; i++) ball(K.pink, add(hip, [2 + i * 3.6, 0, 6.5 + Math.sin(i / 6 * Math.PI) * 3]), [1.8, 1.8, 1.6], Mb); // vertebrae
    // the neck and the head: a long cranium sweeping up and back, the ember at its tip, the face and the grin
    const neckBase = add(chest, [6, 0, 3]), face = add(neckBase, [13 + P.stretch * 2, 0, 1 + P.rear * 6]);
    fb(neckBase, face, 4.5, K.sinew);
    const back = norm([-0.62, 0, 0.78]);
    const crTop = add(face, [-1, 0, 5]);
    // the cranium: three overlapping ellipsoids stretched along the sweep, swelling then rounding off
    const along = (c, long, short) => {
      const [dx, p1, p2] = boneBasis([0, 0, 0], back, short);
      const X = toWorld(mul(dx, long)), Y = toWorld(p1), Z = toWorld(p2);
      out.push({ mesh: K.fleshBall, basis: new Float32Array([...X, ...Y, ...Z]), offset: W(c), bright, ...Mb });
    };
    along(add(crTop, mul(back, 7)), 12, 8.8);
    along(add(crTop, mul(back, 19)), 12.5, 7.4);
    along(add(crTop, mul(back, 29)), 7.5, 5.2);
    glowBall(K.ember, add(crTop, mul(back, 33.5)), 2.2, 0.8 + 0.3 * Math.sin(t * 4));
    lit(K.ember, add(crTop, mul(back, 33.5)), [1.4, 1.4, 1.4], 2.2);
    fball(add(face, [3, 0, -1]), [7, 7.5, 5.6]); // the face
    const snarl = Math.max(0, Math.sin(t * 1.7 + (e.id || 0) * 1.3));
    const open = P.jaw > 0.2 ? 0.55 + 0.4 * P.jaw : 0.08 + 0.6 * snarl * snarl;
    ball(K.gums, add(face, [6, 0, -3.5 - open * 2]), [5, 6.2, 2 + open * 3.5]); // the dark behind the teeth
    for (let i = 0; i < 9; i++) { // the upper row: a wide grin across the face
      const a = (i / 8 - 0.5) * 2.2, y = Math.sin(a) * 6.6, x = 8 + Math.cos(a) * 3;
      bone(K.ivory, add(face, [x, y, -2.2]), add(face, [x + 0.6, y * 0.96, -6.2 - (i % 2) * 0.8]), 0.95);
    }
    const hinge = add(face, [-2, 0, -3]), jd = norm([1, 0, -0.25 - open * 1.4]);
    const jawTip = add(hinge, mul(jd, 12));
    fb(hinge, jawTip, 3.2);
    fball(jawTip, [3.5, 6, 2.4]);
    for (let i = 0; i < 9; i++) { // the lower row on the jaw
      const a = (i / 8 - 0.5) * 2.2, y = Math.sin(a) * 6, base = add(add(hinge, mul(jd, 7 + Math.cos(a) * 4)), [0, y, 0.8]);
      bone(K.ivory, base, add(base, [0.4, -y * 0.04, 3.4 + (i % 2) * 0.6]), 0.85);
    }
    // the tail: sixteen vertebrae, beaded, arching up and back, swaying
    let tp = add(hip, [-8, 0, 2]), ang = Math.PI - 0.55 - P.tailUp * 0.15;
    for (let i = 0; i < 16; i++) {
      ang += (i < 6 ? -0.05 : i < 11 ? 0.06 : 0.12) + Math.sin(t * 2.4 + i * 0.5) * 0.035 * (P.curl ? 0 : 1) * (1 + P.sway);
      const step = 6.2 - i * 0.18, r = 2.9 - i * 0.13;
      const next = add(tp, [Math.cos(ang) * step, Math.sin(t * 1.9 + i * 0.4) * i * 0.18 * P.sway, Math.sin(ang) * step]);
      bone(K.sinew, tp, next, r * 0.55, M);
      ball(K.pink, next, [r, r, r], Mb);
      tp = next;
    }
    // the limbs: long and gaunt, elbows and knees held high like a spider's, long-fingered claws
    for (const side of [1, -1]) {
      const ph = P.phase + (side > 0 ? 0 : Math.PI);
      const hipJ = add(hip, [0, side * 6, 0]);
      let foot;
      if (P.splay) foot = add(hipJ, [-12, side * 22, -10]);
      else if (P.stretch) foot = add(hipJ, [-34, side * 6, -12]);
      else if (P.curl) foot = add(hipJ, [8, side * 6, -6]);
      else foot = [hipJ[0] - 8 + Math.sin(ph) * P.stride * 1.2, side * 17, Math.max(0, Math.cos(ph)) * P.stride * 0.45];
      const leg = solve(hipJ, foot, 21, 26, [-0.2, side * 0.45, 1]);
      fb(hipJ, leg.knee, 4.2); fball(leg.knee, [3.2, 3, 3.2]); fb(leg.knee, leg.foot, 3);
      for (const k of [-1, 0, 1]) bone(K.hornClaw, leg.foot, add(leg.foot, [7, side * 0.8 + k * 1.8, -0.6]), 1.1, M);
      const sh = add(chest, [3, side * 8, 2]);
      fball(sh, [4, 3.6, 3.6]); // the bony shoulder
      let hand;
      if (P.splay) hand = add(sh, [8, side * 24, 12]);
      else if (P.stretch) hand = add(sh, [34, side * 5, -10]);
      else if (P.curl) hand = add(sh, [10, side * 4, -8]);
      else hand = [sh[0] + 22 + Math.sin(ph + Math.PI) * P.stride, side * 16, Math.max(0, Math.cos(ph + Math.PI)) * P.stride * 0.4];
      const arm = solve(sh, hand, 19, 23, [-0.3, side * 0.6, 1]);
      fb(sh, arm.knee, 3.4); fball(arm.knee, [2.6, 2.5, 2.6]); fb(arm.knee, arm.foot, 2.5);
      for (const k of [-1.5, -0.5, 0.5, 1.5]) { // four long fingers
        const knuckle = add(arm.foot, [3, side * 0.5 + k * 1.6, 0]);
        fb(arm.foot, knuckle, 1.1);
        bone(K.hornClaw, knuckle, add(knuckle, [7, side * 0.4 + k * 1.2, -1.6 - Math.abs(k) * 0.4]), 0.9, M);
      }
    }
    return out;
  }

  // the body: lowered when crouching, bobbing as it runs, stretched when leaping, curled when hanging
  const bob = P.stride ? Math.abs(Math.sin(P.phase)) * 2.5 : 0;
  const low = -P.crouch + bob + (P.stretch ? 4 : 0);
  const hip = add(P.hip, [P.stretch * -4, 0, low]), chest = add(P.chest, [P.stretch * 6, 0, low + (P.curl ? -6 : 0)]);
  bone(K.body, hip, chest, 9);
  ball(K.shell, add(hip, [-7, 0, 1]), [12, 8.5, 9]); // abdomen
  ball(K.ball, chest, [8, 7.5, 7.5]);
  for (let i = 0; i < 3; i++) ball(K.hi, add(hip, [4 + i * 6, 0, 8.5 - i * 0.5]), [2.6, 6.5, 1.6]); // ribs over the back
  for (let i = 0; i < 3; i++) bone(K.thin, add(chest, [-4 - i * 5, i % 2 ? 3 : -3, 6]), add(chest, [-12 - i * 5, i % 2 ? 4 : -4, 16 - i * 2]), 1.6); // dorsal spines

  // the head: long and domed, jutting forward; the jaw drops to spit (design 0), or one of six scarier designs
  const neck = add(chest, [7, 0, 3]);
  const hd = norm(P.headDir), headTip = add(neck, mul(hd, 26));
  const side = (v, y) => [v[0], y, v[2]];
  const at = (k, y = 0, z = 0) => add(add(neck, mul(hd, k)), [0, y, z]);
  const jawOpen = Math.max(P.jaw, 0.15 + 0.1 * Math.sin(t * 2.3));
  // MANDIBLE's pieces: huge curved pincers that clamp, clusters of glowing red eyes, spikes on the carapace
  const mandibles = (k0, eyeK, eyeZ, extras = true, clampWith = null) => {
    const clamp = clampWith ?? 0.35 + 0.35 * Math.sin(t * 5) * (P.jaw > 0.2 ? 2 : 0.6);
    for (const sy of [-1, 1]) {
      let a = at(k0, sy * 7, -2), dir = norm([1, sy * (0.6 + clamp), -0.15]);
      for (let i = 0; i < 4; i++) {
        const b = add(a, mul(dir, 8 - i));
        bone(i === 3 ? K.claw : K.white, a, b, 2.6 - i * 0.55);
        a = b; dir = norm([dir[0], dir[1] - sy * (0.55 + clamp * 0.4), dir[2]]);
      }
      if (!extras) continue;
      for (let k = 0; k < 4; k++) lit(K.redEye, at(eyeK + (k % 2) * 3, sy * (5 + Math.floor(k / 2) * 2.5), eyeZ + (k % 2)), [1.6, 1.6, 1.6], 2.4);
      bone(K.claw, at(2, sy * 6, 9), at(-6, sy * 9, 15), 1.6);
      bone(K.claw, at(-2, sy * 3, 10), at(-10, sy * 4, 18), 1.4);
    }
  };
  if (V === 7) { // XENO + MANDIBLE (Jared's pick, then: no top horns, no eye balls, horn-coloured claws, a mouth that works)
    // the mouth: a snarl that opens and closes by itself, gaping wide to spit
    const snarl = Math.max(0, Math.sin(t * 1.7 + (e.id || 0) * 1.3));
    const open = P.jaw > 0.2 ? 0.55 + 0.4 * P.jaw : 0.06 + 0.62 * snarl * snarl;
    bone(K.body, neck, at(36, 0, 2), 7.8); // the long glossy dome
    ball(K.shell, at(10, 0, 2), [15, 7.5, 8]);
    for (const y of [-2.5, 0, 2.5]) bone(K.thin, at(4, y, 8), at(30, y * 0.4, 5), 1.2); // ridges along it
    for (const sy of [-1, 1]) for (let k = 0; k < 2; k++) { // eyes: glassy slits set into the dome, a faint ember inside
      lit(K.slit, at(14 + k * 7, sy * (5.6 - k * 0.8), 3.6 - k * 0.6), [3.6 - k, 0.7, 1], 1.3);
      glowBall(K.slitGlow, at(14 + k * 7, sy * (6 - k * 0.8), 3.6 - k * 0.6), 0.9, 0.22 + 0.08 * Math.sin(t * 3 + k));
    }
    for (let i = 0; i < 5; i++) for (const y of [-2.2, 2.2]) bone(K.silver, at(16 + i * 3.4, y, -2.5), at(16 + i * 3.4, y * 0.8, -6.5), 0.9); // upper teeth
    const hinge = at(8, 0, -3), jd = norm(add(hd, [0, 0, -0.3 - open * 1.5]));
    if (open > 0.12) ball(K.mouth, at(16, 0, -4 - open * 3), [12, 3.6, 2 + open * 4.5]); // the dark of the throat
    bone(K.limb, hinge, add(hinge, mul(jd, 24)), 3.6); // the lower jaw
    for (let i = 0; i < 5; i++) for (const y of [-2.2, 2.2]) {
      const base = add(add(hinge, mul(jd, 9 + i * 2.8)), [0, y, 0]);
      bone(K.silver, base, add(base, [0.5, -y * 0.15, 3.6]), 0.8); // lower teeth
    }
    const reach = 3 + 15 * Math.max(0, (open - 0.3) / 0.7); // the inner jaw shoots out as it opens
    const inner = add(hinge, mul(norm(add(hd, [0, 0, -0.2 - open * 0.6])), 10));
    bone(K.thin, inner, add(inner, mul(hd, 8 + reach)), 2);
    for (const y of [-1, 1]) bone(K.silver, add(inner, add(mul(hd, 8 + reach), [0, y, 1])), add(inner, add(mul(hd, 11 + reach), [0, y, 1])), 0.8);
    mandibles(20, 0, 0, false, 0.2 + 0.7 * open); // the pincers spread as the mouth opens
  } else if (V === 1) { // XENO: a long glossy dome, an inner jaw that shoots out, rows of silver teeth, no eyes
    bone(K.body, neck, at(36, 0, 2), 7.8);
    ball(K.shell, at(10, 0, 2), [15, 7.5, 8]);
    for (const y of [-2.5, 0, 2.5]) bone(K.thin, at(4, y, 8), at(30, y * 0.4, 5), 1.2); // ridges along the dome
    const jd = norm(add(hd, [0, 0, -0.4 - jawOpen]));
    bone(K.limb, at(6, 0, -3), add(at(6, 0, -3), mul(jd, 20)), 3.4);
    for (let i = 0; i < 5; i++) for (const y of [-2.2, 2.2]) {
      bone(K.silver, at(14 + i * 3.4, y, -2.5), at(14 + i * 3.4, y * 0.8, -6.5), 0.9); // upper teeth
      bone(K.silver, add(at(6, 0, -3), mul(jd, 8 + i * 2.5)).map((v, k) => v + [0, y, 0][k]), add(add(at(6, 0, -3), mul(jd, 8 + i * 2.5)), [0, y * 0.8, 3.5]), 0.8); // lower teeth
    }
    const reach = 6 + 10 * Math.max(0, Math.sin(t * 1.7)) * (P.jaw > 0.3 ? 1.6 : 1);
    bone(K.thin, at(24, 0, -4), at(24 + reach, 0, -4), 2); // the inner jaw
    for (const y of [-1, 1]) bone(K.silver, at(24 + reach, y, -3), at(27 + reach, y, -3), 0.8);
  } else if (V === 2) { // MANDIBLE: a broad head, huge curved pincers, clusters of glowing red eyes, spiked carapace
    ball(K.shell, at(8, 0, 2), [12, 10, 8]);
    bone(K.body, neck, at(20, 0, -1), 6);
    mandibles(16, 9, 7);
  } else if (V === 3) { // MAW: the head opens in four petals round a ring of teeth and a glowing throat
    ball(K.shell, at(6, 0, 1), [11, 9, 9]);
    const mouth = at(15, 0, 0), open = 0.45 + 0.45 * Math.max(P.jaw * 1.4, 0.4 + 0.3 * Math.sin(t * 3));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const dir = norm([Math.cos(open) * 1, Math.sin(a) * Math.sin(open), Math.cos(a) * Math.sin(open)]);
      bone(K.petal, mouth, add(mouth, mul(dir, 18)), 5.5);
      for (let i = 0; i < 2; i++) bone(K.silver, add(mouth, mul(dir, 6 + i * 6)), add(add(mouth, mul(dir, 6 + i * 6)), mul(norm([0, -Math.sin(a), -Math.cos(a)]), 3.5)), 0.8);
    }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; bone(K.silver, add(mouth, [1, Math.sin(a) * 4, Math.cos(a) * 4]), add(mouth, [3, Math.sin(a) * 1.5, Math.cos(a) * 1.5]), 0.9); }
    lit(K.throat, mouth, [3, 3.5, 3.5], 2.6);
    glowBall(K.throat, mouth, 4.5, 0.5 + 0.3 * Math.sin(t * 6));
  } else if (V === 4) { // HORNED: ram horns curling back, a bony crest, slit yellow eyes, a heavy snout
    ball(K.shell, at(8, 0, 2), [12, 8, 8.5]);
    bone(K.body, at(8, 0, 0), at(26, 0, -4), 5.2);
    bone(K.limb, at(10, 0, -4), add(at(10, 0, -4), mul(norm(add(hd, [0, 0, -0.4 - jawOpen])), 15)), 3);
    for (const sy of [-1, 1]) {
      let a = at(6, sy * 6, 7), ang = 0.6;
      for (let i = 0; i < 6; i++) {
        const b = add(a, [-Math.cos(ang) * 6, sy * (1.4 + i * 0.2), Math.sin(ang) * 6]);
        bone(K.white, a, b, 3.4 - i * 0.45);
        a = b; ang -= 0.55;
      }
      lit(K.yellowEye, at(13, sy * 5, 5), [2.6, 0.7, 0.6], 2.6);
      for (let i = 0; i < 4; i++) bone(K.silver, at(18 + i * 2.5, sy * 2.6, -5), at(18 + i * 2.5, sy * 2.4, -8), 0.8);
    }
    bone(K.crest, at(0, 0, 9), at(-12, 0, 16), 4);
  } else if (V === 5) { // SKULL: a bone-white skull face with dark sockets and red pinprick eyes; exposed ribs
    ball(K.whiteBall, at(8, 0, 2), [11, 8, 9]);
    bone(K.white, at(10, 0, -1), at(24, 0, -4), 4.8);
    for (const sy of [-1, 1]) {
      ball(K.socket, at(13, sy * 4, 3.5), [3.2, 2.6, 2.8]);
      lit(K.redEye, at(15, sy * 4, 3.5), [0.9, 0.9, 0.9], 3);
      for (let i = 0; i < 5; i++) bone(K.silver, at(16 + i * 2, sy * 3, -4), at(16 + i * 2, sy * 2.8, -7.5), 0.8);
    }
    const jd = norm(add(hd, [0, 0, -0.5 - jawOpen]));
    bone(K.white, at(8, 0, -4), add(at(8, 0, -4), mul(jd, 16)), 3.2);
    for (let i = 0; i < 4; i++) for (const sy of [-1, 1]) bone(K.white, add(hip, [2 + i * 5, sy * 4, 6]), add(hip, [3 + i * 5, sy * 9.5, -3]), 1); // ribs
  } else if (V === 6) { // HIVE: eight glowing orange eyes, fangs dripping acid, bristles down the back
    ball(K.shell, at(7, 0, 1), [11, 10, 8.5]);
    for (let k = 0; k < 8; k++) {
      const row = k < 4 ? 0 : 1, col = (k % 4) - 1.5;
      lit(K.orangeEye, at(15 - row * 2, col * 3, 4 + row * 3.5), [1.5 - row * 0.4, 1.5 - row * 0.4, 1.5 - row * 0.4], 2.6);
    }
    for (const sy of [-1, 1]) {
      const root = at(16, sy * 3, -3), tip = add(root, [4, sy * -1, -10 - 4 * jawOpen]);
      bone(K.thin, root, tip, 2.2);
      bone(K.claw, tip, add(tip, [2, 0, -4]), 1.2);
      glowBall(K.acid, add(tip, [2, 0, -6 - ((t * 4) % 3)]), 1.2, 1);
    }
    for (let i = 0; i < 9; i++) bone(K.thin, add(hip, [-6 + i * 3.5, (i % 2 ? 2 : -2), 9]), add(hip, [-10 + i * 3.5, (i % 2 ? 3 : -3), 16 + (i % 3) * 2]), 0.6); // bristles
  } else {
  bone(K.body, neck, headTip, 6.2);
  ball(K.shell, add(neck, mul(hd, 9)), [12, 6.5, 7]);
  const jawDir = norm(add(hd, [0, 0, -0.5 - P.jaw]));
  bone(K.limb, add(neck, mul(hd, 4)), add(add(neck, mul(hd, 4)), mul(jawDir, 18)), 3.5);
  bone(K.teeth, add(neck, mul(hd, 20)), add(neck, mul(hd, 25.5)), 1.4);
  if (P.glow > 0.05) { const r = 1.5 + 2 * P.glow; out.push({ mesh: K.glow, basis: new Float32Array([r, 0, 0, 0, r, 0, 0, 0, r]), offset: W(add(headTip, [-2, 0, -4])), additive: true, glowAmt: 0.9 * P.glow }); }
  }

  // the tail: ten segments arcing back and up from the rump, the last few whipping over and back down
  // (as drawn), swaying, ending in a blade
  let tp = add(hip, [-12, 0, 2]), ang = Math.PI - 0.2 - P.tailUp * 0.4;
  const k = P.tailCurl / 0.22;
  for (let i = 0; i < 10; i++) {
    ang += (i < 5 ? -0.07 : 0.24) * k + Math.sin(t * 3 + i * 0.6) * 0.04 * P.sway * 5 * (P.curl ? 0 : 1);
    const segLen = 7.5 - i * 0.3, r = 3.6 - i * 0.28;
    const sway = Math.sin(t * 2.2 + i * 0.5) * P.sway * i * 0.6;
    const next = add(tp, [Math.cos(ang) * segLen, sway * 0.3, Math.sin(ang) * segLen]);
    bone(K.tail, tp, next, r);
    tp = next;
  }
  bone(K.blade, tp, add(tp, [Math.cos(ang) * 9, 0, Math.sin(ang) * 9]), 2.5);

  // legs: digitigrade hind legs, feet on the floor; front arms with claws
  for (const side of [1, -1]) {
    const ph = P.phase + (side > 0 ? 0 : Math.PI);
    // hind leg
    const hipJ = add(hip, [-2, side * 7.5, -2]);
    let foot;
    if (P.splay) foot = add(hipJ, [-10, side * 14, -12]);
    else if (P.stretch) foot = add(hipJ, [-26, side * 3, -6]);
    else if (P.curl) foot = add(hipJ, [6, side * 4, -8]);
    else foot = [hipJ[0] - 4 + Math.sin(ph) * P.stride, side * 9, Math.max(0, Math.cos(ph)) * P.stride * 0.35];
    const leg = solve(hipJ, foot, 15, 19, [-1, 0, 0.2]);
    bone(K.limb, hipJ, leg.knee, 4.2); ball(K.joint, leg.knee, [3, 3, 3]); bone(K.limb, leg.knee, leg.foot, 3);
    bone(V === 7 ? K.hornClaw : K.claw, leg.foot, add(leg.foot, [7, side * 0.5, -0.5]), 1.6);
    // front arm
    const sh = add(chest, [3, side * 7, -3]);
    let hand;
    if (P.splay) hand = add(sh, [6, side * 16, 10]);
    else if (P.stretch) hand = add(sh, [26, side * 3, -4]);
    else if (P.curl) hand = add(sh, [8, side * 3, -6]);
    else hand = [sh[0] + P.arm[0] - 6 + Math.sin(ph + Math.PI) * P.stride * 0.8, side * 8, Math.max(0, Math.cos(ph + Math.PI)) * P.stride * 0.3];
    const arm = solve(sh, hand, 14, 16, [0.2, 0, 1]);
    bone(K.limb, sh, arm.knee, 3.4); ball(K.joint, arm.knee, [2.6, 2.6, 2.6]); bone(K.limb, arm.knee, arm.foot, 2.6);
    for (const k of [-1, 0, 1]) bone(V === 7 ? K.hornClaw : K.claw, arm.foot, add(arm.foot, [8, side * 0.6 + k * 2, -1.5 - Math.abs(k)]), 1.2); // three claws
  }
  return out;
}
