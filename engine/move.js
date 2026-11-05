// The player's walking physics: a port of Quake's server-side movement for a
// MOVETYPE_WALK client, run on a fixed tick.
//
//   sv_user.c  SV_ClientThink, SV_AirMove, SV_UserFriction, SV_Accelerate, SV_AirAccelerate
//   sv_phys.c  SV_Physics_Client, SV_CheckVelocity, SV_AddGravity, SV_CheckStuck,
//              SV_WalkMove, SV_FlyMove, ClipVelocity, SV_PushEntity, SV_TryUnstick, SV_WallFriction
//   client.qc  PlayerPreThink / PlayerJump (the jump lives in QuakeC)
//
// Every step is + - * / or sqrt (all exactly specified in JavaScript), and
// angles go through detmath.js, so a run of commands gives the same result
// in every engine.
import { traceBox, boxInSolid } from './trace.js';
import { angleVectors } from './detmath.js';

export const TICK_HZ = 60; // the walk tick; see LOOP_LOG (M0 T9)
export const FRAMETIME = 1 / TICK_HZ;

// cvars, Quake's defaults
export const CVARS = {
  sv_gravity: 800, sv_friction: 4, sv_stopspeed: 100, sv_maxspeed: 320, sv_accelerate: 10,
  edgefriction: 2, sv_maxvelocity: 2000, cl_forwardspeed: 200, cl_backspeed: 200, cl_sidespeed: 350,
  cl_movespeedkey: 2,
};

const STOP_EPSILON = 0.1;
const STEPSIZE = 18;
const MAX_CLIP_PLANES = 5;
export const PLAYER_MINS = [-16, -16, -24];
export const PLAYER_MAXS = [16, 16, 32];
export const VIEW_HEIGHT = 22; // DEFAULT_VIEWHEIGHT

const FL_ONGROUND = 512, FL_JUMPRELEASED = 4096;

export function newPlayer(origin, yaw = 0) {
  return { origin: origin.slice(), oldorigin: origin.slice(), velocity: [0, 0, 0], flags: FL_JUMPRELEASED, angles: [0, yaw, 0], vAngle: [0, yaw, 0] };
}

// One command: {forward, side, jump, pitch, yaw} with forward/side in units/s
// (cl_input.c CL_BaseMove) and angles in detmath units.
export function makeCommand({ fwd = 0, back = 0, left = 0, right = 0, run = false, jump = false, pitch = 0, yaw = 0 }) {
  const c = CVARS;
  let forward = c.cl_forwardspeed * fwd - c.cl_backspeed * back;
  let side = c.cl_sidespeed * right - c.cl_sidespeed * left;
  if (run) { forward *= c.cl_movespeedkey; side *= c.cl_movespeedkey; }
  return { forward, side, jump: !!jump, pitch, yaw };
}

// One tick for the player: SV_ClientThink then SV_Physics_Client.
export function playerTick(world, p, cmd) {
  // SV_ClientThink: angles from the command; the body pitches a third of the view
  const pitch = ((cmd.pitch + 32768) & 0xffff) - 32768; // signed, so a third of it is a third
  p.vAngle = [pitch, cmd.yaw, 0];
  p.angles = [Math.trunc(-pitch / 3), cmd.yaw, 0];
  airMove(world, p, cmd);

  // SV_Physics_Client, MOVETYPE_WALK: PlayerPreThink (jump), gravity, unstick, walk
  if (cmd.jump) playerJump(p); else p.flags |= FL_JUMPRELEASED;
  checkVelocity(p);
  p.velocity[2] -= CVARS.sv_gravity * FRAMETIME;
  checkStuck(world, p);
  walkMove(world, p);
}

function playerJump(p) {
  if (!(p.flags & FL_ONGROUND)) return;
  if (!(p.flags & FL_JUMPRELEASED)) return; // don't pogo stick
  p.flags &= ~FL_JUMPRELEASED;
  p.flags &= ~FL_ONGROUND;
  p.velocity[2] += 270;
}

function checkVelocity(p) {
  for (let i = 0; i < 3; i++) {
    if (p.velocity[i] > CVARS.sv_maxvelocity) p.velocity[i] = CVARS.sv_maxvelocity;
    else if (p.velocity[i] < -CVARS.sv_maxvelocity) p.velocity[i] = -CVARS.sv_maxvelocity;
  }
}

const len3 = (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function airMove(world, p, cmd) {
  const { forward, right } = angleVectors(p.angles);
  const fmove = cmd.forward, smove = cmd.side;
  const wishvel = [forward[0] * fmove + right[0] * smove, forward[1] * fmove + right[1] * smove, 0];
  let wishspeed = len3(wishvel);
  const wishdir = wishspeed ? wishvel.map((v) => v / wishspeed) : [0, 0, 0];
  if (wishspeed > CVARS.sv_maxspeed) {
    for (let i = 0; i < 3; i++) wishvel[i] *= CVARS.sv_maxspeed / wishspeed;
    wishspeed = CVARS.sv_maxspeed;
  }
  if (p.flags & FL_ONGROUND) {
    userFriction(world, p);
    accelerate(p, wishdir, wishspeed);
  } else {
    airAccelerate(p, wishvel, wishspeed);
  }
}

function userFriction(world, p) {
  const vel = p.velocity;
  const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1]);
  if (!speed) return;
  // if the leading edge is over a dropoff, increase friction
  const start = [p.origin[0] + (vel[0] / speed) * 16, p.origin[1] + (vel[1] / speed) * 16, p.origin[2] + PLAYER_MINS[2]];
  const stop = [start[0], start[1], start[2] - 34];
  const trace = traceBox(world, start, [0, 0, 0], [0, 0, 0], stop);
  const friction = trace.fraction === 1 ? CVARS.sv_friction * CVARS.edgefriction : CVARS.sv_friction;
  const control = speed < CVARS.sv_stopspeed ? CVARS.sv_stopspeed : speed;
  let newspeed = speed - FRAMETIME * control * friction;
  if (newspeed < 0) newspeed = 0;
  newspeed /= speed;
  vel[0] *= newspeed; vel[1] *= newspeed; vel[2] *= newspeed;
}

function accelerate(p, wishdir, wishspeed) {
  const currentspeed = dot(p.velocity, wishdir);
  const addspeed = wishspeed - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = CVARS.sv_accelerate * FRAMETIME * wishspeed;
  if (accelspeed > addspeed) accelspeed = addspeed;
  for (let i = 0; i < 3; i++) p.velocity[i] += accelspeed * wishdir[i];
}

function airAccelerate(p, wishveloc, wishspeed) {
  let wishspd = len3(wishveloc);
  const dir = wishspd ? wishveloc.map((v) => v / wishspd) : [0, 0, 0];
  if (wishspd > 30) wishspd = 30;
  const currentspeed = dot(p.velocity, dir);
  const addspeed = wishspd - currentspeed;
  if (addspeed <= 0) return;
  let accelspeed = CVARS.sv_accelerate * wishspeed * FRAMETIME;
  if (accelspeed > addspeed) accelspeed = addspeed;
  for (let i = 0; i < 3; i++) p.velocity[i] += accelspeed * dir[i];
}

function checkStuck(world, p) {
  if (!boxInSolid(world, p.origin, PLAYER_MINS, PLAYER_MAXS)) { p.oldorigin = p.origin.slice(); return; }
  const org = p.origin.slice();
  p.origin = p.oldorigin.slice();
  if (!boxInSolid(world, p.origin, PLAYER_MINS, PLAYER_MAXS)) return;
  for (let z = 0; z < 18; z++) {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        p.origin = [org[0] + i, org[1] + j, org[2] + z];
        if (!boxInSolid(world, p.origin, PLAYER_MINS, PLAYER_MAXS)) return;
      }
    }
  }
  p.origin = org; // player is stuck
}

function clipVelocity(inv, normal, out, overbounce) {
  let blocked = 0;
  if (normal[2] > 0) blocked |= 1; // floor
  if (!normal[2]) blocked |= 2; // step
  const backoff = dot(inv, normal) * overbounce;
  for (let i = 0; i < 3; i++) {
    const change = normal[i] * backoff;
    out[i] = inv[i] - change;
    if (out[i] > -STOP_EPSILON && out[i] < STOP_EPSILON) out[i] = 0;
  }
  return blocked;
}

// sv_phys.c SV_FlyMove: slide along up to five planes
function flyMove(world, p, time, steptrace) {
  const numbumps = 4;
  let blocked = 0;
  let originalVelocity = p.velocity.slice();
  const primalVelocity = p.velocity.slice();
  const planes = [];
  let timeLeft = time;
  for (let bump = 0; bump < numbumps; bump++) {
    if (!p.velocity[0] && !p.velocity[1] && !p.velocity[2]) break;
    const end = [0, 1, 2].map((i) => p.origin[i] + timeLeft * p.velocity[i]);
    const trace = traceBox(world, p.origin, PLAYER_MINS, PLAYER_MAXS, end);
    if (trace.allsolid) { p.velocity = [0, 0, 0]; return 3; } // trapped in another solid
    if (trace.fraction > 0) { // actually covered some distance
      p.origin = trace.endpos.slice();
      originalVelocity = p.velocity.slice();
      planes.length = 0;
    }
    if (trace.fraction === 1) break; // moved the entire distance
    if (trace.plane.normal[2] > 0.7) { blocked |= 1; p.flags |= FL_ONGROUND; }
    if (!trace.plane.normal[2]) { blocked |= 2; if (steptrace) steptrace.trace = trace; }
    timeLeft -= timeLeft * trace.fraction;
    if (planes.length >= MAX_CLIP_PLANES) { p.velocity = [0, 0, 0]; return 3; }
    planes.push(trace.plane.normal.slice());
    // modify original_velocity so it parallels all of the clip planes
    const newVelocity = [0, 0, 0];
    let i;
    for (i = 0; i < planes.length; i++) {
      clipVelocity(originalVelocity, planes[i], newVelocity, 1);
      let j;
      for (j = 0; j < planes.length; j++) if (j !== i && dot(newVelocity, planes[j]) < 0) break;
      if (j === planes.length) break;
    }
    if (i !== planes.length) {
      p.velocity = newVelocity.slice(); // go along this plane
    } else { // go along the crease
      if (planes.length !== 2) { p.velocity = [0, 0, 0]; return 7; }
      const [a, b] = planes;
      const dir = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const d = dot(dir, p.velocity);
      p.velocity = dir.map((v) => v * d);
    }
    // if velocity is against the original velocity, stop dead to avoid tiny oscillations in sloping corners
    if (dot(p.velocity, primalVelocity) <= 0) { p.velocity = [0, 0, 0]; return blocked; }
  }
  return blocked;
}

function pushEntity(world, p, push) {
  const end = [p.origin[0] + push[0], p.origin[1] + push[1], p.origin[2] + push[2]];
  const trace = traceBox(world, p.origin, PLAYER_MINS, PLAYER_MAXS, end);
  p.origin = trace.endpos.slice();
  return trace;
}

function wallFriction(p, trace) {
  const { forward } = angleVectors(p.vAngle);
  let d = dot(trace.plane.normal, forward);
  d += 0.5;
  if (d >= 0) return;
  // cut the tangential velocity
  const i = dot(trace.plane.normal, p.velocity);
  const side = [0, 1, 2].map((k) => p.velocity[k] - trace.plane.normal[k] * i);
  p.velocity[0] = side[0] * (1 + d);
  p.velocity[1] = side[1] * (1 + d);
}

function tryUnstick(world, p, oldvel) {
  const oldorg = p.origin.slice();
  const dirs = [[2, 0], [0, 2], [-2, 0], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2]];
  for (const [x, y] of dirs) {
    pushEntity(world, p, [x, y, 0]);
    p.velocity = [oldvel[0], oldvel[1], 0]; // retry the original move
    const clip = flyMove(world, p, 0.1, {});
    if (Math.abs(oldorg[1] - p.origin[1]) > 4 || Math.abs(oldorg[0] - p.origin[0]) > 4) return clip;
    p.origin = oldorg.slice(); // go back to the original pos and try again
  }
  p.velocity = [0, 0, 0];
  return 7; // still not moving
}

// sv_phys.c SV_WalkMove: slide, and if blocked by a step, try stepping up
function walkMove(world, p) {
  const oldonground = p.flags & FL_ONGROUND;
  p.flags &= ~FL_ONGROUND;
  const oldorg = p.origin.slice(), oldvel = p.velocity.slice();
  const steptrace = {};
  let clip = flyMove(world, p, FRAMETIME, steptrace);
  if (!(clip & 2)) return; // move didn't block on a step
  if (!oldonground) return; // don't stair up while jumping (waterlevel is always 0 here)

  const nosteporg = p.origin.slice(), nostepvel = p.velocity.slice();
  p.origin = oldorg.slice(); // back to start pos
  const upmove = [0, 0, STEPSIZE];
  const downmove = [0, 0, -STEPSIZE + oldvel[2] * FRAMETIME];
  pushEntity(world, p, upmove); // move up
  p.velocity = [oldvel[0], oldvel[1], 0]; // move forward
  clip = flyMove(world, p, FRAMETIME, steptrace);
  // check for stuckness, possibly due to the limited precision of floats in the clipping hulls
  if (clip) {
    if (Math.abs(oldorg[1] - p.origin[1]) < 0.03125 && Math.abs(oldorg[0] - p.origin[0]) < 0.03125) {
      clip = tryUnstick(world, p, oldvel); // stepping up didn't make any progress
    }
  }
  if (clip & 2 && steptrace.trace) wallFriction(p, steptrace.trace); // extra friction based on view angle
  const downtrace = pushEntity(world, p, downmove); // move down
  if (downtrace.plane.normal[2] > 0.7) {
    p.flags |= FL_ONGROUND;
  } else {
    // if the push down didn't end up on good ground, use the move without the step up
    p.origin = nosteporg;
    p.velocity = nostepvel;
  }
}

export const onGround = (p) => !!(p.flags & FL_ONGROUND);

// FNV-1a over the player's state, as exact float64 bytes: the determinism check.
const hashBuf = new DataView(new ArrayBuffer(8));
export function hashPlayer(p, h = 0x811c9dc5) {
  for (const v of [...p.origin, ...p.velocity, p.flags]) {
    hashBuf.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) { h ^= hashBuf.getUint8(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h;
}
