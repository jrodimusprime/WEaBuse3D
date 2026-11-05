# Loop log

Newest last. One entry per task: what changed, the evidence, notes for the next agent.

## 2026-11-05 · M0 T1 scaffolding
- Added WEaBuse as `sim/` (pinned at 43a1a53), `package.json`, `tools/fetch-ref.sh`.
- Running the downloaded ericw-tools binaries was denied by the sandbox, so the plan now
  uses our own JavaScript BSP compiler (README › Turning 2D maps into 3D).
- Measured level 0: 100×100 foreground tiles of 30×15 px, background 33×33 tiles of 60×30 px,
  parallax 5/7 horizontally. Every tile outline is convex: a full block (7662 cells), a
  block with its top 2 px empty (266), or one of four triangles (59). 58 lights, 13 areas.
- The cop is 29×12 px, so the scale is 1 px = 2 Quake units and Quake's standard hulls fit.

## 2026-11-05 · M0 T2–T8 level compiler, BSP2 loader, tests
- `content/level-input.mjs`: level 0 merges into 189 convex shapes (rect runs stacked, slopes kept).
- `content/bsp2d.mjs`: 2D solid-leaf BSP; splitters are exact integer lines from outline edges.
  200,000 random points classify the same as direct point-in-shape tests.
- `content/compile.mjs`: lane walls (Y = ±64) + 2D tree → nodes/leaves/faces; faces cut on the tile
  grid (edges) and background grid (walls); clip hulls 1 and 2 from Minkowski-grown outlines;
  lightmaps from WEaBuse's light formula (imports `lightRange` from sim lighting.js).
- `content/bsp2-write.mjs` + `engine/bsp.js` (port of gl_model.c loaders) + `engine/trace.js`
  (port of world.c). level00.bsp: 351 KB, 2803 faces, 408 nodes, 888 clipnodes, builds in ~0.1 s.
- Evidence: `npm test` 6/6. Byte-identical rebuild. Hull 0 agrees with sim `tileSolid` at
  377,207 sample points (skipping 2 px around outline edges), at three depths. Dropping the player
  hull from the start lands at y = 92 px, the top of the 2-px-lipped platform tiles.

## 2026-11-05 · M0 T9 walk physics
- `engine/move.js`: port of SV_ClientThink/SV_AirMove/SV_UserFriction/SV_Accelerate/SV_AirAccelerate
  (sv_user.c), SV_Physics_Client/SV_WalkMove/SV_FlyMove/ClipVelocity/SV_TryUnstick/SV_WallFriction/
  SV_CheckStuck (sv_phys.c), PlayerJump (client.qc). Quake's cvar defaults.
- `engine/detmath.js`: 65536-unit integer angles; the sine table is built with a Taylor series
  (only + - * /), so it is identical in every engine. AngleVectors ported from mathlib.c.
- Decision: the *walk* tick is 60 Hz (fixed). It is an engine test harness for first-person feel;
  the Abuse simulation keeps its 15 Hz tick when it arrives (M5). Determinism is unaffected: the
  tick is fixed and every op is exactly specified.
- Evidence: `npm test` 10/10. Landing puts the feet on the platform top (Z −184). A 2-minute random
  walk (jumps, turns, runs) never ends a tick in solid and hashes the same twice (a38b9ac for the
  7200-tick run).
