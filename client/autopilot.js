// Plays a recorded run under the 3D rules: used by the page's "Watch all levels in 3D" (play.js) and by the
// tests and the search (tools/depth-harness.mjs), so all three play a run alike.
//
// WEaBuse's recorded runs (sim/web/data/ppo-demo.json) are 2D: they say only what to press along the plane.
// With the depth layer on, an autopilot walks across the hall to whatever the run is about to use (a switch on
// the wall, a pad, an item) and lines up with each doorway, shaft and ladder hole it passes. A piece whose 2D
// inputs do not survive the 3D rules has inputs found for them by the search (tools/depth-run-search.mjs), kept
// in tests/data/depth-runs/NN.json by level and by the piece's place among that level's pieces.

// The pieces of level L as the 3D rules play them: [{seed, acts (decoded), steps, own}]
export function piecesFor(demo, own, L, decodeActs) {
  return demo.pieces.filter((p) => p.levelIdx === L).map((p, k) => {
    const o = own?.[L]?.[k];
    const acts = decodeActs(o ? o.acts : p.acts);
    return { seed: p.seed || null, acts, steps: Math.min(o ? o.steps : p.steps, acts.length * 4), own: !!o };
  });
}

// The enemy the pilot is fighting: the nearest in front of the player (the way the run faces), within reach,
// that the depth layer counts as a foe (walking, flying or hanging), or null.
const FOES = new Set(['enemy', 'hang']);
export function pilotTarget(g, d, face) {
  const p = g.player;
  let best = null, bd = 300;
  for (const e of g.entities) {
    if (e.dead || e.hidden || !e.shootable || !(FOES.has(d.kind(e)) || e.ai === 'spray_gun_ai')) continue;
    const dx = (e.x - p.x) * face;
    if (dx < -10 || Math.abs(e.y - p.y) > 160) continue;
    const dist = Math.hypot(e.x - p.x, e.y - p.y);
    if (dist < bd) { bd = dist; best = e; }
  }
  return best;
}

// An action of a piece is Abuse's (ppo.js actParts: move, jump, down, fire; the kept runs use 0-31) plus ACTS
// times a side of the hall to hold: 0 leaves the depth to the autopilot, 1 holds the near side and 2 the far side
// (a 3D player steps out of a fight's way across the hall; tools/depth-run-search.mjs finds where). WEaBuse's
// recorded runs use 0 only. (ACTS is a multiple of 3, so act % 3 is still the way the action moves.)
export const ACTS = 48;
const SIDE = [null, -1, 1];

// One step of a piece: the autopilot across the hall, aiming its shots across the hall at the foe it is
// fighting (a 3D player aims at what they shoot), then the recorded keys, then the game.
export function autopilotStep(g, d, act, face, applyAction, step) {
  const p = g.player, lane = d.lane, side = SIDE[Math.floor(act / ACTS)] ?? null;
  act %= ACTS;
  const foe = pilotTarget(g, d, face);
  if (foe) {
    const fd = d.depthOf(foe) ?? d.pd, along = Math.max(1, Math.hypot(foe.x - p.x, foe.y - 15 - (p.y - 25)));
    d.shotRatio = Math.max(-12, Math.min(12, (fd - d.pd) / along));
  } else d.shotRatio = 0;
  let target = null, best = 70;
  for (const e of g.entities) {
    const k = e.dead ? null : d.kind(e);
    if (k !== 'wall' && k !== 'floor' && k !== 'item') continue;
    const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    if (dist < best) { best = dist; target = k === 'wall' ? lane - 30 : d.depthOf(e); }
  }
  // line up with a doorway or a shaft ahead (the frame walls let the player through only there)
  for (const z of d.zones()) {
    if (p.x + 60 < z.x0 || p.x - 60 > z.x1 || p.y + 40 < z.y0 || p.y - 70 > z.y1) continue;
    target = z.c;
  }
  if (side !== null) target = side * (lane - 20); // (the frame walls still hold the player at a doorway's opening)
  d.movePlayer(target === null ? 0 : Math.max(-1, Math.min(1, (target - d.pd) / 20)), step);
  applyAction(g, act, face);
  g.update(step);
}
