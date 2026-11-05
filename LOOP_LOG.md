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
