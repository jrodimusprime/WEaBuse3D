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
