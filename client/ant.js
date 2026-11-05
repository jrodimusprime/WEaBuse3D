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
function kit(e, g, palette) {
  const tint = g.assets.tintFor(e);
  return built(tint || 'plain', () => {
    let img = g.assets.sprite(e.def.file, (e.def.states.get('stopped') || [...e.def.states.values()][0])[0]);
    if (tint && img) img = g.assets.tinted(img, tint);
    const c = spriteColours(img, palette);
    const body = shade(c.body, 1.5), dark = shade(c.dark, 1.8), hi = shade(c.light, 1.05), bone = [0.8, 0.72, 0.62];
    return {
      body: boneMesh(body, 0.75), limb: boneMesh(body, 0.55), thin: boneMesh(dark, 0.4), tail: boneMesh(body, 0.7),
      ball: ballMesh(body), joint: ballMesh(dark), shell: ballMesh(shade(body, 0.85)), hi: ballMesh(hi),
      claw: boneMesh(bone, 0.15), blade: bladeMesh(bone), teeth: boneMesh(bone, 0.3),
      glow: new Mesh().ellipsoid([0, 0, 0], [1, 1, 1], 4, 8, [0.55, 1, 0.35]).done(), // acid
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
  const K = kit(e, ctx.g, ctx.palette);
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
    out.push({ mesh, basis: new Float32Array([...X, ...Y, ...Z]), offset: W(a), bright, skin: 0.35, skinScale: 1 / 6, ...extra });
  };
  const ball = (mesh, c, r, extra = {}) => {
    const X = toWorld([r[0], 0, 0]), Y = toWorld([0, r[1], 0]), Z = toWorld([0, 0, r[2]]);
    out.push({ mesh, basis: new Float32Array([...X, ...Y, ...Z]), offset: W(c), bright, skin: 0.35, skinScale: 1 / 6, ...extra });
  };

  // the body: lowered when crouching, bobbing as it runs, stretched when leaping, curled when hanging
  const bob = P.stride ? Math.abs(Math.sin(P.phase)) * 2.5 : 0;
  const low = -P.crouch + bob + (P.stretch ? 4 : 0);
  const hip = add(P.hip, [P.stretch * -4, 0, low]), chest = add(P.chest, [P.stretch * 6, 0, low + (P.curl ? -6 : 0)]);
  bone(K.body, hip, chest, 9);
  ball(K.shell, add(hip, [-7, 0, 1]), [12, 8.5, 9]); // abdomen
  ball(K.ball, chest, [8, 7.5, 7.5]);
  for (let i = 0; i < 3; i++) ball(K.hi, add(hip, [4 + i * 6, 0, 8.5 - i * 0.5]), [2.6, 6.5, 1.6]); // ribs over the back
  for (let i = 0; i < 3; i++) bone(K.thin, add(chest, [-4 - i * 5, i % 2 ? 3 : -3, 6]), add(chest, [-12 - i * 5, i % 2 ? 4 : -4, 16 - i * 2]), 1.6); // dorsal spines

  // the head: long and domed, jutting forward; the jaw drops to spit
  const neck = add(chest, [7, 0, 3]);
  const hd = norm(P.headDir), headTip = add(neck, mul(hd, 26));
  bone(K.body, neck, headTip, 6.2);
  ball(K.shell, add(neck, mul(hd, 9)), [12, 6.5, 7]);
  const jawDir = norm(add(hd, [0, 0, -0.5 - P.jaw]));
  bone(K.limb, add(neck, mul(hd, 4)), add(add(neck, mul(hd, 4)), mul(jawDir, 18)), 3.5);
  bone(K.teeth, add(neck, mul(hd, 20)), add(neck, mul(hd, 25.5)), 1.4);
  if (P.glow > 0.05) { const r = 1.5 + 2 * P.glow; out.push({ mesh: K.glow, basis: new Float32Array([r, 0, 0, 0, r, 0, 0, 0, r]), offset: W(add(headTip, [-2, 0, -4])), additive: true, glowAmt: 0.9 * P.glow }); }

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
    bone(K.claw, leg.foot, add(leg.foot, [7, side * 0.5, -0.5]), 1.6);
    // front arm
    const sh = add(chest, [3, side * 7, -3]);
    let hand;
    if (P.splay) hand = add(sh, [6, side * 16, 10]);
    else if (P.stretch) hand = add(sh, [26, side * 3, -4]);
    else if (P.curl) hand = add(sh, [8, side * 3, -6]);
    else hand = [sh[0] + P.arm[0] - 6 + Math.sin(ph + Math.PI) * P.stride * 0.8, side * 8, Math.max(0, Math.cos(ph + Math.PI)) * P.stride * 0.3];
    const arm = solve(sh, hand, 14, 16, [0.2, 0, 1]);
    bone(K.limb, sh, arm.knee, 3.4); ball(K.joint, arm.knee, [2.6, 2.6, 2.6]); bone(K.limb, arm.knee, arm.foot, 2.6);
    for (const k of [-1, 0, 1]) bone(K.claw, arm.foot, add(arm.foot, [8, side * 0.6 + k * 2, -1.5 - Math.abs(k)]), 1.2); // three claws
  }
  return out;
}
