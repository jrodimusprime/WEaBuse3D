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
