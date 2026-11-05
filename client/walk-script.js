// A long, deterministic, random-looking walk: the same commands in Node and
// in the browser, used to check that walking never ends up inside a wall and
// that it plays out bit-for-bit the same everywhere.
import { makeCommand, newPlayer, playerTick, hashPlayer } from '../engine/move.js';
import { boxInSolid } from '../engine/trace.js';
import { PLAYER_MINS, PLAYER_MAXS } from '../engine/move.js';

export function scriptedCommands(n = 3600, seed = 1) {
  let s = seed;
  const rnd = (k) => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return (s >> 8) % k; };
  const cmds = [];
  let yaw = 0, hold = 0, cur = null;
  for (let i = 0; i < n; i++) {
    if (hold-- <= 0) {
      hold = 20 + rnd(90);
      cur = {
        fwd: rnd(4) ? 1 : 0, back: rnd(8) === 0 ? 1 : 0, left: rnd(5) === 0 ? 1 : 0, right: rnd(5) === 0 ? 1 : 0,
        run: rnd(2) === 1, jumpEvery: rnd(3) ? 0 : 15 + rnd(30), turn: rnd(3) ? 0 : (rnd(2) ? 1 : -1) * (50 + rnd(400)),
        pitch: rnd(2) ? 0 : rnd(4000) - 2000,
      };
    }
    yaw = (yaw + cur.turn) & 0xffff;
    const jump = cur.jumpEvery ? i % cur.jumpEvery < 2 : false;
    cmds.push(makeCommand({ ...cur, jump, yaw, pitch: cur.pitch & 0xffff }));
  }
  return cmds;
}

// Plays the commands from the level's start. Returns the final hash, the
// number of ticks that ended inside solid, and how far the walk got.
export function runWalk(world, cmds) {
  const st = world.entities.find((e) => e.classname === 'info_player_start');
  const p = newPlayer(st.origin.split(' ').map(Number));
  const x0 = p.origin[0];
  let hash = 0x811c9dc5, stuck = 0, far = 0;
  for (const c of cmds) {
    playerTick(world, p, c);
    hash = hashPlayer(p, hash);
    if (boxInSolid(world, p.origin, PLAYER_MINS, PLAYER_MAXS)) stuck++;
    far = Math.max(far, Math.abs(p.origin[0] - x0));
  }
  return { hash, stuck, far, origin: p.origin };
}
