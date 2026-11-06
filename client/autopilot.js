// Plays a recorded run under the 3D rules: used by the page's "Watch levels 0-4 in 3D" (play.js) and by the
// tests and the search (tools/depth-harness.mjs), so all three play a run alike.
//
// WEaBuse's recorded runs (sim/web/data/ppo-demo.json) are 2D: they say only what to press along the plane.
// With the depth layer on, an autopilot walks across the hall to whatever the run is about to use (a switch on
// the wall, a pad, an item) and lines up with each doorway, shaft and ladder hole it passes. A piece whose 2D
// inputs do not survive the 3D rules has inputs found for them by the search (tools/depth-run-search.mjs), kept
// in tests/data/depth-runs.json by level and by the piece's place among that level's pieces.

// The pieces of level L as the 3D rules play them: [{seed, acts (decoded), steps, own}]
export function piecesFor(demo, own, L, decodeActs) {
  return demo.pieces.filter((p) => p.levelIdx === L).map((p, k) => {
    const o = own?.[L]?.[k];
    const acts = decodeActs(o ? o.acts : p.acts);
    return { seed: p.seed || null, acts, steps: Math.min(o ? o.steps : p.steps, acts.length * 4), own: !!o };
  });
}

// One step of a piece: the autopilot across the hall, then the recorded keys, then the game.
export function autopilotStep(g, d, act, face, applyAction, step) {
  const p = g.player, lane = d.lane;
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
  d.movePlayer(target === null ? 0 : Math.max(-1, Math.min(1, (target - d.pd) / 20)), step);
  applyAction(g, act, face);
  g.update(step);
}
