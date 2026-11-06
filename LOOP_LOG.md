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

## 2026-11-05 · M0 T10–T11 renderer, walk page, Chrome = Node
- First screenshots showed black lane walls. Level 0's background map is entirely blank tile 0,
  and 75–100% of every level's background is blank except level 14. What Abuse actually draws behind
  the player is the non-solid **decorative foreground tiles**: 2012 of level 0's 2013 open cells.
  The lane walls now show the cell's foreground picture when it has one, else the background tile.
- `engine/render.js` (WebGL2; gl_rsurf.c AllocBlock and BuildSurfaceDisplayList, gl_rmain.c
  R_SetupGL axes), `client/main.js` (pointer lock, WASD, run, jump, 60 Hz tick, interpolation),
  `web/index.html`.
- Screenshots (headless Chrome, SwiftShader) checked at the start corridor, two points along the
  scripted walk and a tall shaft: textured floors, ceilings and decor walls, lit, no holes.
  The "STUCK" seen in two early shots was my own rounded test position (1784.00 sits exactly on
  a hull plane, while the walk stood at 1783.9998). It was not a bug.
- `tools/browser-check.mjs` + `web/walktest.html`: the 7200-tick walk ends with hash 3134993295 at
  1783.9998005453087,-47.96875,-909.96875 in **both** Chrome and Node. Now a test.
- `npm test` 11/11. Remaining for M0: T12, the human walks level 0.

## 2026-11-05 · M0 T12 sign-off, GitHub Pages
- Jared walked level 0: "looks great". M0 is closed. The question "how to operate the lift?" is noted:
  objects (lifts, doors, switches) are M5, and the README status now says so.
- Published on GitHub Pages from `main` (root `index.html` redirects to `web/`, `.nojekyll`).

## 2026-11-05 · M1 T1–T7 level 0 in 3D, with 3D models
- Jared clarified that "level 1" means level 00. Level 0's enemies are six WHO flyers (jugger.lsp, flyer_ai).
- T1: brush model *1 holds the front caps (the solid tiles' fronts at Y = −64, facing out of the lane).
- T2: `client/sim-host.js` hosts WEaBuse's Game (null WebGL, autoPause, like headless.mjs); aim is
  fed as mouse = point − cam (game.js updatePlayer). `client/scene.js` mirrors game.js render()'s
  object section into a list in level pixels.
- T3: `engine/voxel.js`: rounded voxel models from sprite frames.
- T4: renderer rewritten. Abuse's light formula per pixel in the shader (lights in a float texture,
  live ambient, dimmers and the L key work), caps and near-wall switches, model and box passes,
  look-at cameras, `pick()` from screen to lane.
- T5: `client/play.js` + `web/index.html` (walk moved to `web/walk.html`). Cameras are angled, side and
  first person (in first person the player's own model is hidden, since the camera sat inside it).
  Fixed the start panel staying visible (CSS display overrode `hidden`).
- T6: tests. Level 0's recorded run reaches the exit through the host. Collecting the scene every step
  leaves every per-step state hash equal. Voxel models are closed (divergence-theorem volume),
  mirrored and deterministic. `npm test` 18/18.
- T7: screenshots checked: the cop on the ledge (angled), the WHO flyers and pickups, the lift with its
  training message (side), the first-person corridor, and the Watch mode running. No console errors.

## 2026-11-05 · M1 layout: no splash, Abuse's status bar below the view
- Jared asked to drop the splash screen and to put the instructions below the WebGL view, and to
  give the health and weapons bar a 3D look or keep it if that makes sense. I kept Abuse's own
  pixel-art status bar (art/statbar.spe, ported from WEaBuse main.js as `client/statbar.js`): it is
  a flat HUD, so a 3D version would add nothing. It is scaled by whole device pixels, so it stays sharp.
- The game starts at once. The panel below holds the status bar, the status line, the controls, and
  the Watch, Restart and Walk mode buttons (which drop focus, so Space does not press them).
- Screenshots checked at 1280×720 and 820×640. `npm test` 18/18.

## 2026-11-05 · M1: main is first person (Quake POV); 2.5D kept on feature/2.5d
- Jared: "you have made it 2.5D which is great... but i want it 3d POV like quake", and keep the 2.5D
  version as a feature branch. `feature/2.5d` = f7dca70 (angled, side and first-person cameras).
- `client/play.js` on main is first person only: free Quake mouse look (in_win.c sensitivities, the
  cl_pitchup/down limits), W A S D relative to the view (CL_BaseMove; the component along the lane
  becomes ArrowLeft/Right for the sim), arrow keys turn (cl_yawspeed 140), Space jumps or climbs a
  ladder, E uses or climbs down, the aim is the view direction projected onto the lane. Watch turns
  the view to the cop's facing and aim. Crosshair and a "click to look around" hint.
- Screenshots checked: the corridor with the WHO flyers ahead, and the view turned to the side wall.
  `npm test` 18/18.

## 2026-11-05 · M2 T1–T6 depth mode
- T1: WEaBuse branch `depth-hooks` (0440c05): inert `g.apart?.(shot, target)` in weapons.js hitAt and in
  game.js explode (blast set by detonate). WEaBuse regress.mjs: 22/22 still win. The submodule tracks that
  branch. WEaBuse `main` is untouched.
- T2: LANE 160 (a hall 320 units deep).
- T3: `client/depth.js`. Finding: switches measure their own distance and ask `g.pressed('action')`, so
  the layer answers "use" only to objects at the player's depth (while their behaviour runs). A player's
  shot travels in depth along the line of sight from the eye, not from the muzzle. Found while
  testing: freshRun leaves `p.aim`/`p.aimAngle` from the previous run (harmless, recomputed on the
  first step with a pointer).
- T4: `client/place.js` (slabs for full-hall things, flat on the back wall, floor pads as deep as wide,
  spinning items), voxel `flat` variant, renderer basis+offset per model, one-shot-at-a-time
  projectile recording.
- T5: `client/play.js`: W A S D across the hall, eye at the player's depth, shots along the view, Watch
  under 2D rules.
- Evidence: `npm test` 26/26, including **level 0 finished under the 3D rules** (the recorded run plus
  an across-the-hall autopilot reaches the exit, no deaths, lowest health 86). Screenshots: the wide
  hall with ammo spread across the floor, the flyers at their depths, a switch on the back wall, a
  teleporter pad on the floor, the lift and doors spanning the hall.

## 2026-11-05 · M2b designed models, fitted doors and lifts, shooter ladders
- Jared: the drones looked like pancake versions of themselves; doors did not open; lifts and doors spanned
  the whole hall; ladders should climb like a 3D shooter's. All four are now CLAUDE.md "3D conversion rules".
- Read the sprites first (contact sheet). WHO is a flat hovercraft whose narrower frames are it turning; a
  door's middle block lifts; the lift is a bevelled deck with a lamp; the switch is a box with two lamps;
  TELE2 is a round pad. Designs in `client/models.js` follow those, built with `engine/mesh.js`, coloured
  from each sprite (`spriteColours`: body/main/dark/light/vivid), posed from state (door openness from
  running/blocking/walking, the lift lamp on aistate 3, the switch lamps from aistate, the teleporter beam
  while running).
- Doors had looked closed when open: the open frame stretched across the hall still filled it. Fitted doors
  fix that: the panel slides up into the lintel.
- Fitted doors and lifts (depth.js zones): a door is 96 units across in a doorway; a lift is 120 deep in a
  shaft over its run between its two stops (a tile scan failed, since the deck sits flush in its floor).
  Frame walls are drawn (renderer.setFrames, textured with the wall tile above) and enforced (walking in
  beside the opening is undone, depth is clamped inside, shots die at frames, enemies keep to openings).
  Bugs found and fixed: zones were rebuilt when any object died (now once per level); a double door got
  two different openings (touching zones now share one).
- `?look=TYPE&ang&dist&up&solo=1` model review view (rule 7). Screenshots checked solo and in the level.
- `npm test` 29/29: designed parts closed (divergence volume > 0), door panel rises with state, door- and
  lift-sized zones, level 0 finished under the 3D rules with an autopilot that lines up with the openings.

## 2026-11-05 · trap doors like the lift; one industrial kit
- Jared: "the trap door should be like the elevator in design. also doors should be like that too."
- TRAP_DOOR2/3 (strap_door_ai) are floor hatches with hazard chevrons that slide into a housing (sprite
  49 → 31 px over 'running'). Now `hatch` kind: a floor zone as deep as the hatch is wide. The floor around
  the hole holds a player dropping onto it at another depth (enforce sets them back on top, grounded),
  and bumps a head from below. Only at the hatch's depth does the player fall through the open hatch.
- `client/models.js`: lift, door and hatch share one kit (kitColours from SMART_PLAT_SMALL's sprite:
  metal, tread, under, trim, dark, plus hazard yellow/black and lamp). The hatch drops 3 units and slides
  under the floor; the door was restyled (metal panel, tread, trim, lamp, hazard foot, tapered posts).
- `?look=…&pose=STATE&frame=N` poses the reviewed object. Screenshots: hatch shut and half open, door shut
  and half open, lift, hatch in the level.
- `npm test` 30/30 (new: the floor beside an open hatch holds, the opening lets the player drop; hatch parts closed).

## 2026-11-05 · models batch 1, save terminals, faster bullets, the weapon in hand
- Jared: "continue doing whatever you were doing" (next: models awaiting design); then "the save game
  machines dont look right its like a huge wall thingo"; then "player bullet speeds dont feel right,
  needs to be faster, also cant see player hands or the weapon theyre holding".
- Designed from their sprites (contact sheets): heart, shell clip, grenades, rocket, generic crate,
  power module, pointer (on the wall, pointing down-left as drawn), switch-ball target, spring jump pad,
  exit pad, teleport beam, TP_DOOR pod (dome lifts as it opens), lava (red pool, crust, bubbles), block
  walls (stones that shift and fall away with damage), and the save terminal: RESTART_POSITION is a
  wall terminal (screen of green text that turns blue when used, scanner, keypad, lamp), now 'wall'
  kind instead of a hall-wide slab. Exits, the beam and the pod are 'floor' kind (at a spot).
- `spriteColours` gains `red` (the vivid pick had made the heart and lava yellow).
- Bullets: a Jared rule, 2.5x faster with the same reach (`quicken` cuts the life to match sgun_ai's
  6/5 acceleration). Drawn as glowing tracers oriented along their 3D path.
- `client/viewmodel.js`: Quake-style view model, one design per weapon (MGUN, PGUN, GRENADE, ROCKET,
  FIREBOMB, DFRIS, LSABER) in gloved hands with sleeves (DARNEL's colours), bob while running, kick and
  muzzle flash on firing, drawn after a depth clear.
- Screenshot gotcha: a reused Chrome profile served a stale mesh.js; screenshots now use a fresh
  profile and `--disk-cache-size=1`.
- Review options: `?weapon=NAME`, `?fire=1`.

## 2026-11-05 · slope jumps, explosions, red tracers, cooler guns, atmospheric light, exit machine
- Jared: jumps fail on slopes ("mini bumps"); drone explosions look bad; the machine gun's bullet should be
  red; the guns should be cooler and inspired by the game's guns; add a rule for atmospheric light like
  Quake's; "the end of level teleporter machine doesnt line up".
- Slopes: WEaBuse queues a jump only on a frame the player stands (game.js updatePlayer). `client/controls.js`
  JumpAssist: a 150 ms press buffer and 133 ms coyote time set `jumpQueued` the way a standing press would.
  Tests reproduce the lost press without it and the jump with it.
- Explosions designed from EXPLODE1-8 and the clouds: additive fireball blobs cooling white-yellow →
  orange → red with sparks and rising smoke, ring bursts, white-blue flashes, smoke puffs.
- Renderer: up to 16 coloured dynamic lights in the world and model shaders, haze, additive glow parts,
  camera-facing halos. `client/atmosphere.js` gathers the halos (with lamp fixtures; Quake lightstyle
  flicker on some) and the dynamic lights each frame. CLAUDE.md rules 8 (atmosphere) and 9 (Quake controls).
- Tracers: the player's bullets are red (weapons.js "the player's are red"), additive.
- Guns redesigned from the cop's weapon sprites and the status bar icons: silver machine gun with a
  skeleton stock, olive plasma gun with a glowing chamber, green grenade launcher with a red tip and a
  drum, dark rocket tube with a hazard band and scope, gold firebomb with fuel canisters and a pilot
  flame, dark red frisbee launcher with a spinning disc, red light saber.
- The exit: each NEXT_LEVEL pad links to its NEXT_LEVEL_TOP 45 px above; they had separate random depths.
  The machine now takes its pad's depth and is designed (grey core with red internals, arms with green
  emitters, a lens, a beam to the pad when the player is near). Test: every machine is over its pad.
- Review options `?effect=TYPE&frame=N&fxd=px`. `npm test` 35/35.

## 2026-11-05 · level picker, all 22 levels, Quake-style skins
- Jared: "i need to be able to switch back to levels i have already passed in browser in bottom menu";
  then "quake used simple textures on guns to improve their look can you do the same".
- All 22 levels compiled (59 MB in web/maps, 1.0-5.4 MB each, ~11 s). `tests/levels.test.mjs`: each one
  rebuilds byte-identically to the committed file and is solid where the sim is (8-neighbour edge skip,
  as bsp.test; a 4-neighbour first try counted slope edges as failures). `npm run build:maps` builds all.
- Bottom panel: a Level list of passed levels (localStorage `weabuse3d.passed`), the current one and the
  next after the furthest passed. Finishing a level by play marks it; a watched run does not.
- `engine/detail.js`: a generated 256x256 metal skin (noise, brushed rows, 64 px panel seams with rivets,
  scratches). The model shader projects it triplanar in model space (no UVs; it stays on the moving gun)
  and multiplies it in (`skin`, `skinScale` per draw). On guns, the drone hull, lifts, doors, hatches.
- `npm test` 57/57.

## 2026-11-05 · Quake's palette and resolution
- Jared: "stick to a strict colour palate like quake did and distance rendering also to add grittyness ...
  perhaps use the exact same colour scheme quake used while keeping the sprites in the same design as abuse".
- Quake's palette comes from LibreQuake (lq1/gfx/palette.lmp, BSD 3-clause; the same 256 colours, index 255
  = 159,91,83). It is not taken from id's paks (CLAUDE.md hard rule). Licence in `licenses/`.
- Renderer: the scene is drawn into an offscreen target ~400 lines tall, then a post pass snaps each pixel
  to the nearest palette colour via a 32x32x32 lookup (`paletteLut`, eye-weighted distance, 36 ms to
  build) and scales it up with hard edges. F4 toggles it; `?quake=0` turns it off. The walk page gets it too.
- CLAUDE.md rule 10. Screenshots compared with it off and on.

## 2026-11-05 · the exit lined up and closer to the original
- Jared (with a screenshot): "teleporter doesnt line up or look like the original that much". The beam, the
  machine's lens and the pad's ring were on three different axes: each was centred on its own sprite, and
  the machine's lens is not in the middle of its sprite. Also the white column was the exit's TELE_BEAM
  (each exit has one within 4 px of its pad), placed at its own random depth.
- Now one axis: `exitAxis` (the pad's drawn middle) for pad, machine and beam; the machine and the beam take
  the pad's depth (depth.js `padOf`, NEXT_LEVEL_TOP's link). Redesigned from the art: the machine as a
  cluster of light grey pods on a ribbed hanger with red between them, thin struts (two up, five down) to
  emitter heads with green lights, a white lens; the pad as a glossy dark disc with a grey rim and a red
  band; the beam as an additive blue glow with a core and drifting streaks, pulsing with its fade. The
  machine's own extra shimmer was dropped (the beam is the TELE_BEAM).
- Test: every exit's machine, beam and pad share one axis and depth. `npm test` 57/57.

## 2026-11-05 · the alien ant, hemisphere turrets, ant cracks
- Jared: "OK it looks awesome now... level 1 the aliens ant things need better models ... they are so key to
  the game. the turret models also are not great as they need to be proper hemispheres".
- Studied every state of ANT_ROOF (art/ant.spe, 20 states: hanging, fall_start, falling, stopped, running x10,
  landing, pounce_wait, turn_around, run_jump family, fire_wait, ceil_fire, top_walk x10, flinch, blown_back_dead,
  jump_up, hiding, weapon_fire) from a per-state sheet.
- `client/ant.js`: an articulated model from unit bones and joints: domed head with a dropping jaw, torso,
  abdomen, ribs, dorsal spines, a ten-segment tail with a blade (arcing back and up, whipping over at the tip,
  as drawn), digitigrade hind legs and clawed arms solved with two-bone IK so feet stay down through the run
  cycle (phase from the running frame). Poses for every state: ceiling states upside down from the sprite's
  top, a curled pod when hanging, splayed when falling, stretched when leaping, reared, pale when flinching,
  flattened when dead, an acid-green glow at the jaw when spitting. Turns toward the player across the hall.
  Colours per tint (ant_draw) from the standing frame.
- Turret: two half-domes (a proper hemisphere) on a wall plate with pins, grey-green camo with dark dapple,
  parting with spray.appear / closing with spray.disappear; the inner ball's port follows `e.a.angle`
  tilted toward the player's depth. Ant crack: a widening hole in the back wall, pushed-out slabs, red glow.
- Fixes on the way: spriteColours on an empty frame; one ant kit per tint, not per frame; turret colours
  pulled to the sprite's grey-green (the body lift had made them tan).
- Tests: every ant state builds a whole, finite, closed model; turret and crack in every state. 58/58.

## 2026-11-05 · sound on/off button
- Jared: "can you add a button to turn off audio". A "Sound: on/off" button in the bottom panel uses WEaBuse's
  Audio.setUserMuted (it also cuts sounds already playing); the choice is kept in localStorage (`weabuse3d.muted`).

## 2026-11-05 · six scarier ant designs to choose from
- Jared: "do some more ant textures and designs to make them scarier front on.... give me 6 designs that are
  rendered so i can choose which is coolest".
- `engine/detail.js` organicSkin (cellular chitin with dark veins, mottled), a second skin in the model shader
  (`skinKind` 1); all ant parts wear it.
- `client/ant.js` designs 1-6 (`?ant=N`; 0 is the earlier one): 1 Xeno (glossy black dome, ridges, silver teeth,
  a shooting inner jaw), 2 Mandible (broad head, huge curved pincers that clamp, red compound eyes, spikes),
  3 Maw (head opens in four petals round a ring of teeth and a glowing throat), 4 Horned (ram horns, crest, slit
  yellow eyes, fangs), 5 Skull (bone-white skull, dark sockets with red pinpricks, exposed ribs), 6 Hive (eight
  orange eyes, fangs dripping acid, bristles). Body colours per design, mixed with the ant's tint.
- Renders front-on and three-quarter, spitting, in `docs/ant-designs.png` (review options `?amb=N`, `?ant=N`).
  The first renders were from behind (front is ang=180 for that ant); redone.
- Tests: every design in every state builds a whole, closed model. 58/58.

## 2026-11-05 · design 7, Xeno + Mandible, is the ant
- Jared: "can you combine 1 and 2". Design 7: Xeno's long glossy dark dome, ridges, rows of silver teeth and shooting
  inner jaw, with Mandible's clamping pincers, red compound eyes and back spikes (a shared `mandibles` piece), in
  dark crimson-black. It is now the default (`DEFAULT_ANT`); `?ant=0..6` shows the others. Tests cover designs 0-7.

## 2026-11-05 · the ant, refined
- Jared: "i dont like the top horns, the eyes are also no good, need better textures, teh claws and manibles and skin
  should be closer in colour, the mouth should open and close also somehow".
- Design 7 has its own head now: no top spikes; eyes are glassy slits with a faint ember set into the dome; a hinged
  lower jaw on a snarl cycle (opens and closes by itself, gapes when spitting) showing a dark throat, horn teeth top
  and bottom, and the inner jaw shooting out as it opens; the pincers spread with the mouth. Claws, pincers and
  teeth are horn tinted from the skin (`horn`). organicSkin rewritten: armour plates with dark seams, fine pores,
  ribbed striations; finer and stronger on the ant. Renders closed and open, front and three-quarter.

## 2026-11-05 · the ant is the creature from Abuse's box art (design 8)
- Jared, with the cover art: "that image on the left hand side is your best bet for the design of the creature".
- Design 8 (now `DEFAULT_ANT`) has its own path through the model: lean flesh-red body with pink highlights and
  dark creases, ribs under the skin, a vertebra ridge, bony shoulders; a long bulbous cranium sweeping up and back
  (three stretched ellipsoids) with an ember at its tip; no eyes; a lipless grin of two rows of ivory teeth on a
  hinged jaw (snarl cycle, gapes to spit); long gaunt limbs held high in a spider crouch with four-fingered claws;
  a sixteen-vertebra beaded tail arching up and back. New `muscleSkin` (fibres along each limb, skinKind 2).
- Found on the way: the ant's skins were scaled for world units but laid on unit bone meshes, so they barely
  showed; the muscle skin is scaled per unit mesh. Renders in `docs/ant-boxart.png`. Tests cover designs 0-8.

## 2026-11-05 · smaller head, the gun on its back
- Jared: "the head is comically large so. shrink that, it also has a gun on its back so add that... the head only
  really needs to be the first part of the head". The cranium is now its first ellipsoid only, and the face, grin
  and jaw are about 3/4 the size. A fleshy cannon grows from the upper back (mount, sinew braces, breech, a ribbed
  barrel forward over the head, the orange glowing muzzle that was on the cover); it kicks and flares on
  weapon_fire / ceil_fire. docs/ant-boxart.png updated.

## The ant: darker and grittier
Jared: "creature looks great just needs some more dark texture to make it more gritty and less bright holistically".
The muscle skin has deeper grooves between the fibres, dark grime blotches and dirt specks, laid on at 0.85–0.9
strength (was 0.5–0.55). The flesh is a dark blood red (0.44, 0.09, 0.08 from 0.66, 0.15, 0.13), the highlights are
muted, the creases deeper, the teeth and claws stained, not clean bone, and the muzzle on its back is a dull ember
at rest that flares only when it fires. Checked by screenshot solo and in level 1; 58/58 tests.

## The ant on the roof is a cocoon
Jared: "when the alien is in the roof waiting it is actually a cocoon egg that is not yet hatched and should have a
model as such and should not move following the user as it does now". A hanging ant (ant_ai 'hanging') is now a
cocoon: a resin splat and stalk with sagging strands, a leathery veined shell (as tall as the 15 x 32 hanging sprite),
sealed by four lips with a dim ember in the seam that lights the ceiling faintly; it breathes and nothing else. The
depth layer no longer steers a hanging (or hidden) ant across the hall towards the player, so it stays at its own
depth until it drops. When it hatches the creature falls out and a torn husk, lips peeled open and slime dripping,
stays on the ceiling (presentation only, per level). The model test's "hanging is a whole ant" became "hanging is a
cocoon" (the spec changed); new tests: the cocoon keeps its depth (fails without the fix), the husk is closed parts.
Review: ?pose=hanging>landing switches state a second later. 59/59 tests; checked by screenshot solo and in level 1.

## Ants run up the side walls; packs spread across the hall
Jared asked whether the aliens could jump onto the walls as well as the roof (option 1, the hall's side walls, 3D
only, approved), and noted that on level 1 the creatures come "in a straight line ... they should be spaced out more".
- Wall run (client/depth.js wallRun, a Jared rule): a running ant 60-240 px from the player may leap (6 ticks) onto
  the nearer side wall, up to 40 px up, cling and scuttle along it at 5 px a tick, spit (ceil_fire, then ant.cpp's
  fire_at_player aim), and spring off at the player: its own jump, aimed to land at the player, crossing the hall at
  22 units a tick. Chances come from spread(tickCount, id), not g.rand, so the simulation's random numbers are its own.
  The model poses it as on the ceiling, rolled a quarter, feet on the wall. Review: &onwall=1|-1.
- Spacing: the cause was afterTick steering every enemy to the player's exact depth. Each now aims at its own flank
  (spread(id) * 90 units, narrowing within 110 px of the player) and pairs within 30 px in the plane are pushed
  apart to 44 units. Level 1's five ants over the bridge: before, all at depth 0; now from about -60 to +66.
- Tests: the wall run (leap, cling at LANE-18, 16+ px up, spring, lands within 40 px of the player, repeats exactly);
  the pack spreads over 60 units. 61/61. Checked by screenshot on both walls.

## Level 2: the switch beside the lift could not be reached
Jared: "theres a bug in that room where i cant walk to the switch". Level 2's SWITCH_ONCE at (1993, 557) stands on a
ledge beside a lift. The lift's zone (its shaft, from the deck's own width, 1995..2054) began 2 px from the switch, and
its opening sat at a random depth (-32 +- 60), so in front of the switch the frame walls kept the player at least 60
units short of the reach a wall switch asks for; the only spot outside the zone was a 3 px sliver against the wall.
Fix (client/depth.js zones): a doorway or shaft beside something used on the back wall (a switch, a save terminal)
opens flush against the back wall, and a group of touching zones takes that opening. New tests: walking in to the
level 2 switch and using it, and on all 22 levels no switch or terminal is shut off from the back wall by a zone (both
fail without the fix). 63/63. Checked by screenshot from in front of the switch.

## Level 2 in 3D
Jared: "OK so do level 002 now" (and, during it, "add a godmode button").
- Inventory: every object level 2 draws now has a design. New in client/machines.js, from their frames: the jugger
  (articulated walker, IK legs, cannon and grenade-drum arms, walk / throw / burst apart), the tracking gun (hung
  from the ceiling; shells part, gun pod rides a ring at its angle, aimed at the player), ROB1 the cleaner (a sweeper
  as wide as the hall with a spinning claw drum), the pusher (a chevron force field between two emitters, over a pit),
  the step (slides out of the back wall when on), blocks (burst and tumble), indicator lamps, the boulder (a spiked
  roller as wide as the hall, since it hits anywhere across it). Hall-wide where the simulation's collision is.
- 3D rules (client/depth.js): juggers are enemies (34 units deep; one standing guard, or not yet switched on, stays
  put); the tracking gun hangs in the middle of the hall (kind 'hang', depth 0); indicators are on the back wall; a
  shove (pushChar) reaches the player only from the shover's depth, like contact damage. Lights: indicators, the
  jugger's glows, the tracking gun's flash.
- Colours: the lit indicator first came out grey: the Quake palette has no saturated green (its greens are the
  grey-greens 177-184), so the lamp uses its palest.
- God mode button in the panel (WEaBuse's setGod, the same as G; the label follows either).
- Tests: levels 0, 1 and 2 are finished under the 3D rules (the recorded runs with the autopilot); level 2's objects
  all designed and closed in every state; a jugger shoves only from its depth (fails without the gate) and one
  standing guard stays put. 67/67. Screenshots solo (docs/level2-models.png) and in the level.

## Windows onto the background (the cityscapes)
Jared: "in the original game you can see out windows on most levels to see cityscapes etc as they strobe past.
ensure the same functionality is there". Before: the back wall painted the background where a cell had no
foreground, fixed to the wall (no parallax), and see-through foreground pixels drew black.
- engine/render.js: foreground textures keep colour 0 as see-through (alpha); lane-wall faces are grouped by wall
  (+1 back, -1 front); the world shader shows the background (`backdrop`) on background faces and through
  see-through texels. The background is the level's bgmap (an R16UI map of atlas slots, nearest texels) on a
  plane at lane / rate behind the wall, per axis, seen along the eye ray: from the hall's middle it equals
  WEaBuse's 2D parallax (bg = x - cam * (1 - rate), cam centred on a 320 x 200 view). Integer samplers always get
  units 6 and 7 and a stand-in texture (unbound, they clash with unit 0 and the draw fails).
- client/play.js hands the level's background to the renderer. No map rebuild needed.
- Found where it matters by replaying the recorded runs in 2D and counting the background pixels the 2D view
  shows: most on levels 2, 4, 9, 11, 16. Screenshots: level 2's sky and sun behind its window frames, level 4's
  and 16's city skylines, level 14's grilles, level 1's frames (the background shifts behind them between two
  spots). docs/windows.png. 67/67 tests.

## Gaps in the skyline (2026-11-06)
- Jared: "there are gaps in the skyline" (level 1, near the back wall, looking along the hall).
- Cause: on the city levels (1, 12, 16) Abuse paints the background map only where its camera can reach (level
  1: half of that area is art, everything outside it black). A window seen at a slant or from close to looked
  further along the backdrop plane, into the black.
- Fix: each point of a window is held to what the 2D game shows behind it from some camera that has it on
  screen (px = cam * rate + p - cam, cam clamped to the level). Front-on views are unchanged; the 3D depth stays
  wherever it fits. Checked against a 2D render of the same spot: level 1's lower panes now show the city
  instead of black. Levels 2, 4 and 16 unchanged front-on, no black at a slant. 67/67 tests.

## The city outside is far away (2026-11-06)
- Jared: "the images in the window appear too near at least when i tested level 002 ... takes away from the
  atmosphere".
- Cause: level 2 scrolls its background at 5/8 across and 1:1 up and down, so the plane sat 96 units behind
  the glass, and fixed to the wall vertically; it was also lit by the hall's lamp pools and gunfire.
- Its art is small patches shaped to the windows, so one far plane for the level would look into black. New
  client/backdrop.js groups the see-through cells that show art into windows (within 3 cells, so panes either
  side of a pillar share one view), with each window's anchor (what Abuse shows at its centre), the box of art
  behind it (grown to where the art ends) and its extent. The shader puts each window's picture on a plane at
  max(10, 1/rate) lane depths, mirrors sideways and draws the top and bottom rows on, keeps the eye within
  half a screen of the window and no closer than half the lane. Lit by Abuse's lamps only, hazed.
- Screenshots: level 2 from 60 px apart: the wall moves ~170 px on screen, the tower behind ~20. Levels 1 and
  16 still show their cities. tests/backdrop.test.mjs (anchors on art and in their box; the pillar case).
  71/71 tests.

## The whole picture (2026-11-06)
- Jared: "the background distant tiles are still showing black gaps and may be too far ... think through how
  quake did these distant textures and skylines and make a new combined image for it within keeping the
  original images in there".
- Quake's sky is one whole texture with nothing missing (and scrolls as a far layer). Abuse's background is
  islands of art in a black map. New client/backdrop.js backdropCanvas makes the level's background whole:
  Abuse's art pixels untouched; empty tiles filled along rows (reflected on from each band's ends, a dithered
  48 px blend where the two sides meet; the map wraps) and then down columns (edge rows drawn on: sky up,
  ground down; reflecting there hung the city upside down below itself). 100-160 ms a level.
- The renderer samples that one picture (no tile atlas, no per-window box or mirroring any more); the plane is
  at max(4, 1/rate) lane depths (was 10).
- Screenshots: levels 1, 2, 4, 16, straight on and at slants, no black. tests: every art pixel kept, under 10%
  black in the whole picture.

## Ladders, slopes, jumping off (2026-11-06)
- Jared: the ladder on level 2 is "hidden at the top with a walk-through image"; ladders let you "clip and get
  stuck in walls"; "you should be able to jump off a ladder"; "running down inclines and jumping also still
  seems to be broken, maybe look at the original quake engine"; "stuck on l2 ladder".
- Slopes: sim's step down after a move tests the whole body, but the player stands by their centre (WEaBuse
  13b8bd2), so on slopes the centre left the ground: 807 short drops without a jump in levels 0-5's recorded
  runs, 484 longer than the coyote time. Quake (QuakeWorld PM_GroundMove) steps a walker down up to STEPSIZE
  (18 units = 9 px). depth.js stepDown after each ground move: 170 left (ledges). Jump assist counts the box.
- Ladders: client/ladders.js finds the floor cells each ladder passes through (28 in the game); the compiler
  leaves them open (maps rebuilt), the depth layer closes them with frame walls but for a 56-unit hole against
  the back wall; climbing pulls the player there (600 units/s); a hatch/door/lift a ladder runs through opens
  at the back wall (level 2's trap door at 993,796 held the climber under it for good). Space now jumps (off a
  ladder too: pushed 70 units back into the hall, not caught again for 0.35 s).
- Also: zones that touch through a chain now share one opening (level 15's two trap doors did not).
- Tests: every ladder in the game, up and down, from the front of the hall (fails on the trap door without the
  fix); slopes on level 0 (fail without stepDown); the map tests skip only the ladder-hole cells.
- Level 1's 3D finish test died (the recorded piece 33 survived on 14 health in 2D and ran on past its goal).
  Jared chose a new run: tools/depth-run-search.mjs found piece 33 inputs for the 3D rules in 26 tries,
  reaching the next piece's start with 42 health; kept in tests/data/depth-runs.json. 82/82 tests.

## Weapons as the original, and a trap door that held the player (2026-11-06)
- Jared: the weapons should "work like the original game more because i think we broke the flamers etc so
  make sure they align in functionality and damage". Against Abuse 0.8's source: WEaBuse's FIREBOMB was a
  grenade (the original: an unseen fire running along the floor up to 20 ticks, burning 60 px for up to 40
  every tick), PGUN/DFRIS/LSABER were one plasma bolt (the original: a 200 px line for 10, a steered frisbee
  blowing 40/45 white, a 45 px blade for 30), the player's rockets did not lock on, grenades blew 50/40 (36/40
  in the original), and one's own blasts hurt at half (the original excludes the creator).
- Fixed in the simulation behind Game.originalWeapons, off by default: with it on, 19 of WEaBuse's 22
  recorded runs stop winning (they were played with the simplified weapons). Jared chose a switch on in 3D only.
  sim depth-hooks 825269e; tests/weapons.test.mjs checks each weapon against the source's numbers.
- Jared: "on this trapdoor in level 2 i got stuck in the wall and cant walk". The trap door at 2310,1199 stands
  3 px proud of the floor; the simulation lets the feet into its top for a few frames before lifting the player
  on, and the depth layer took that for being in the hole and undid every step. A hole in the floor now holds
  only a player over it by their centre with their feet 8 px in; coming down onto the floor round it away from
  the opening, the floor holds at its top. Test: walks onto it at four depths. 89/89 tests.

## Weapons in Quake's style, the gun hand, turrets (2026-11-06)
- Jared: the gun effects are "too pixel art" and should look like Quake's; "the plaers gun hand also looks really
  low quality"; turrets "arent as dangerous as they shoot through the whole room ... speed them up heaps".
- Shots: client/shots.js models (rocket, grenade, disc, beams, bolts) replace the recorded 2D pixels;
  client/particles.js trails and bursts (Quake ramps), drawn as soft additive glows and a new soft smoke pass
  in the renderer. Fire bomb flames (sim tags them) get their own smaller look and one light, not an
  explosion's each (they stacked into a white-out). Fireballs smoother (10x16). Rockets lock on only in line
  of sight (fire_object 3 can_see): one dived into the floor at a jugger on the storey below.
- The gun hand: the guns were built from 16 units behind the grip and the near plane is 4: the back of each
  was cut off and the rest filled the corner. Now drawn at 0.6, 18 units out, canted 24 degrees, barrel in 5;
  new hands (segment/chain primitives in engine/mesh.js), brown leather gloves, all seven guns redesigned.
- Turrets: track guns fire 3x in 3D (4 -> 12 shots in 10 s). Spray guns left alone: sped up, the three by
  level 2's ladder pinned a climber (each hit a flinch). 90/90 tests.
- Not yet: the right hand on the grip sits just below the frame; the frisbee's glow is blobby; Jared's
  "level 2 elevator ... cut in half" not reproduced (his picture came through as an old one).

## Teleporters, quieter (2026-11-06)
- Jared: "the flashy lights of the room teleporters is too bright make it opaque and subtle". A running pad's
  disc flickered up to 4.4x bright and a solid white column strobed on and off every 80 ms, under a strong blue
  room light. Now the disc is a solid pale blue that brightens with a slow soft pulse (1.15-1.35), the column
  is a faint steady haze, and the room light is a soft 0.4 within 130 units. Screenshot before and after.

## The ladder hop loop (2026-11-06)
- Jared: "when you jump off you can get caught in a loop jumping between them it looks totally weird".
- Holding forward and looking up sends Up, and the 3D input counted the top of a ladder as on it; but Abuse
  lets go of a climber at the top (p.ladderExit) and Up there is a jump: the player hopped, landed, hopped. Now
  controls.js climbIntent: Up climbs only below the top and not while Abuse has let go; it still hops where
  another ladder goes on up above (level 2's stacked pairs climb straight through, 91-94 frames); on the top,
  forward walks on. Also the ladder's foot has Abuse's 3 px of grace (level 2's ladder at 539 could not be
  started from the floor, 3 px below its bottom). Test: on top, holding, no hops. 91/91 tests.

## Levels 3 and 4, and watching levels 0-4 in 3D (2026-11-06)
- Jared: "now work in level 3 and 4", then "use the game search to play all levels in 3d mode from level 00 to
  level 04 and also have a button to play it onscreen".
- Level 3: everything it shows already had a design; its recorded run finishes under the 3D rules.
- Level 4: designs for CONC (floor mine), CONC_AIR (air mine), LIGHTIN (lightning barrier) in client/hazards.js,
  looked at from their frames; mines are 'floor' kind (at a spot across the hall, as pads); lightning spans
  the hall and flickers a cold light. Its run died in piece 26 (enemy shots and a grenade, with the original
  weapons and faster track guns): tools/depth-run-search.mjs found new inputs piece by piece.
- client/autopilot.js: the autopilot and piece choice, shared by tests/search and the page. The page's new
  button "Watch levels 0-4 in 3D" (?watch3d=1) plays the runs under the 3D rules in first person, on from
  one level to the next to level 4.

## Forward at an angle (2026-11-06)
- Jared: "the forward button now doesnt quite go forward anymore when facing on an angle". Across the hall the
  move was the forward share of the speed, along it Abuse's all-or-nothing run (and nothing under a quarter),
  so the player did not go the way they faced. Now the run is capped at the forward share (sim runShare, an
  inert hook: WEaBuse's 22 runs still win) with a dead zone of 0.05. Test: at 45 degrees, 71% of the run.
- Level 4's search had run on code from before mines were put at their own spot across the hall; it is being
  run again. The finish test covers 0-3 until it has.
