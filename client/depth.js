// The depth layer: Abuse in three dimensions on top of WEaBuse's 2D simulation.
//
// The simulation stays the brain. It runs every rule of the game in its
// plane: x along the lane, y down. This layer gives the player and every
// object a third coordinate, depth (Quake Y, in units, 0 = the middle of the
// hall), and decides when two things that meet in the plane also meet in 3D:
//
//   wall   on the back wall: switches, the switch ball, signs, turrets, ant cracks.
//          Reached by walking up to the wall.
//   floor  on the floor at a spot, as deep as they are wide: teleporters, springs.
//   item   at a spot: health, ammo, power-ups.
//   enemy  moves across the hall toward the player: flyers, ants.
//   fx     an effect or anything spawned, at the depth of whatever made it.
//   full   spans the hall: doors, walls, force fields, lifts, lava, boulders,
//          exits, sensors and logic. The simulation alone decides these.
//
// It works through the simulation's own seams: touchesPlayer (pickups,
// teleporters, contact), pressed('action') asked by an object's behaviour
// (switches, lifts, teleporters, exits: only at that object's depth), hurtPlayer (contact damage, judged by the
// behaviour that is running), the behaviours table, updatePlayer (the
// player's shots), tick (enemies moving in depth), spawn (effects), and two
// inert hooks in WEaBuse for shots and blasts (g.apart in weapons.js hitAt and
// game.js explode). With the layer off, the game is exactly WEaBuse's.
//
// Deterministic: only + - * / and Math.sqrt, on state the simulation and the
// recorded input decide.
import { behaviors } from '../sim/web/src/behaviors.js';

const KIND_BY_TYPE = { SWITCH_BALL: 'wall', POINTER: 'wall' };
const KIND_BY_AI = {
  flyer_ai: 'enemy', ant_ai: 'enemy',
  hp_up: 'item', weapon_icon_ai: 'item', fast_ai: 'item', fly_power_ai: 'item', sneaky_power_ai: 'item', health_power_ai: 'item',
  switcher_ai: 'wall', switch_once_ai: 'wall', spray_gun_ai: 'wall', crack_ai: 'wall',
  tp2_ai: 'floor', spring_ai: 'floor',
};
const STEER = { flyer_ai: 8, ant_ai: 4 }; // how fast enemies cross the hall, units per tick (15 a second)

export const PLAYER_HALF = 16; // half the player's depth (Quake's hull)
export const EYE = 25; // the cop's eyes, in pixels above his feet (he is 29 px tall)
const REACH = 72; // how far from the back wall a wall switch can be used
const SPEED = 270; // the player across the hall, units a second (Abuse's run: 9 px a tick = 270 units/s)
const ACCEL = 2400;

// a stable spread in [-1, 1) from two integers
function spread(a, b) {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 2147483648 - 1;
}

export class Depth {
  constructor(g, lane) {
    this.g = g;
    this.lane = lane;
    this.pd = 0; // the player's depth
    this.pv = 0; // and speed across the hall
    this.shotRatio = 0; // the player's aim across the hall: units of depth per pixel along the lane
    this.cur = null; // the object whose behaviour is running
    this.lastShot = null; // the shot last tested for a hit (sparks appear at its depth)
    this.on = false;
  }

  // ---- what and where things are ----

  kind(e) {
    if (e._kind) return e._kind;
    let k = KIND_BY_TYPE[e.type] || KIND_BY_AI[e.ai] || (e.type?.startsWith('POWER_') ? 'item' : 'full');
    if (k === 'full' && e._spawned) k = 'fx';
    return (e._kind = k);
  }

  depthOf(e) {
    const k = this.kind(e);
    if (k === 'full') return null;
    if (k === 'wall') return this.lane - 10;
    if (e.depth === undefined) e.depth = spread(e.id ?? Math.round(e.x), Math.round(e.y)) * (this.lane - 48);
    return e.depth;
  }

  // half of how deep an object is (floor pads are as deep as they are wide)
  halfDepth(e) {
    const k = this.kind(e);
    if (k === 'floor') return 2 * ((this.g.spriteOf(e)?.w || 20) / 2);
    if (k === 'item') return 14;
    return 18;
  }

  // where a shot is across the hall now: it travels in depth in step with its run along the lane
  shotDepth(b) {
    const dx = b.x - b.sx, dy = b.y - b.sy;
    const d = b.d0 + Math.sqrt(dx * dx + dy * dy) * b.ratio;
    return d > this.lane ? this.lane : d < -this.lane ? -this.lane : d;
  }

  // ---- meeting in 3D ----

  // Whether an object is within reach of the player across the hall (for touchesPlayer).
  near(e) {
    const k = this.kind(e);
    if (k === 'full') return true;
    if (k === 'wall') return this.pd >= this.lane - PLAYER_HALF - REACH;
    return Math.abs(this.depthOf(e) - this.pd) < this.halfDepth(e) + PLAYER_HALF;
  }

  // g.apart(src, target): a shot (or a blast) and an object or the player are at
  // different depths, so they do not meet. Called by WEaBuse's hitAt and explode.
  apart(src, target) {
    if (!src || src.d0 === undefined) return false;
    const g = this.g;
    const player = target === g.player;
    if (!player && this.kind(target) === 'full') return false;
    const td = player ? this.pd : this.depthOf(target);
    const half = player ? PLAYER_HALF : this.halfDepth(target);
    const sd = this.shotDepth(src);
    if (src === g.blast) {
      // a blast reaches as far in depth as in the plane: 3D distance, in pixels
      const dx = target.x - src.x, dy = target.y - (player ? 18 : 10) - src.y, dz = Math.max(0, Math.abs(sd - td) - half) / 2;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) >= src.radius;
    }
    this.lastShot = src;
    return Math.abs(sd - td) > half + 4;
  }

  // New shots (g.projs from index `from`) get a depth and a course across the
  // hall: the player's along the view, an enemy's at the player.
  adopt(from, shooter) {
    const g = this.g, p = g.player;
    for (let i = from; i < g.projs.length; i++) {
      const b = g.projs[i];
      if (b.d0 !== undefined) continue;
      b.sx = b.x; b.sy = b.y;
      // the player's shot follows the line of sight, which starts at the eye, not at the muzzle
      if (shooter === 'player') { b.sx = p.x; b.sy = p.y - EYE; b.d0 = this.pd; b.ratio = this.shotRatio; continue; }
      const d0 = shooter ? this.depthOf(shooter) : null;
      b.d0 = d0 === null ? this.pd : d0;
      const dx = p.x - b.x, dy = p.y - 15 - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      b.ratio = dist > 1 ? (this.pd - b.d0) / dist : 0;
    }
  }

  // ---- moving ----

  // The player across the hall, one simulation step: `wish` in [-1, 1].
  movePlayer(wish, dt) {
    const p = this.g.player;
    const want = p.dead ? 0 : wish * SPEED;
    const dv = want - this.pv, max = ACCEL * dt;
    this.pv += dv > max ? max : dv < -max ? -max : dv;
    this.pd += this.pv * dt;
    const lim = this.lane - PLAYER_HALF;
    if (this.pd > lim) { this.pd = lim; this.pv = 0; }
    if (this.pd < -lim) { this.pd = -lim; this.pv = 0; }
  }

  // After each 15 Hz tick: enemies close in across the hall; shots that reach a side wall stop there.
  afterTick() {
    const g = this.g, p = g.player;
    for (const e of g.entities) {
      if (e.dead || this.kind(e) !== 'enemy') continue;
      const d = this.depthOf(e);
      if (Math.abs(e.x - p.x) > 320 || Math.abs(e.y - p.y) > 220) continue;
      const s = STEER[e.ai] || 4, lim = this.lane - 24;
      let nd = d + Math.max(-s, Math.min(s, this.pd - d));
      if (nd > lim) nd = lim;
      if (nd < -lim) nd = -lim;
      e.depth = nd;
    }
    for (const b of g.projs) {
      if (b.d0 !== undefined && !b.dead && b.kind === 'bullet' && Math.abs(this.shotDepth(b)) >= this.lane - 1) b.dead = true;
    }
    this.lastShot = null;
  }

  // ---- installing it into a Game ----

  install() {
    if (this.on) return;
    this.on = true;
    wrapBehaviors();
    const g = this.g, self = this, proto = Object.getPrototypeOf(g);
    g.depth = this;
    g.apart = (a, b) => self.apart(a, b);
    g.touchesPlayer = function (e) { return proto.touchesPlayer.call(this, e) && self.near(e); };
    // an object asking whether the use key is down hears yes only from a player at its depth
    g.pressed = function (name) { return proto.pressed.call(this, name) && !(name === 'action' && self.cur && !self.near(self.cur)); };
    g.hurtPlayer = function (amount) {
      const c = self.cur;
      if (c && self.kind(c) !== 'full' && Math.abs(self.depthOf(c) - self.pd) > self.halfDepth(c) + PLAYER_HALF + 8) return;
      return proto.hurtPlayer.call(this, amount);
    };
    g.updatePlayer = function (dt) { const n = this.projs.length; proto.updatePlayer.call(this, dt); self.adopt(n, 'player'); };
    g.tick = function () { proto.tick.call(this); self.afterTick(); };
    g.spawn = function (type, x, y) {
      const e = proto.spawn.call(this, type, x, y);
      if (e) {
        e._spawned = true;
        // at the depth of what made it: a blast, the shot that just hit, the object acting, or the player
        const src = this.blast?.d0 !== undefined ? this.blast : self.lastShot;
        const cd = self.cur ? self.depthOf(self.cur) : null;
        e.depth = src ? self.shotDepth(src) : cd !== null ? cd : self.pd;
      }
      return e;
    };
  }

  uninstall() {
    if (!this.on) return;
    this.on = false;
    const g = this.g;
    for (const k of ['apart', 'touchesPlayer', 'pressed', 'hurtPlayer', 'updatePlayer', 'tick', 'spawn']) delete g[k];
    g.depth = null;
  }
}

// The behaviours table is shared by every Game: each behaviour is wrapped once
// so that, in a game with the depth layer on, the layer knows whose behaviour is
// running (for contact damage and spawns) and gives that object's new shots a course.
let wrapped = false;
function wrapBehaviors() {
  if (wrapped) return;
  wrapped = true;
  for (const name of Object.keys(behaviors)) {
    const fn = behaviors[name];
    behaviors[name] = function (e, g) {
      const d = g.depth;
      if (!d) return fn(e, g);
      const n = g.projs.length;
      d.cur = e;
      try { return fn(e, g); } finally { d.cur = null; d.adopt(n, e); }
    };
  }
}
