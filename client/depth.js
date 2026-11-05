// The depth layer: Abuse in three dimensions on top of WEaBuse's 2D simulation.
//
// The simulation stays the brain. It runs every rule of the game in its
// plane: x along the lane, y down. This layer gives the player and every
// object a third coordinate, depth (Quake Y, in units, 0 = the middle of the
// hall), and decides when two things that meet in the plane also meet in 3D:
//
//   wall   on the back wall: switches, the switch ball, signs, save terminals, turrets, ant cracks.
//          Reached by walking up to the wall.
//   floor  on the floor at a spot, as deep as they are wide: teleporters, springs, exits, pods, the beam.
//   item   at a spot: health, ammo, power-ups.
//   enemy  moves across the hall toward the player: flyers, ants.
//   fx     an effect or anything spawned, at the depth of whatever made it.
//   door   a door its own size, in a doorway: frame walls close the rest of
//          the hall there (3D conversion rule 3).
//   lift   a lift its own size, in a shaft with walls around it.
//   hatch  a trap door its own size, in a hole in the floor: the rest of the
//          hole is floor you can stand on (and bump your head on).
//   full   spans the hall: breakable walls, force fields, lava, boulders,
//          exits, sensors and logic. The simulation alone decides these.
//
// Doors and lifts make *zones*: rectangles in the plane where the hall is
// closed except for the opening. The player can only be in a zone at the
// opening's depth (walking in beside it is undone), enemies keep to it, and
// shots that reach a frame wall stop there.
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
// recorded input decide (an ant's spit from the wall aims as the simulation's
// own antSpit does).
//
// One move is the layer's own (a Jared rule): an ant runs up the side walls of
// the hall. Besides Abuse's leap to the roof, an ant running at the player
// may leap onto the nearer side wall, cling there and scuttle along it towards
// the player, spit from it, and spring off it at the player. See wallRun.
import { behaviors } from '../sim/web/src/behaviors.js';
import { enemyFire } from '../sim/web/src/weapons.js';

const KIND_BY_TYPE = {
  SWITCH_BALL: 'wall', POINTER: 'wall', RESTART_POSITION: 'wall', // on the back wall: a target, a sign, a save terminal
  NEXT_LEVEL: 'floor', NEXT_LEVEL_TOP: 'floor', TELE_BEAM: 'floor', TP_DOOR: 'floor', // at a spot: exits, the beam, the pod
};
const KIND_BY_AI = {
  flyer_ai: 'enemy', ant_ai: 'enemy',
  sdoor_ai: 'door', platform_ai: 'lift', strap_door_ai: 'hatch',
  hp_up: 'item', weapon_icon_ai: 'item', fast_ai: 'item', fly_power_ai: 'item', sneaky_power_ai: 'item', health_power_ai: 'item',
  switcher_ai: 'wall', switch_once_ai: 'wall', spray_gun_ai: 'wall', crack_ai: 'wall',
  tp2_ai: 'floor', spring_ai: 'floor',
};
const STEER = { flyer_ai: 8, ant_ai: 4 }; // how fast enemies cross the hall, units per tick (15 a second)
// the ants' wall run, in ticks (15 a second) and pixels: the leap onto the wall, the longest cling, the
// least time between runs, the highest it climbs, how far off the wall its body is (units), its spring
const FLANK = 90, FLANK_NEAR = 110, SPACING = 44; // units, pixels, units (see afterTick)
const WALL_LEAP = 6, WALL_CLING = 40, WALL_COOL = 90, WALL_UP = 40, WALL_OFF = 18, SPRING_STEER = 22;

export const PLAYER_HALF = 16; // half the player's depth (Quake's hull)
export const EYE = 25; // the cop's eyes, in pixels above his feet (he is 29 px tall)
const REACH = 72; // how far from the back wall a wall switch can be used
const DOOR_HALF = 48; // a doorway is 96 units across the hall
const LIFT_HALF = 60; // a lift is as deep as it is wide: 120 units
const FITTED = new Set(['door', 'lift', 'hatch']); // things their own size, in a zone
const HALF_W = 6, BODY_H = 29; // the player's box in the plane (game.js)
const SPEED = 270; // the player across the hall, units a second (Abuse's run: 9 px a tick = 270 units/s)
const ACCEL = 2400;

// Jared rule (README): in first person the player's bullets fly BULLET_SPEEDUP times faster, with the
// same reach. weapons.js sgun_ai: each tick the speed grows to trunc(speed * 6 / 5) and the bullet moves
// that far, until its life runs out; the life is cut to the fewest ticks that cover the old reach.
export const BULLET_SPEEDUP = 2.5;
function reach(speed, ticks) { let d = 0; for (let i = 0; i < ticks; i++) { speed = Math.trunc((speed * 6) / 5); d += speed; } return d; }
function quicken(b) {
  const want = reach(b.speed, b.life);
  b.speed = Math.round(b.speed * BULLET_SPEEDUP);
  let n = 1;
  while (n < b.life && reach(b.speed, n) < want) n++;
  b.life = n;
}

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
    if (FITTED.has(k)) return this.zoneOf(e)?.c ?? 0;
    if (k === 'wall') return this.lane - 10;
    // the exit machine hangs over its pad: it takes the pad's place (its first link, level file)
    if (e.type === 'NEXT_LEVEL_TOP' && e.links?.[0] && e.links[0] !== e) return this.depthOf(e.links[0]);
    // an exit's beam stands on its pad (the level puts it a few pixels from the pad)
    if (e.type === 'TELE_BEAM') { const pad = this.padOf(e); if (pad) return this.depthOf(pad); }
    if (e.depth === undefined) e.depth = spread(e.id ?? Math.round(e.x), Math.round(e.y)) * (this.lane - 48);
    return e.depth;
  }

  // the exit pad an exit beam stands on, if any
  padOf(e) {
    if (e._pad !== undefined) return e._pad;
    return (e._pad = this.g.entities.find((q) => q.type === 'NEXT_LEVEL' && Math.abs(q.x - e.x) < 20 && Math.abs(q.y - e.y) < 20) || null);
  }

  // half of how deep an object is (floor pads are as deep as they are wide)
  halfDepth(e) {
    const k = this.kind(e);
    if (FITTED.has(k)) return this.zoneOf(e)?.h ?? DOOR_HALF;
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
    if (FITTED.has(k)) { const z = this.zoneOf(e); return !z || Math.abs(this.pd - z.c) <= z.h - PLAYER_HALF + 1; }
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
      if (shooter === 'player') {
        b.sx = p.x; b.sy = p.y - EYE; b.d0 = this.pd; b.ratio = this.shotRatio;
        if (b.kind === 'bullet') quicken(b);
        continue;
      }
      const d0 = shooter ? this.depthOf(shooter) : null;
      b.d0 = d0 === null ? this.pd : d0;
      const dx = p.x - b.x, dy = p.y - 15 - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      b.ratio = dist > 1 ? (this.pd - b.d0) / dist : 0;
    }
  }

  // ---- doorways and shafts ----

  // The zones of the current level, made once per level from its doors and lifts.
  zones() {
    const g = this.g;
    if (this._zonesFor === g.level) return this._zones;
    this._zonesFor = g.level;
    const out = [];
    for (const e of g.entities) {
      const k = this.kind(e);
      if (k === 'door') {
        const r = g.rectOf(e);
        if (!r) continue;
        const h = DOOR_HALF;
        out.push({ e, kind: k, x0: r.x0 - 2, x1: r.x1 + 2, y0: r.y0, y1: r.y1, h, c: spread(e.id ?? 0, 7) * (this.lane - h - 24) });
      } else if (k === 'hatch') {
        // a trap door: a hole in the floor as wide as the closed hatch, as deep across the hall as it is wide
        const r = g.rectOf(e);
        if (!r) continue;
        const h = Math.max(40, r.x1 - r.x0 + 1);
        out.push({ e, kind: k, floor: true, x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, h, c: spread(e.id ?? 0, 13) * (this.lane - h - 24) });
      } else if (k === 'lift') {
        const r = g.deckRect(e);
        if (!r) continue;
        // the shaft: the deck's run between its stops (its first two links, platform.lsp),
        // with room above the top stop for a rider standing on it
        const stops = [e.y, ...e.links.slice(0, 2).map((l) => l.y)];
        const above = e.y - r.y0, below = r.y1 - e.y;
        const y0 = Math.min(...stops) - above - BODY_H - 2, y1 = Math.max(...stops) + below;
        const xs = [e.x, ...e.links.slice(0, 2).map((l) => l.x)];
        const x0 = r.x0 + Math.min(...xs) - e.x, x1 = r.x1 + Math.max(...xs) - e.x;
        const h = LIFT_HALF;
        out.push({ e, kind: k, x0, x1, y0, y1, h, c: spread(e.id ?? 0, 11) * (this.lane - h - 24) });
      }
    }
    // A doorway or shaft beside something used on the back wall (a switch, a save terminal) opens against
    // the back wall, or the frame walls would keep the player from reaching it (level 2's switch beside a lift).
    const used = g.entities.filter((q) => this.kind(q) === 'wall' && (/switch/.test(q.ai || '') || q.ai === 'restart_ai'));
    for (const z of out) {
      if (used.some((q) => q.x >= z.x0 - 24 && q.x <= z.x1 + 24 && q.y >= z.y0 - 16 && q.y <= z.y1 + 16)) { z.back = true; z.c = this.lane - z.h; } // flush with it: no frame in front of the switch
    }
    // Doorways and shafts that touch (a double door, a door beside a shaft) share one opening,
    // or no depth would get through both: each group takes the opening of its first member, or of one
    // that opens against the back wall.
    const near = (a, b) => a.x0 - 40 <= b.x1 && b.x0 - 40 <= a.x1 && a.y0 - 40 <= b.y1 && b.y0 - 40 <= a.y1;
    const group = out.map((_, i) => i);
    for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < i; j++) if (near(out[i], out[j])) { group[i] = group[j]; break; }
    }
    for (let i = 0; i < out.length; i++) {
      const members = out.filter((_, k) => group[k] === i);
      if (members.length < 2) continue;
      const h = Math.min(...members.map((z) => z.h)), back = members.some((z) => z.back);
      const c = back ? this.lane - h : members[0].c;
      for (const z of members) z.c = Math.max(-this.lane + h + 24, Math.min(this.lane - h - (back ? 0 : 24), c));
    }
    this._zones = out;
    return out;
  }

  zoneOf(e) { return this.zones().find((z) => z.e === e) || null; }

  // the zones the player's box overlaps, standing at (x, y)
  zonesAt(x, y) {
    return this.zones().filter((z) => x + HALF_W >= z.x0 && x - HALF_W <= z.x1 && y >= z.y0 && y - BODY_H <= z.y1);
  }

  // the depths the player may take inside zone z: the opening, less the player's own half
  openFor(z) { return [z.c - z.h + PLAYER_HALF, z.c + z.h - PLAYER_HALF]; }

  // After the simulation moves the player: inside a zone they must be at its opening.
  // Coming in beside the opening is undone (the frame wall stops them).
  enforce() {
    const p = this.g.player;
    const bad = this.zonesAt(p.x, p.y).find((z) => { const [a, b] = this.openFor(z); return this.pd < a - 0.01 || this.pd > b + 0.01; });
    if (!bad) { this._legal = { x: p.x, y: p.y }; return; }
    const L = this._legal;
    if (!L) return;
    if (bad.floor && L.y <= bad.y0 + 1 && p.y > L.y) {
      // dropping onto the floor around a hatch: it holds (like ground under the feet)
      p.y = L.y; p.vy = 0; p.ground = true;
      return;
    }
    if (bad.floor && L.y - BODY_H >= bad.y1 && p.y < L.y) { p.y = L.y; p.vy = 0; return; } // a head against it from below
    p.x = L.x; p.vx = 0;
    if (this.zonesAt(p.x, p.y).includes(bad)) { p.y = L.y; p.vy = 0; }
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
    // in a doorway or a shaft, the frame walls stop the move across
    for (const z of this.zonesAt(p.x, p.y)) {
      const [a, b] = this.openFor(z);
      if (this.pd < a) { this.pd = a; this.pv = 0; }
      if (this.pd > b) { this.pd = b; this.pv = 0; }
    }
  }

  // After each 15 Hz tick: enemies close in across the hall; shots that reach a side wall stop there.
  // Each enemy closes in on its own flank of the player (FLANK: up to that far either side, by its id),
  // narrowing to the player's own depth as it comes within FLANK_NEAR pixels along the hall, so a pack
  // spreads across the hall rather than coming in single file. And enemies close together in the plane
  // keep SPACING apart across it (Jared: "they should be spaced out more").
  afterTick() {
    const g = this.g, p = g.player, pack = [];
    for (const e of g.entities) {
      if (e.dead || this.kind(e) !== 'enemy') continue;
      if (e.w) continue; // an ant on a wall: wallRun has it
      const d = this.depthOf(e);
      if (Math.abs(e.x - p.x) > 320 || Math.abs(e.y - p.y) > 220) continue;
      if (e.ai === 'ant_ai' && (e.state === 'hanging' || e.state === 'hiding')) continue; // a cocoon stays where it hangs
      if (e.wSpring && e.a?.st !== 'jump') e.wSpring = false;
      const s = e.wSpring ? SPRING_STEER : STEER[e.ai] || 4;
      const ax = Math.abs(e.x - p.x), flank = e.wSpring ? 0 : spread(e.id ?? 0, 17) * FLANK * (ax >= FLANK_NEAR ? 1 : ax / FLANK_NEAR);
      const want = this.pd + flank;
      e.depth = d + Math.max(-s, Math.min(s, want - d));
      pack.push(e);
    }
    // spacing: each pair close in the plane is pushed apart across the hall (in the order of the level's objects)
    for (let i = 0; i < pack.length; i++) {
      for (let j = i + 1; j < pack.length; j++) {
        const a = pack[i], b = pack[j];
        if (Math.abs(a.x - b.x) > 30 || Math.abs(a.y - b.y) > 30) continue;
        const gap = b.depth - a.depth, need = SPACING - Math.abs(gap);
        if (need <= 0) continue;
        const push = Math.min(need / 2, 6), dir = gap > 0 || (gap === 0 && (a.id ?? 0) < (b.id ?? 0)) ? 1 : -1;
        a.depth -= dir * push; b.depth += dir * push;
      }
    }
    const lim = this.lane - 24;
    for (const e of pack) {
      let nd = e.depth;
      if (nd > lim) nd = lim;
      if (nd < -lim) nd = -lim;
      for (const z of this.zones()) { // enemies pass doorways and shafts at the opening too
        if (e.x < z.x0 || e.x > z.x1 || e.y < z.y0 || e.y > z.y1 + 30) continue;
        nd = Math.max(z.c - z.h + 18, Math.min(z.c + z.h - 18, nd));
      }
      e.depth = nd;
    }
    for (const b of g.projs) {
      if (b.d0 === undefined || b.dead) continue;
      const sd = this.shotDepth(b);
      if (b.kind === 'bullet' && Math.abs(sd) >= this.lane - 1) { b.dead = true; continue; }
      for (const z of this.zones()) { // a shot that reaches a frame wall stops there
        if (b.x >= z.x0 && b.x <= z.x1 && b.y >= z.y0 && b.y <= z.y1 && (sd < z.c - z.h || sd > z.c + z.h)) { b.dead = true; break; }
      }
    }
    this.lastShot = null;
  }

  // ---- the ants' wall run (a Jared rule: 3D only) ----

  // An ant's tick, before its own behaviour: true when the wall run has it (its behaviour does not run).
  // Running at the player on the floor, now and then it leaps onto the nearer side wall of the hall
  // (e.w.phase 'leap'), clings there a little way up and scuttles along it towards the player, spitting
  // ('cling'), then springs off it at the player: its own jump, crossing the hall fast (e.wSpring). It
  // springs when the player is under it, when it is shot (the dodge flag the hit sets), when its way along
  // is blocked, or when it has clung long enough.
  wallRun(e) {
    const g = this.g, p = g.player, a = e.a, w = e.w;
    if (e.hp <= 0) { e.w = null; return false; } // dying: its behaviour sees to that
    if (!w) {
      if (e.wcd > 0) { e.wcd--; return false; }
      return this.wallStart(e);
    }
    const dx = p.x - e.x, wallD = w.side * (this.lane - WALL_OFF);
    w.t++;
    if (w.phase === 'leap') {
      const f = w.t / WALL_LEAP, k = f * f * (3 - 2 * f);
      e.depth = w.d0 + (wallD - w.d0) * k;
      e.y = w.y0 - Math.round(w.h * k);
      if (w.t >= WALL_LEAP) { w.phase = 'cling'; w.t = 0; e.setState('top_walk'); }
      return true;
    }
    // on the wall
    e.depth = wallD;
    if (e.state === 'ceil_fire') { // spitting
      if (!e.nextPicture()) { this.spit(e); e.setState('top_walk'); }
      return true;
    }
    if (a.dodge || w.t > WALL_CLING || Math.abs(dx) < 56) return this.spring(e);
    if ((dx < 0 && e.dir > 0) || (dx > 0 && e.dir < 0)) { e.dir = -e.dir; return true; }
    if (w.t > 4 && Math.abs(dx) < 180 && this.chance(e, 9) < 0.12) { e.setState('ceil_fire'); return true; }
    const nx = e.x + e.dir * 5;
    if (!g.solidAt(nx, e.y) && !g.solidAt(nx, e.y - 31) && g.sees(e.x, e.y - 15, nx, e.y - 15)) { e.x = nx; e.nextPicture(); }
    else return this.spring(e);
    return true;
  }

  // a number in [0, 1) for this ant on this tick (not the simulation's random numbers, which stay its own)
  chance(e, salt) { return (spread(this.g.tickCount || 0, (e.id ?? 0) * 31 + salt) + 1) / 2; }

  wallStart(e) {
    const g = this.g, p = g.player, a = e.a;
    if (a.st !== 'running' || (e.state !== 'running' && e.state !== 'stopped')) return false;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) > 240 || Math.abs(dy) > 60) return false;
    if (this.chance(e, 5) >= 0.08) return false;
    if (!g.solidAt(e.x, e.y + 1) || this.zonesAt(e.x, e.y).length) return false; // on the floor, not in a doorway or shaft
    let h = 0; // as high as the room allows, up to WALL_UP
    while (h < WALL_UP && !g.solidAt(e.x, e.y - h - 32)) h++;
    if (h < 16) return false;
    const d0 = this.depthOf(e);
    e.w = { phase: 'leap', t: 0, side: d0 >= 0 ? 1 : -1, d0, y0: e.y, h };
    e.vx = 0; e.vy = 0;
    e.setState('run_jump');
    g.sound('antslash', e.x, e.y);
    return true;
  }

  spring(e) {
    const a = e.a, dx = this.g.player.x - e.x;
    e.w = null; e.wcd = WALL_COOL; e.wSpring = true;
    a.dodge = 0;
    if (dx) e.dir = dx > 0 ? 1 : -1;
    e.vx = e.dir * Math.max(2, Math.min(14, Math.trunc(Math.abs(dx) / 9))); e.vy = -5; // at the player, not past them (it flies about 9 ticks from the wall)
    e.setState('run_jump'); a.st = 'jump'; // its own jump (ant_ai 'jump') carries it down
    return true;
  }

  // ant.cpp fire_at_player, as the simulation's antSpit: from 15 px ahead and up, at where the player will be
  spit(e) {
    const g = this.g, p = g.player;
    const fx = e.x + e.dir * 15, fy = e.y - 15;
    const tx = p.x + (p.vx / 15) * 8, ty = p.y - 15 + (p.vy / 15) * 2;
    if (!g.sees(e.x, e.y - 15, fx, fy) || !g.sees(fx, fy, tx, ty)) return;
    let angle = (Math.atan2(fy - ty, tx - fx) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    enemyFire(g, e.aitype, fx, fy, angle);
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
    g.updatePlayer = function (dt) { const n = this.projs.length; proto.updatePlayer.call(this, dt); self.adopt(n, 'player'); self.enforce(); };
    g.tick = function () { proto.tick.call(this); self.afterTick(); self.enforce(); };
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
      try { return name === 'ant_ai' && d.wallRun(e) ? true : fn(e, g); } finally { d.cur = null; d.adopt(n, e); }
    };
  }
}
