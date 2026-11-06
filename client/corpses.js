// The dead stay where they fall, as in Quake (Jared: "when a creature dies it should have a dead body pose
// or broken parts for robots... similar to quake dead bodies"). Presentation only: Abuse takes a dead enemy
// out of the game at once (its behaviour returns false), and the simulation is not touched; this keeps a
// corpse where it died, for the rest of the level.
//
//   creatures  (the alien ant) fall to the floor (from a wall or the ceiling too) and lie in the ant model's
//              own dead pose (client/ant.js 'dead': belly down, flattened, legs splayed), over a dark stain
//   machines   (the WHO flyer, the jugger, the cleaner, the turrets) are wrecks made of their own model's
//              parts: toppled over on the floor, darkened, their lights out, some smaller parts
//              thrown out round them, smoking and sparking for a few seconds
//   turrets    hang on where they were, broken: drooping, darkened, one piece fallen to the floor below
//
// Each corpse takes half a second to settle (falling under gravity, turning into its rest). Deterministic for
// a run: the scatter comes from the corpse's id, not from random numbers.
import { Mesh } from '../engine/mesh.js';

const MAX = 48;
const SETTLE = 0.55; // s
const SLUMP = 0.75; // a dead creature lies at this share of its height
const SINK = 5; // units a dead creature lies sunk into the floor (Jared: "sit lower in the ground", then "too low now")
const CREATURES = new Set(['ant_ai']);
const HANGING = new Set(['track_ai']);
const ON_WALL = new Set(['spray_gun_ai']);
const MACHINES = new Set(['flyer_ai', 'jug_ai', 'rob1_ai', 'track_ai', 'spray_gun_ai', 'boss_ai']);
const hash = (a, b) => ((Math.imul(a + 3, 2654435761) ^ Math.imul(b + 11, 40503)) >>> 0) % 10007 / 10007;

// column-major 3x3: rotation about the x (along the hall), y and z axes
const rot = (ax, ay, az) => {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay), Math.cos(az), Math.sin(az)];
  // Rz * Ry * Rx
  const m = [[cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx], [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx], [-sy, cy * sx, cy * cx]];
  return new Float32Array([m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]]);
};
const mul3 = (a, b) => { const o = new Float32Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; return o; };
const apply = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const lerp = (a, b, t) => a + (b - a) * t;
// the lowest point of a set of posed parts: each mesh's own vertices (9 floats each), turned and placed
function lowest(parts) {
  let low = Infinity;
  for (const q of parts) {
    const d = q.mesh?.data, B = q.basis || I3, o = q.offset;
    if (!d) { low = Math.min(low, o[2]); continue; }
    for (let i = 0; i < d.length; i += 9) low = Math.min(low, B[2] * d[i] + B[5] * d[i + 1] + B[8] * d[i + 2] + o[2]);
  }
  return low;
}
const I3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
let stainMesh = null;
const stain = () => (stainMesh ??= new Mesh().lathe([0, 0, 0], [[1, 0], [1, 0.05], [0, 0.06]], 14, [0.12, 0.05, 0.04]).done());

export class Corpses {
  constructor() { this.list = []; this.alive = new Map(); this.level = null; }

  // Each frame, before drawing: notice who has died since the last frame. `now` in ms.
  update(g, depth, now) {
    if (g.level !== this.level) { this.level = g.level; this.list = []; this.alive = new Map(); }
    const here = new Set();
    for (const e of g.entities) {
      if (e.dead || e.hidden) continue;
      const k = depth.kind(e);
      if (!(k === 'enemy' || k === 'hang' || MACHINES.has(e.ai) || CREATURES.has(e.ai))) continue;
      here.add(e);
      this.alive.set(e, { x: e.x, y: e.y, dir: e.dir, depth: depth.depthOf(e) ?? 0 });
    }
    for (const [e, last] of this.alive) {
      if (here.has(e)) continue;
      this.alive.delete(e);
      if (!(e.hp <= 0)) continue; // gone some other way (a hatching cocoon, a level change), not killed
      if (e.ai === 'ant_ai' && (e.state === 'hanging' || e.state === 'hiding')) continue;
      this.list.push({ e, ...last, t0: now, floor: floorBelow(g, last.x, last.y) });
      if (this.list.length > MAX) this.list.shift();
    }
  }

  // The corpses' parts, posed for this frame. design(s, ctx): the model of a sprite record (models.js).
  parts(g, ctx, design, now) {
    const all = [];
    for (const c of this.list) for (const q of this.partsOf(c, g, ctx, design, now)) all.push({ ...q, e: c.e }); // (the one that died: ?look=TYPE&solo=1 shows its corpse)
    return all;
  }

  partsOf(c, g, ctx, design, now) {
    const out = [];
    {
      const t = Math.min(1, (now - c.t0) / 1000 / SETTLE), fall = t * t; // falling under gravity, then at rest
      const e = c.e;
      const body = Object.assign(Object.create(Object.getPrototypeOf(e)), e, { dead: false, hidden: false, x: c.x, dir: c.dir, depth: c.depth, w: null, a: { ...(e.a || {}) } });
      if (CREATURES.has(e.ai)) {
        // the ant's own dead pose, fallen to the floor
        body.y = lerp(c.y, c.floor, fall);
        body.state = 'dead'; // (the 3D ant's own dead pose, client/ant.js; Abuse's ant has no frames for it)
        body.frame = 0; body.stateTime = 99;
        const img = g.spriteOf(body) || g.spriteOf(e);
        if (!img) return out;
        const parts = (design({ e: body, img, x: body.x - img.xcfg, y: body.y - img.h + 1, flip: body.dir < 0 }, ctx) || []).filter((q) => !q.additive);
        if (!parts.length) return out;
        // the ant's dead pose (belly down, legs splayed), turned a little as it came down
        const id = e.id ?? 0, R = rot(0, 0, (hash(id, 3) - 0.5) * 1.2 * fall);
        const mid = [0, 1, 2].map((k) => parts.reduce((s2, q) => s2 + q.offset[k], 0) / parts.length);
        const turned = parts.map((q) => ({ ...q, basis: mul3(R, q.basis || I3), offset: apply(R, q.offset.map((x, k) => x - mid[k])).map((x, k) => x + mid[k]) }));
        // slumped (squashed to SLUMP of its height, the raised tail too) and sunk a little into the floor
        // (Jared: "drop them into the ground slightly", "sit lower in the ground")
        const k = 1 - (1 - SLUMP) * fall, S = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, k]);
        const base = lowest(turned);
        const slumped = turned.map((q) => ({ ...q, basis: mul3(S, q.basis || I3), offset: [q.offset[0], q.offset[1], base + (q.offset[2] - base) * k] }));
        const lift = -2 * body.y - SINK * fall - lowest(slumped);
        for (const q of slumped) out.push({ ...q, offset: [q.offset[0], q.offset[1], q.offset[2] + lift], bright: (q.bright ?? 1) * 0.8 });
        const r = 14 * Math.min(1, t * 2);
        out.push({ mesh: stain(), basis: new Float32Array([r, 0, 0, 0, r * 0.8, 0, 0, 0, 1]), offset: [2 * c.x, c.depth, -2 * c.floor + 0.3] });
        return out;
      }
      // a machine: its own parts, wrecked
      body.y = c.y; body.state = 'stopped'; body.frame = 0; body.stateTime = 99; body.aistate = 0;
      const img = g.spriteOf(body) || g.spriteOf(e);
      if (!img) return out;
      const parts = (design({ e: body, img, x: body.x - img.xcfg, y: body.y - img.h + 1, flip: body.dir < 0 }, ctx) || []).filter((q) => !q.additive);
      if (!parts.length) return out;
      const mid = [0, 1, 2].map((k) => parts.reduce((s, q) => s + q.offset[k], 0) / parts.length);
      const id = e.id ?? 0;
      if (HANGING.has(e.ai) || ON_WALL.has(e.ai)) {
        // a broken turret: drooping where it hung, one part fallen to the floor
        const R = rot(0, (0.35 + 0.2 * hash(id, 1)) * fall, 0.3 * (hash(id, 2) - 0.5) * fall);
        parts.forEach((q, i) => {
          const drop = i === parts.length - 1;
          const v = q.offset.map((x, k) => x - mid[k]);
          const at = drop ? [mid[0] + 8, mid[1] + 6, lerp(mid[2], -2 * c.floor + 3, fall)] : apply(R, v).map((x, k) => x + mid[k]);
          out.push({ ...q, basis: mul3(drop ? rot(1.2 * fall, 0.6 * fall, 0) : R, q.basis || I3), offset: at, bright: (q.bright ?? 1) * 0.75 });
        });
        return out;
      }
      // toppled over along the hall (on its face or its back), a little twisted; the smaller parts thrown out
      const side = hash(id, 3) < 0.5 ? 1 : -1;
      const R = rot((hash(id, 5) - 0.5) * 0.5 * fall, side * (1.3 + 0.25 * hash(id, 4)) * fall, (hash(id, 6) - 0.5) * 0.9 * fall);
      const main = [], thrown = [];
      parts.forEach((q, i) => {
        const o = apply(R, q.offset.map((x, k) => x - mid[k])).map((x, k) => x + mid[k]);
        const p = { ...q, basis: mul3(R, q.basis || I3), offset: o, bright: (q.bright ?? 1) * 0.8 };
        if (hash(id, 20 + i) < 0.28) { // thrown clear
          const a = hash(id, 40 + i) * Math.PI * 2, r = (14 + 26 * hash(id, 60 + i)) * fall;
          p.offset = [o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r * 0.7, o[2]];
          p.basis = mul3(rot(hash(id, 80 + i) * 3 * fall, hash(id, 90 + i) * 2 * fall, 0), p.basis);
          thrown.push(p);
        } else main.push(p);
      });
      // the wreck comes down onto the floor (its lowest point on it once fallen), and each thrown part lands
      const floorZ = -2 * c.floor + 1, drop = (floorZ - lowest(main)) * fall;
      for (const q of main) { q.offset = [q.offset[0], q.offset[1], q.offset[2] + drop]; out.push(q); }
      for (const q of thrown) { const d = (floorZ - lowest([q])) * fall; q.offset = [q.offset[0], q.offset[1], q.offset[2] + d]; out.push(q); }
    }
    return out;
  }

  // smoke and sparks from fresh wrecks (client/particles.js)
  emit(fx, now) {
    for (const c of this.list) {
      if (CREATURES.has(c.e.ai)) continue;
      const age = (now - c.t0) / 1000;
      if (age > 5 || fx.rnd() > 0.25) continue;
      const pos = [2 * c.x + (fx.rnd() - 0.5) * 16, c.depth + (fx.rnd() - 0.5) * 16, -2 * c.floor + 8];
      fx.puff(pos, 1, [0.22, 0.21, 0.2], { size: [4, 7], grow: 10, life: [1, 1.8], rise: 26, spread: 4, alpha: 0.4 * (1 - age / 5) });
      if (fx.rnd() < 0.3) fx.burst(pos, 4, 30, 110, [[1, 0.95, 0.7], [1, 0.6, 0.2], [0.6, 0.2, 0.05]], { life: [0.15, 0.35], size: [0.6, 1], grav: -300, drag: 1.5 });
    }
  }
}

// the floor under a point (the first solid pixel below it), in level pixels
function floorBelow(g, x, y) {
  let fy = Math.floor(y);
  const limit = fy + 600;
  while (fy < limit && !g.tileSolid(Math.floor(x), fy)) fy++;
  return fy;
}
