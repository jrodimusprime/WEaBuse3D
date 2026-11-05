// Quake-style particles for the weapons (presentation only: reads the simulation, changes nothing).
//
// Quake draws what flies and what blows up with particles: a rocket leaves a trail of fire turning to smoke
// (R_RocketTrail), a grenade a trail of smoke, an explosion throws out a burst of embers that cool through
// yellow, orange and red as they fall (R_ParticleExplosion, its ramp1/ramp2), and a bullet striking a wall
// kicks up sparks and dust (R_RunParticleEffect). Here the same, read off the simulation each frame:
//   shots      trails behind rockets (fire, then smoke), grenades (smoke), frisbees (blue sparks and smoke),
//              enemy bolts (sparks of their colour); sparkles along plasma and saber lines while they last
//   effects    the moment an explosion (EXPLODE1/4/6/8) appears: embers, a flash and smoke; an impact
//              (EXPLODE3/5/7): sparks and a puff
// Glowing particles are drawn as soft additive discs (renderer glows); smoke as soft alpha discs (smoke).
// Deterministic for a given run (its own seeded random numbers), so screenshots repeat.

const MAX = 4000;
// Quake's explosion ramps (r_part.c ramp1, ramp2) as colours: white-yellow, through orange and red, to dark
const RAMP = [[1, 0.95, 0.7], [1, 0.82, 0.38], [1, 0.62, 0.18], [0.95, 0.42, 0.1], [0.75, 0.22, 0.05], [0.45, 0.1, 0.03], [0.2, 0.05, 0.02]];
const rampAt = (ramp, t) => {
  const x = Math.min(0.999, Math.max(0, t)) * (ramp.length - 1), i = Math.floor(x), f = x - i;
  return ramp[i].map((v, k) => v + (ramp[i + 1][k] - v) * f);
};
const PLASMA = [[1, 0.9, 1], [1, 0.55, 1], [0.8, 0.3, 0.85], [0.4, 0.12, 0.45]];
const SABER = [[1, 1, 1], [0.75, 0.8, 1], [0.45, 0.5, 0.8]];
const DISC = [[0.9, 0.97, 1], [0.55, 0.8, 1], [0.25, 0.45, 0.9]];
const SPARK = [[1, 0.97, 0.8], [1, 0.75, 0.35], [0.9, 0.4, 0.1]];
const BLOOD = [[1, 0.6, 0.3], [0.9, 0.25, 0.08], [0.5, 0.06, 0.03]];
const ACID = [[0.85, 1, 0.6], [0.45, 0.9, 0.3], [0.15, 0.45, 0.1]];

export class ShotFx {
  constructor(seed = 12345) {
    this.p = [];
    this.seen = new WeakSet(); // effects already burst
    this.last = new WeakMap(); // each shot's position last frame, in 3D
    this.seed = seed >>> 0 || 1;
  }

  rnd() { // mulberry32
    let t = (this.seed = (this.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  sphere(speed) { // a random direction, scaled
    const z = this.rnd() * 2 - 1, a = this.rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [Math.cos(a) * r * speed, Math.sin(a) * r * speed, z * speed];
  }
  add(q) { if (this.p.length < MAX) this.p.push({ age: 0, drag: 0, grav: 0, grow: 0, ...q }); }

  // embers: n glowing particles from pos, at speeds lo..hi, cooling down `ramp` over their lives
  burst(pos, n, lo, hi, ramp, { life = [0.4, 1], size = [1.2, 2.6], grav = -260, drag = 2.2, up = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const v = this.sphere(lo + this.rnd() * (hi - lo));
      v[2] += up;
      this.add({ pos: pos.slice(), vel: v, life: life[0] + this.rnd() * (life[1] - life[0]), size: size[0] + this.rnd() * (size[1] - size[0]), ramp, glow: true, grav, drag });
    }
  }
  puff(pos, n, rgb, { size = [5, 10], grow = 14, life = [0.8, 1.6], rise = 22, spread = 12, alpha = 0.45 } = {}) {
    for (let i = 0; i < n; i++) {
      const v = this.sphere(spread * this.rnd());
      v[2] += rise;
      this.add({ pos: pos.map((c, k) => c + (this.rnd() - 0.5) * 6 * (k === 1 ? 1 : 1)), vel: v, life: life[0] + this.rnd() * (life[1] - life[0]), size: size[0] + this.rnd() * (size[1] - size[0]), grow, rgb, alpha, drag: 1.2 });
    }
  }

  // One frame: emit from what is flying and what has just appeared, then move everything on.
  // at(b): a shot's position in 3D (with its course across the hall); depthOf(e): an effect's depth.
  update(g, at, depthOf, dt) {
    dt = Math.min(dt, 0.05);
    for (const b of g.projs) {
      const cur = at(b, b.x, b.y);
      const prev = this.last.get(b) || cur;
      this.last.set(b, cur);
      const d = [cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]], len = Math.hypot(...d);
      const along = (step, fn) => { const n = Math.min(24, Math.max(1, Math.floor(len / step))); for (let i = 0; i < n; i++) { const t = (i + this.rnd()) / n; fn([prev[0] + d[0] * t, prev[1] + d[1] * t, prev[2] + d[2] * t]); } };
      if (b.kind === 'rocket') {
        along(3, (p) => {
          this.add({ pos: p, vel: this.sphere(14), life: 0.18 + this.rnd() * 0.14, size: 1.6 + this.rnd(), ramp: RAMP, glow: true, drag: 3 });
          if (this.rnd() < 0.5) this.add({ pos: p, vel: [0, 0, 8 + this.rnd() * 10], life: 0.9 + this.rnd() * 0.6, size: 2.5, grow: 9, rgb: [0.42, 0.41, 0.4], alpha: 0.4, drag: 1 });
        });
      } else if (b.kind === 'grenade') {
        along(5, (p) => this.add({ pos: p, vel: [0, 0, 6 + this.rnd() * 6], life: 0.6 + this.rnd() * 0.4, size: 1.8, grow: 6, rgb: [0.5, 0.5, 0.49], alpha: 0.35, drag: 1 }));
      } else if (b.kind === 'disc') {
        along(4, (p) => {
          this.add({ pos: p, vel: this.sphere(20), life: 0.25 + this.rnd() * 0.2, size: 1.2, ramp: DISC, glow: true, drag: 3 });
          if (this.rnd() < 0.3) this.add({ pos: p, vel: [0, 0, 6], life: 0.8, size: 2, grow: 7, rgb: [0.55, 0.57, 0.6], alpha: 0.3, drag: 1 });
        });
      } else if (b.kind === 'beam' && !b.pending) {
        const a = at(b, b.ox, b.oy), e = cur, D = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
        const n = b.style === 'saber' ? 3 : 4;
        for (let i = 0; i < n; i++) {
          const t = this.rnd();
          this.add({ pos: [a[0] + D[0] * t, a[1] + D[1] * t, a[2] + D[2] * t], vel: this.sphere(30), life: 0.2 + this.rnd() * 0.2, size: 1 + this.rnd() * 0.8, ramp: b.style === 'saber' ? SABER : PLASMA, glow: true, drag: 3 });
        }
      } else if (b.kind === 'plasma' || b.kind === 'acid' || b.kind === 'spark') {
        const ramp = b.kind === 'acid' ? ACID : b.kind === 'spark' ? SPARK : PLASMA;
        along(5, (p) => this.add({ pos: p, vel: this.sphere(10), life: 0.2, size: 1.3, ramp, glow: true, drag: 2 }));
      }
    }
    for (const e of g.entities) {
      if (e.dead || this.seen.has(e) || !/^EXPLODE[1-8]$/.test(e.type || '')) continue;
      this.seen.add(e);
      const pos = [2 * e.x, depthOf(e), -2 * e.y];
      const n = +e.type[7];
      const flame = n === 1 && g.projs.some((b) => b.kind === 'firebomb' && Math.abs(b.x - e.x) < 30 && Math.abs(b.y - e.y) < 40);
      if (flame) { // a fire bomb's flames, every tick it burns: tongues of fire rising, a little smoke
        this.burst(pos, 8, 15, 70, RAMP.slice(1), { life: [0.25, 0.55], size: [1.2, 2.2], grav: 120, drag: 2.5, up: 55 });
        if (this.rnd() < 0.5) this.puff(pos, 2, [0.25, 0.24, 0.23], { size: [6, 10], grow: 16, life: [0.9, 1.5], rise: 40, spread: 10, alpha: 0.45 });
      } else if (n === 1 || n === 4 || n === 6 || n === 8) { // an explosion
        const big = n === 1 ? 1 : n === 8 ? 0.9 : 0.7;
        const ramp = n === 8 ? [[1, 1, 1], ...RAMP.slice(1)] : RAMP;
        this.burst(pos, Math.round(70 * big), 60, 300 * big, ramp, { life: [0.45, 1.1], size: [1.4, 3], up: 40 });
        this.add({ pos: pos.slice(), vel: [0, 0, 0], life: 0.16, size: 46 * big, ramp: [[1, 0.95, 0.75], [1, 0.6, 0.2]], glow: true }); // the flash
        this.puff(pos, Math.round(8 * big), [0.3, 0.29, 0.28], { size: [8, 14], grow: 22, life: [1.2, 2.2], rise: 30, spread: 30, alpha: 0.5 });
      } else if (n === 5) { // a shot on a wall: sparks and dust
        this.burst(pos, 12, 40, 160, SPARK, { life: [0.15, 0.4], size: [0.8, 1.4], grav: -300, drag: 2 });
        this.puff(pos, 3, [0.45, 0.42, 0.38], { size: [3, 5], grow: 8, life: [0.5, 0.9], rise: 10, spread: 14, alpha: 0.4 });
      } else if (n === 3 || n === 2) { // a hit on something
        this.burst(pos, 14, 50, 180, n === 3 ? BLOOD : SPARK, { life: [0.2, 0.5], size: [1, 1.8], grav: -320, drag: 2 });
      } else if (n === 7) {
        this.burst(pos, 10, 40, 140, DISC, { life: [0.15, 0.35], size: [0.8, 1.4], drag: 2 });
      }
    }
    // move on
    const out = [];
    for (const q of this.p) {
      q.age += dt;
      if (q.age >= q.life) continue;
      const k = Math.max(0, 1 - q.drag * dt);
      q.vel[0] *= k; q.vel[1] *= k; q.vel[2] = q.vel[2] * k + q.grav * dt;
      q.pos[0] += q.vel[0] * dt; q.pos[1] += q.vel[1] * dt; q.pos[2] += q.vel[2] * dt;
      q.size += q.grow * dt;
      out.push(q);
    }
    this.p = out;
  }

  // What to draw: glows (additive soft discs) and smoke (soft alpha discs)
  draws() {
    const glows = [], smoke = [];
    for (const q of this.p) {
      const t = q.age / q.life;
      if (q.glow) glows.push({ pos: q.pos, size: q.size, rgb: rampAt(q.ramp, t), intensity: 1.6 * (1 - t * t) });
      else smoke.push({ pos: q.pos, size: q.size, rgb: q.rgb, intensity: q.alpha * (1 - t) * Math.min(1, t * 6) });
    }
    return { glows, smoke };
  }
}
