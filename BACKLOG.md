# Backlog

The loop takes the first unchecked task of the current milestone. See README.md › Milestones.

## M1: Level 0, complete, with 3D models (current)

- [ ] T1 Compiler: front caps (solid regions' fronts at Y = -LANE, tile art) as brush model *1; tests.
- [ ] T2 `client/sim-host.js` + `client/scene.js`: run WEaBuse's Game in the client, record its draw list in level pixels.
- [ ] T3 `engine/voxel.js`: sprite frame to voxel model (rounded by distance to the silhouette, merged runs, cached).
- [ ] T4 Renderer: Abuse lighting in the shader (lights texture, ambient, lights on/off), caps/front-wall switches, model and box passes, lookAt cameras.
- [ ] T5 `client/play.js` + `web/play.html`: cameras (angled, side, first person), aim from the pointer, input, HUD, help text, sound, level-complete screen, Watch button.
- [ ] T6 Tests: recorded level-0 run reaches the exit through the host; scene recording leaves the state hash unchanged; voxel models deterministic and closed.
- [ ] T7 Screenshots checked (flyers, player, doors, lifts, each camera); Pages updated.
- [ ] T8 Human finishes level 0.

## M0: First walk (done)

- [x] T1 Scaffolding: `sim/` submodule (WEaBuse), `package.json`, `tools/fetch-ref.sh`, BACKLOG and LOOP_LOG.
- [x] T2 `content/level-input.mjs`: load a level in Node through WEaBuse's parser and return the tile outlines (convex polygons in Quake units), tile numbers, lights, ambient areas and the player start.
- [x] T3 `content/bsp2d.mjs`: 2D solid-leaf BSP over the outlines (hull 0), with region polygons on every leaf.
- [x] T4 `content/compile.mjs`: lane walls plus the 2D tree become 3D nodes, leaves, faces (split per tile for textures) and marksurfaces. Clip hulls 1 and 2 come from Minkowski-expanded outlines.
- [x] T5 Textures: foreground and background tiles become miptex with Abuse palette indices, plus world-anchored texinfo.
- [x] T6 Lightmaps: Abuse's light formula (lighting.js) per luxel, with area ambient, style 0.
- [x] T7 `content/bsp2-write.mjs` + `engine/bsp.js` (Mod_LoadBrushModel for BSP2). Tests: structure valid, rebuild byte-identical.
- [x] T8 Test: the compiled world is solid exactly where the simulation's tiles are (hull 0 point contents vs `tileSolid`, away from edges).
- [x] T9 `engine/trace.js` (SV_HullPointContents, SV_RecursiveHullCheck) + `engine/move.js` (Quake walk physics, fixed tick) + deterministic angle tables. Test: a scripted walk never enters solid and its hash repeats.
- [x] T10 `engine/render.js` (WebGL2 world: textures, lightmap atlas) + `client/` (pointer lock, WASD, jump, 15 Hz tick, interpolation) + `web/index.html`.
- [x] T11 Headless Chrome: screenshots of level 0 checked, and the Chrome walk hash equals the Node hash.
- [x] T12 Human walks level 0 and signs off (2026-11-05: "looks great").

## Later (found during M0, not needed for its gate)

- Decor tiles that are partly transparent over a non-blank background (common in level 14): draw the decor as its own see-through layer just in front of the back wall, with the background behind it. Today the decor tile is drawn opaque, so transparent pixels show as palette colour 0 (black).
- Port R_MarkLeaves / R_RecursiveWorldNode with frustum culling. Today every face is drawn every frame.
- Cross-runtime check in Firefox and WebKit (Playwright). Chrome = Node is done.
- Palette + colormap shader (Abuse's own light tables) in place of the RGB multiply.
- Build all 22 levels and add them to the tests.

## Blocked

(none)
