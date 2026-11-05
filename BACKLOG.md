# Backlog

The loop takes the first unchecked task of the current milestone. See README.md › Milestones.

## M0: First walk (current)

- [x] T1 Scaffolding: `sim/` submodule (WEaBuse), `package.json`, `tools/fetch-ref.sh`, BACKLOG and LOOP_LOG.
- [x] T2 `content/level-input.mjs`: load a level in Node through WEaBuse's parser and return the tile outlines (convex polygons in Quake units), tile numbers, lights, ambient areas and the player start.
- [x] T3 `content/bsp2d.mjs`: 2D solid-leaf BSP over the outlines (hull 0), with region polygons on every leaf.
- [x] T4 `content/compile.mjs`: lane walls plus the 2D tree become 3D nodes, leaves, faces (split per tile for textures) and marksurfaces. Clip hulls 1 and 2 come from Minkowski-expanded outlines.
- [x] T5 Textures: foreground and background tiles become miptex with Abuse palette indices, plus world-anchored texinfo.
- [x] T6 Lightmaps: Abuse's light formula (lighting.js) per luxel, with area ambient, style 0.
- [x] T7 `content/bsp2-write.mjs` + `engine/bsp.js` (Mod_LoadBrushModel for BSP2). Tests: structure valid, rebuild byte-identical.
- [x] T8 Test: the compiled world is solid exactly where the simulation's tiles are (hull 0 point contents vs `tileSolid`, away from edges).
- [ ] T9 `engine/trace.js` (SV_HullPointContents, SV_RecursiveHullCheck) + `engine/move.js` (Quake walk physics, fixed tick) + deterministic angle tables. Test: a scripted walk never enters solid and its hash repeats.
- [ ] T10 `engine/render.js` (WebGL2 world: textures, lightmap atlas) + `client/` (pointer lock, WASD, jump, 15 Hz tick, interpolation) + `web/index.html`.
- [ ] T11 Headless Chrome: screenshots of level 0 checked, and the Chrome walk hash equals the Node hash.
- [ ] T12 Human walks level 0 and signs off.

## Blocked

(none)
