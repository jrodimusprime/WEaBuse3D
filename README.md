# WEaBuse3D

**Abuse in 3D.** The 22 levels of Crack dot Com's 1995 side-scroller, extruded into
real 3D worlds and run on a JavaScript + WebGL port of the GPL-released Quake engine.
The game uses Abuse's own art, sounds and maps, which Crack dot Com released into the public domain.

The game must be **deterministic**: the same inputs always give the same game, tick for
tick, in every browser and in Node.

**Play:** https://jrodimusprime.github.io/WEaBuse3D/ (level 0 in 3D, first person, like Quake)

**The conversion's philosophy, techniques and decisions** (keeping Abuse's game while giving it Quake's feel:
the layers, determinism and playthrough search, the 3D conversion rules, the look, the Jared rules, the page's
controls, and every decision made, with why) are in
[conv_tractics](https://github.com/jrodimusprime/conv_tractics) (private). A decision about the conversion is
added to its Decisions table when it is made.

> **Status: M2 (depth mode: 3D gameplay) is built and waiting for a human to finish level 0 in 3D.** WEaBuse's simulation runs the
> game, the Quake-style engine draws it, and every object (the cop, the WHO flyers, lifts, doors,
> pickups) is a 3D voxel model made from Abuse's own sprites.

## Run it

```sh
git clone --recursive https://github.com/jrodimusprime/WEaBuse3D.git
cd WEaBuse3D
npm run serve            # python3 -m http.server 8001, from the repo root
# open http://localhost:8001/web/
```

The page plays level 0 in first person. Click the view to capture the mouse, look and aim with
it, fire with the left button, move with W A S D (relative to where you look), jump or climb with
Space, use switches, lifts and doors with E, change weapons with 1-7 or the wheel. **Watch the
recorded run** plays WEaBuse's winning run of the level through the cop's eyes. **Level** in the bottom panel lists
every level you have passed in this browser (and the one you are on); pick one to play it again.
All 22 levels are compiled. `web/walk.html` is
the M0 walk. The 2.5D version (angled and side cameras) is on the branch `feature/2.5d`.

```sh
npm test                 # compiler, loader, solidity vs the simulation, walk physics, Chrome = Node,
                         # level 0 won through the 3D host, drawing never changes the game, voxel models
npm run build:maps       # rebuild web/maps/level00.bsp (byte-for-byte reproducible)
node tools/browser-check.mjs   # the scripted walk in headless Chrome vs Node
```

Sister project: [WEaBuse](https://github.com/jrodimusprime/weAbUSE), the faithful 2D WebGL
port. WEaBuse matters here because it already has a **deterministic, headless, re-implemented
Abuse simulation**, plus recorded runs that win all 22 levels. This project builds on that
simulation and does not write the game logic again.

---

## Contents

1. [The idea in one picture](#the-idea-in-one-picture)
2. [Sources of truth](#sources-of-truth)
3. [Licensing](#licensing)
4. [Key decisions](#key-decisions)
5. [Architecture](#architecture)
6. [Turning 2D maps into 3D](#turning-2d-maps-into-3d)
7. [Turning sprites into 3D](#turning-sprites-into-3d)
8. [Determinism](#determinism)
9. [Testing](#testing)
10. [The AI loop](#the-ai-loop)
11. [Milestones](#milestones)
12. [Risks and open questions](#risks-and-open-questions)
13. [Jared rules](#jared-rules)

---

## The idea in one picture

```
 Abuse level (.spe)                        Quake-style world (.bsp)
 ┌──────────────────────┐                  
 │██████████████████████│        extrude          ╱████████████████████╱│
 │█      ▓▓▓      ██   █│   ──────────────▶      ╱  back wall = Abuse  ╱ │
 │█  @        ▓▓  ██   █│   tiles → brushes     ╱   background tiles  ╱  │
 │█████████   ███████  █│   lights → lightmaps ████████████████████████  │
 └──────────────────────┘   objects → entities █  @  lane (y = 0)  ██ █ ╱
                                               ████████████████████████╱
   x → right, y ↓ down                      X → right, Z ↑ up, Y = depth
```

The gameplay stays on the **lane**, the plane where the 2D game happened. Everything
around it becomes real geometry: walls with thickness, a back wall, baked light and shadow,
and cameras that can go anywhere, including first person. A second, later mode
([M2](#m2-depth-mode-3d-gameplay)) lets the player leave the lane.

---

## Sources of truth

When sources disagree, the higher one wins:

1. **Abuse 0.8 original** (C++ in `src/`, Lisp in `data/lisp/` and `data/addon/`) decides
   **what the game does**: every rule, number, timer and probability.
2. **WEaBuse's simulation** is the working, tested copy of (1) in JavaScript. It is the
   **oracle**: in lane mode, this game's simulation must match it tick for tick.
3. **id Software's Quake source** (GPL release: `WinQuake/` and the GLQuake files in it)
   decides **how the engine works**: BSP loading, PVS, surfaces, lightmaps, lightstyles,
   dynamic lights, alias models, sprites, particles, sound spatialisation, console and cvars.
4. **WebQuake** (Triang3l, GPLv2), an existing hand-written JS/WebGL port of Quake, is
   **a cross-reference only**. It shows how a Quake subsystem was mapped to JS and WebGL
   before. We read it, but we do not copy its structure (globals, WebGL1, no modules).

Every engine change cites the Quake source it ports (`gl_rsurf.c R_RecursiveWorldNode`).
Every gameplay change cites the Abuse source (`cop.cpp player_move`), as in WEaBuse.

---

## Licensing

| Part | Licence | Consequence |
| --- | --- | --- |
| Quake engine source (id, 1999) | GPLv2 | **This repo is GPLv2** (see `LICENSE`). Ported engine code keeps id's copyright notice. |
| WebQuake (cross-reference) | GPLv2 | Compatible. |
| Abuse engine `src/*` | Public domain | Free to use. |
| Abuse SDL port `src/sdlport/*` | GPLv2+ | Compatible (we do not need it). |
| Abuse data `data/*` (art, levels, Lisp) | Public domain | Free to use, convert, redistribute. |
| Abuse `data/sfx/*`, `data/music/*` (Bobby Prince) | Redistribution permission granted to Debian | **Open question.** WEaBuse already ships them. Check before shipping, and keep them replaceable. |
| Quake's 256-colour palette (`web/palettes/quake.lmp`), from LibreQuake | BSD 3-clause | Notice in `licenses/`. Taken from LibreQuake's free data, not from id's. |
| The 3D hints' voice-overs (`web/voice`), made by `tools/make-voices.mjs` with eSpeak NG | eSpeak NG is GPLv3; what it says is not covered | Free to publish. (Not the macOS voices: Apple's licence forbids publishing what they say.) |
| **Quake game data** (`pak0.pak`, `pak1.pak`, id's models, textures, sounds, maps) | **Proprietary** | **Never used, never committed, never downloaded by any script.** CI fails if a `.pak` file or a known id asset hash appears anywhere in the tree. |

We use Quake's engine and none of its content or look. The game should look and sound like
Abuse.

---

## Key decisions

Each decision below has a recommendation. They can be revisited at a milestone gate.

### 1. The engine: a hand port of GLQuake to modern JavaScript

**Recommended:** port the parts of id's GLQuake that we need, file by file, to plain ES
modules on **WebGL2**, with **no build step** (the same rule as WEaBuse).

- *Not Emscripten/WebAssembly.* That is a different project, and C floats plus
  `Host_Frame`'s variable timestep work against determinism. A hand port lets every line
  follow our rules.
- *Not a WebQuake fork.* WebQuake is a 2012 codebase (WebGL1, globals) built around running
  id's own `progs.dat` and pak files. We want its knowledge without its structure.

**What we port from Quake:**

| Quake subsystem | Source files (reference) | Used for |
| --- | --- | --- |
| BSP loading (BSP2 variant) | `model.c`, `gl_model.c` | The compiled level |
| PVS + frustum culling | `gl_rmain.c`, `gl_rsurf.c` (`R_MarkLeaves`, `R_RecursiveWorldNode`) | Drawing only what is visible |
| Lightmaps + lightstyles | `gl_rsurf.c`, `gl_rlight.c`, `r_light.c` | Baked Abuse lights, and dimmer switches (switchable styles) |
| Dynamic lights | `gl_rlight.c` (`R_PushDlights`) | Muzzle flashes, explosions, rockets |
| Brush models (`*1`, `*2` …) | `gl_rsurf.c` (`R_DrawBrushModel`) | Doors, lifts, breakable walls, force fields |
| Alias models (`.mdl`) | `gl_mesh.c`, `gl_rmain.c` | Voxelised sprites ([later](#turning-sprites-into-3d)) |
| Sprites (`.spr`) | `gl_rmain.c` (`R_DrawSpriteModel`) | First pass for all Abuse sprites |
| Particles | `r_part.c` | Sparks, smoke, blood |
| Sound spatialisation | `snd_dma.c` (`S_Spatialize`) on Web Audio | 3D positioned Abuse sounds |
| Console, cvars, commands | `console.c`, `cvar.c`, `cmd.c` | Debugging, cheats, camera modes, test hooks |
| Point-contents / hull traces | `world.c`, `sv_move.c` | Only in [depth mode](#m10-depth-mode-stretch), ported to fixed point |

**What we do not port:** networking, the QuakeC VM (`pr_*.c`), the software renderer,
`Host_Frame`'s variable timestep, and anything that reads pak files.

### 2. The game logic: WEaBuse's simulation, not QuakeC

Quake runs game logic in QuakeC. Abuse runs it in C++ and Lisp. WEaBuse has already
re-implemented Abuse in JavaScript, made it deterministic, made it headless, and proved
it on all 22 levels with recorded winning runs and a regression test.

**Recommended:** the simulation comes from WEaBuse **as a git submodule pinned to a commit**,
so it is one copy of the rules with two front ends. Fidelity fixes land in WEaBuse and
reach this game with a submodule bump. This needs one refactor in WEaBuse first: split the
simulation (`game.js`, `behaviors.js`, `weapons.js`, `entity.js`, `level.js`, `lisp.js`) from
drawing and the DOM. Most of the split already exists, since `tools/headless.mjs` runs the game
with a stub WebGL context.

The Quake side takes the place of QuakeC's client half: it reads the simulation's state
every frame and draws it. It never writes to that state.

### 3. Gameplay geometry: lane mode first, depth mode later

**Lane mode (the main game).** All gameplay happens on the plane `Y = 0`. Collision,
movement, enemies and weapons are exactly WEaBuse's, against the same tile grid. The 3D
world is real but has **no say in the rules**. This keeps every level playable as designed,
keeps every existing winning run valid, and makes the 2D game a perfect oracle.

**Depth mode (stretch, [M2](#m2-depth-mode-3d-gameplay)).** The lane is several tiles deep.
The player and enemies move in X and Y, collide with the BSP through ported Quake hull
traces, and the levels are searched again for winning runs. It is a different game, and it
only starts once lane mode is finished.

### 4. Cameras (presentation only)

| Mode | What you see | Notes |
| --- | --- | --- |
| **Classic** | Side view of the lane, perspective, near wall cut away | Closest to Abuse. |
| **Chase** (default) | Over the shoulder, a little off the lane, looking ahead | Shows the 3D world best and keeps enemies behind you in view. |
| **First person** | Down the lane, the way the cop faces | The crazy one. Aim pitch = Abuse's aim angle. Turning = facing left/right. |

The aim stays **Abuse's integer aim angle (0–359°)** in every camera. Mouse look in first
person is turned into that angle, so the recorded input does not depend on the camera.
**A run recorded in one camera, or in 2D WEaBuse, plays back the same in any other.**

---

## Architecture

```
          ┌────────────────────────── deterministic ───────────────────────────┐
 input ──▶│ tick input {buttons, aimDeg}  ──▶  sim (WEaBuse submodule), 15 Hz   │
 (keys,   │                                    fixed point / integer state      │
  mouse,  │                                    seeded PRNG, snapshot/restore,   │
  pad,    │                                    stateHash() every tick           │
  demo)   └───────────────────────────────┬────────────────────────────────────┘
                                          │ read-only view of the last 2 ticks
          ┌───────────────────────────────▼──── presentation (anything goes) ────┐
          │ client/: interpolation, cameras, HUD (Abuse statbar), effects RNG     │
          │ engine/: BSP + PVS + lightmaps + lightstyles + dlights + models +     │
          │          particles + Web Audio spatialisation + console   (WebGL2)    │
          └──────────────────────────────────────────────────────────────────────┘

 offline content build (Node, our own compiler, reproducible):
   Abuse .spe level ──2D BSP of tile outlines, extruded──▶ BSP2 (+ clip hulls, lightmaps)
   Abuse .spe art   ──tiles/sprites──▶ textures, .spr, voxel .mdl
```

### Repository layout (target)

```
WEaBuse3D/
  README.md         this plan
  CLAUDE.md         binding rules for AI agents working in this repo
  LICENSE           GPLv2
  sim/              git submodule → WEaBuse (the simulation; no DOM, no GL)
  engine/           Quake-derived renderer, models, particles, sound, console (ES modules)
  client/           cameras, interpolation, input → tick input, HUD, menus
  content/          offline compilers: level → BSP2, tile textures, sprites → spr/mdl, lights
  web/              index.html (import map, no build step) + compiled content
  tools/            headless runner, regress, search (from WEaBuse), loop driver, screenshots
  tests/            unit, determinism, oracle, golden images, fuzz
  ref/              git-ignored: abuse-0.8 source+data, id Quake source, WebQuake
```

---

## Turning 2D maps into 3D

The content compiler `content/` reads a level with WEaBuse's own parser (`level.js`:
foreground map, background map, objects, lights, ambient areas) and compiles it to a
standard Quake **BSP2** file with **our own JavaScript BSP compiler**. BSP2 is used because
Abuse levels outgrow BSP29's index limits.

*Why not ericw-tools?* It was the first plan, but running downloaded native binaries is
not allowed in the AI loop's sandbox. An Abuse level is also an easy case for a compiler:
every shape is a convex tile outline pushed out along the depth axis, so a **2D BSP**
of the outlines, extruded, is the whole 3D BSP. The compiler stays in JavaScript,
deterministic and byte-for-byte reproducible, with no native dependency. Writing a `.map`
for TrenchBroom remains a nice-to-have.

**Coordinates.** Abuse pixel `(x, y)`, y down, becomes Quake `(X = 2x, Z = −2y)`, with depth
along `Y`. The scale is **1 pixel = 2 Quake units**. The cop is 29 px tall and 12 px wide
(WEaBuse `BODY_H`, `HALF_W`), so at that scale it is 58 × 24 units, close to Quake's 56 × 32
player hull. Quake's standard hulls, gravity, speeds and jump then fit without retuning.
A 30 × 15 px foreground tile becomes 60 × 30 units. Tile sizes are read from the art, as the
original does (`loader2.cpp`: `f_wid`/`f_hi` from the first tile).

| Abuse | Quake world | Detail |
| --- | --- | --- |
| Solid foreground tile | Brush slab spanning `Y ∈ [−W, +W]` | Tile art on the front face. Side and top faces use a texture derived from the tile's edge pixels. |
| Sloped tile (boundary polygon) | Extruded convex brushes from the tile's boundary outline | The same outline the simulation collides with, so the visible and solid shapes match. |
| Non-solid foreground tile (decor) | Thin detail brush or decal near the back of the lane | `func_detail`, kept out of the BSP structure. |
| Background map | Back wall at `Y = +W`, textured with background tiles | Parallax becomes real depth. Option to push it back by the level's parallax rate (decided in M6 by screenshots). |
| Near side | Open in Classic/Chase, a generated darkened wall in First person | A cvar picks which. Front-wall brushes go in their own brush model so they can be hidden. |
| Light sources | `light` entities (radius → `light`/`wait`) | Baked, so the 3D geometry casts real shadows. |
| Dimmer switches, lights toggled by switches | Switchable lightstyles (`style` 32+) | Driven from simulation state each frame. |
| Ambient areas | Lightstyle per area plus `_minlight` on its brushes | Matches Abuse's per-area ambient. |
| Doors, lifts, breakable walls, force fields | Brush models (`func_wall`-like, no Quake logic) | Their origin and visibility are copied from the simulation every frame. |
| Every other object | A point entity with its WEaBuse id | The client finds the model by object type. |
| Exit, teleporters, save stations | Point entities plus particle and light effects | Decoration only. The simulation decides everything. |

**Palette look.** Abuse is 8-bit palette art lit with palette light tables. Quake's software
renderer works the same way (`colormap.lmp`). The default shader samples **palette-index
textures** and darkens them through a **colormap built from Abuse's own palette**, so the
game keeps Abuse's look under Quake's light. An RGB path (GLQuake style) is a cvar for
comparison.

**Compiler acceptance** (checked by tests for every level):
no leaks; every tile the simulation treats as solid is solid in the BSP at `Y = 0` (point-contents
probe on a grid); every non-solid cell is empty; the build is byte-for-byte reproducible with
pinned tool versions.

---

## Turning sprites into 3D

**Rule: every model is designed, not extruded** (CLAUDE.md, "3D conversion rules"). The first pass
(M1) extruded each sprite into voxels, and the result looked like pancake versions of the art. Now
every object gets a real 3D model, built from primitives (boxes, cylinders, spheres, tori and lathes)
in the sprite's own colours, designed from what the 2D frames imply, and posed from the simulation's
state:

| Object | 2D art | 3D design |
| --- | --- | --- |
| WHO drone | a flat hovercraft side-on; narrower frames are it turning | a hull with a canopy and two glowing thruster rings that turns, banks and bobs |
| Doors (`sdoor_ai`) | a panel in a frame whose middle lifts | a door-sized panel in a doorway, sliding up as it opens (running/blocking/walking) |
| Lift (`platform_ai`) | a deck with sloped sides and a lamp | a lift-sized deck with bevelled sides and a lamp that lights while it runs, in a shaft |
| Switch | a box with green and red lights | a panel on the back wall with two lamps |
| Teleporter (`tp2_ai`) | a round pad seen at an angle | a round pad with a rim that glows while it teleports |
| Alien ant (`ant_ai`) | a xenomorph-like ant in 20 states: hanging pod, dropping, running, pouncing, leaping, spitting, walking the ceiling, flinching, dying | an articulated model: a long domed head with a jaw, ribbed torso and abdomen, dorsal spines, a ten-segment whip tail with a blade, digitigrade legs placed by two-bone IK, clawed forearms; posed from its state and frame, turning toward the player. Hanging, it is a cocoon not yet hatched: a leathery, veined egg on a resin stalk, sealed by four lips with an ember in the seam; it stays where it hangs and only breathes, and leaves a torn husk on the ceiling when it hatches. On a side wall (a Jared rule) it is posed as on the ceiling, turned a quarter, feet gripping the wall |
| Jugger (`jug_ai`, level 2) | a hulking green walker with a red visor and orange-glowing guns; walks, throws grenades, bursts in sparks | an articulated walker: olive carapace hunched over a low head with a red visor slit, a cannon arm and a grenade-drum arm glowing orange, thick legs placed by IK on blue-black feet, hydraulic rams, exhaust stacks; walks, heaves its arms up to throw, bursts apart dying. An enemy across the hall (bulkier than an ant); one standing guard stays put, and its shove reaches only from its depth |
| Tracking gun (`track_ai`) | an armoured ball that splits open and runs a gun round its rim | hung from the ceiling in the middle of the hall on a neck: grey-green shells part to show a core and a ring, the gun pod rides the ring at its angle, aimed across the hall at the player, flaring as it fires |
| The cleaner (`rob1_ai`) | a stone-and-steel machine with spinning gold claws that trundles along shoving the player | a sweeper as wide as the hall: armoured hull on track housings at the walls, a rotor drum across the hall bristling with gold claws that spin as it goes, ribbed intake, exhaust stacks, amber beacon |
| Pusher (`pusher_ai`) | a chevron strip that shoves the player sideways (level 2: over a pit) | a force field: emitter pylons on both side walls and rows of glowing chevrons across the hall, running the way it pushes |
| Step (`step_ai`) | a step that appears when its link turns on | a steel step as wide as the hall, grip ribs and a hazard edge, sliding out of the back wall |
| Block (`block_ai`) | breakable ribbed blocks | ribbed steel blocks across the hall that burst apart, tumbling and shedding rust, when shot through |
| Indicator (`indicator_ai`) | a red or green lamp | a lamp in a housing on the back wall, red, then the Quake palette's pale green; it lights the wall |
| Boulder (`bolder_ai`) | a spiked iron ball that rolls and bounces | a spiked iron roller as wide as the hall (it hits the player anywhere across it): banded, spikes in staggered rows, turning as it rolls |
| Floor mine (`mine_ai`, level 4) | a small bronze dish; touched, a flash and spreading rings | a bronze dish and dome with studs, a plunger and a blinking red light, at its own spot across the hall; blowing up, a shock ring over the floor |
| Air mine (`air_mine_ai`) | a dark ball with a red eye that blinks | a dark iron sphere with contact horns and a band, bobbing, its red eye blinking |
| Lightning (`lightin_ai`) | a floor plate with bolts arcing up from it | a grated plate across the hall with yellow corner lamps; firing, white-blue bolts crackle up across the hall and flicker on the room |
| Turret (`spray_gun_ai`) | an armoured camo sphere whose shell splits to show a gun ball that turns through 24 aims | a hemisphere on the wall whose halves part; inside, the ball's gun port follows the turret's aim, tilted across the hall at the player |
| Trap door (`strap_door_ai`) | a floor hatch with hazard chevrons that slides into its housing | a hatch its own size in a hole its own size, sliding under the floor; the floor around it holds |

Lifts, doors and trap doors share one design kit, the lift's: bevelled metal in the lift sprite's
colours, a tread plate, yellow trim, and the trap door's yellow and black hazard stripes where things
move.

**Rule: atmospheric light everywhere** (CLAUDE.md rule 8). Abuse's own light formula is the base;
on top of it every lamp of the level has a fixture and a halo on the wall (some flicker with Quake's
lightstyle patterns), and whatever burns or shines lights the room with coloured dynamic light: the
muzzle flash, explosions (cooling from orange to red), red player tracers, rockets, plasma, acid, lava,
teleporters and beams, save screens, exit rings (`client/atmosphere.js`, 16 nearest lights a frame).
A haze darkens the distance. **The Quake look:** each frame is drawn at about Quake's resolution and
snapped to Quake's 256-colour palette (from LibreQuake, BSD), so Abuse's art and the 3D models share one
gritty, banded palette (F4 toggles it). Guns, drones, lifts, doors and hatches wear a Quake-style metal skin
(`engine/detail.js`: grain, brushed streaks, panel seams, rivets, scratches), projected along each
model's own axes. Explosions are designed too: swelling, cooling fireballs throwing sparks
and leaving smoke, spreading rings and white-blue flashes, all glowing additively.

**Windows onto the background.** Abuse draws each level's background (often a city skyline under a dark or
cloudy sky) behind its foreground, scrolled at a fraction of the camera's speed (the level's
`bg_scroll_rate`), so through every window and see-through grille the city strobes past as the player runs.
In 3D the lane walls are windows wherever Abuse would show the background: cells with no foreground, and the
see-through pixels of foreground tiles. Abuse paints its background only where its camera shows it behind a
window: on many levels islands of art, the rest of the map black, so a window seen at a slant looked off the
islands into black. Quake's sky has no holes; it is one whole picture. So the level's background is made whole
(`client/backdrop.js` `backdropCanvas`): every pixel of Abuse's art stays where it is, and the empty tiles are
filled by carrying the art on, along each row (each band of skyline reflected on from its ends, the two sides
blended where they meet), then up and down each column (the sky's top row drawn on upward, the ground's bottom
row downward). The see-through cells that show art are grouped into windows (`windowCells`; panes either side
of a pillar are one window), each anchored on the picture Abuse shows behind it. The renderer puts the whole
picture on a plane behind the wall, seen along the ray from the eye, with each window's view centred on its
anchor: in front of a window you see Abuse's art, and walking past, the city slides by slowly (see Jared rules:
the city outside is further away; `engine/render.js` `backdrop`; docs/windows.png).

**Rule: things keep their own size.** Doors, lifts and trap doors no longer span the hall. Each sits in a
doorway, shaft or hole its own size, and *frame* walls close the rest of the hall. The depth layer
enforces the frames: you pass only through the opening, and shots stop at them. Objects not yet
designed still use the voxel extrusion as a placeholder, listed in BACKLOG.md.

**Weapons in 3D, in Quake's style.** What flies is no longer the 2D game's pixels: each shot has a designed
model on its course through the hall (`client/shots.js`: a finned rocket with a burning exhaust, a ribbed
tumbling grenade, a spinning frisbee with a glowing rim, plasma and saber lines, glowing enemy bolts), and
Quake-style particles (`client/particles.js`, after Quake's R_RocketTrail and R_ParticleExplosion): fire turning
to smoke behind a rocket, smoke behind a grenade, a burst of embers cooling through Quake's ramp and a flash and
smoke for each explosion, tongues of fire where a fire bomb burns, sparks and dust where a shot strikes. What
burns lights the room. The gun in the hands is held like a Quake view model, all of it in front of the eye,
canted so the gloved hands show: three-jointed fingers round the grip and the barrel, knuckle armour, armoured
forearms; the guns have bevelled bodies, round barrels, sights, ports and vents (`client/viewmodel.js`).

**Points and spans** (CLAUDE.md, 3D conversion rule 4). Only what blocks or sweeps an area spans the hall:
rollers and boulders, laser and lightning gates, force fields, pushers, lava, hidden walls, steps, blocks, the
cleaner. Everything else is a point at its own depth, at most 32 units either side of it: teleporter pads and
pods, the exit pad, jump pads, mines, bombs, items, switches, enemies; a round pad bigger than that is an oval.
Jared: "standing platform teleporters arent point in space but take the whole horizontal".
`tests/depth.test.mjs` checks every object of every level against the rule.

**Hints in this game's controls.** Abuse's hints name its keys ("press down"); in 3D each such hint reads in this
game's controls (press E; walk forward looking up for ladders; 1 to 7 or the wheel for weapons), on screen and in
its voice-over (`client/hints.js`). Abuse's recordings cannot say the new words, so `tools/make-voices.mjs` makes
voice-overs in their manner, measured against them: eSpeak NG held on one note (Abuse's voice keeps to about
235 Hz), 11025 Hz 8-bit mono, their tone (weight below 300 Hz, a bright middle), an echo at 70 ms and a short
room, squeezed as loud as theirs. They play through the game's own audio, as Abuse's do. The hints whose words
hold as they are are said in the same voice, so every hint sounds alike (Jared: "make all human audio captions
sound the same").

**Mobile.** On a phone or a tablet the page shows the splash with "Mobile is not supported" and loads no level:
the game is played with a keyboard and a mouse.

**The splash screen.** Each time the page opens, while the level loads (a click or a key skips it), Abuse's
title picture in 3D (`client/splash.js`): the ABUSE letters solid, each pixel of the title a block of its own
colour, with "3D" after them in the same stone and fire; the cop and his disc a relief behind; the camera
drifting, firelight flickering on the letters, embers rising. `?splash=1` shows it.

**Between the levels, and the end.** As in Abuse 0.8 (`client/cutscenes.js`, after ant.cpp `show_stats` and
endgame.cpp `show_end`), drawn on its 320 x 200 screen in its own palette: at an exit the view fades out and the
original's level-complete screen shows (art/frame.spe `end_level_screen`, the cop in his ring of fire, and the grey
"Level Completed! : N" box), held while the next level loads, which then follows (`?done=N` on its address shows
the screen for N). At the boss level's exit, the ending: endgame.spe's `end.pcx` fades in and the closing story
scrolls up over it; a key or a click then goes back to the start. The 3D watch goes the same way, level to level,
to the ending. `?ending` shows the ending at once.

**The dead stay where they fall**, as in Quake. Abuse takes a dead enemy out of the game at once; in 3D a corpse
stays for the rest of the level (presentation only, `client/corpses.js`): a creature falls to the floor and lies
in its dead pose (the ant belly down, legs splayed) over a dark stain; a machine (the WHO flyer, the jugger, the
cleaner) is a wreck of its own model's parts, toppled on the floor with its lights out and some parts thrown
clear, smoking and sparking for a few seconds; a turret hangs on, broken, one piece fallen below.
Review: `?look=TYPE&n=k&kill=TYPE&solo=1`.

**Ladders through floors.** In Abuse a ladder often runs up through a solid floor tile, and the climber
passes through it. In 3D that floor is a slab across the hall, so the climber went up into solid floor and
could end up inside walls. Now, like a Quake ladder shaft, the map leaves the floor a ladder passes through
open (`client/ladders.js`; the compiler and the depth layer share it), and the depth layer's frame walls
close it again but for a hole the ladder's size against the back wall, where the ladder is painted. A climber
is drawn across the hall to the ladder, and a trap door, door or lift that a ladder runs through opens against
the back wall too. Space jumps off a ladder, pushing the player back into the hall (`tests/ladders.test.mjs`
climbs every ladder in the game, up and down, from the front of the hall).

**Moving like Quake on slopes.** Quake keeps a walker on the ground: after a move along the floor it steps
down onto ground up to a stair's height below (QuakeWorld's PM_GroundMove; 18 units, 9 px here), and the
player stands on anything under their hull. Abuse's player stands only by the point under their centre, so
running up or down a slope the centre left the ground every few frames (26 of 30 frames in the air running up
level 0's first slope), and a jump pressed then was lost. The depth layer steps the player down (`stepDown`),
and the jump assist (`client/controls.js`) counts the body's whole box as standing.

---

## Determinism

**Contract:** `state(t+1) = step(state(t), input(t))`, bit for bit, in Node, Chrome,
Firefox and Safari, whatever the frame rate, and whether or not anything is drawn.

Rules for everything under `sim/`, enforced by lint and tests:

1. **Fixed tick.** The simulation steps at Abuse's 15 Hz. The renderer runs at display rate
   and interpolates between the last two ticks. A slow frame runs several ticks, and a fast
   frame runs none.
2. **Integer or fixed-point state.** Positions are integers and velocities carry Abuse's
   8-bit fraction (the original's `xvel` + `fxvel`, `extend.h`). Depth mode uses 16.16
   fixed point. No float accumulates across ticks.
3. **No transcendental `Math` in the simulation.** `Math.sin`, `cos`, `atan2`, `pow`, `exp`
   and `log` are only *approximately* specified by ECMAScript, and engines differ in the last
   bit. Use **integer lookup tables**, as Abuse itself does (`lisp/trig.cpp`: `sin_table[360]`,
   `atan_table[1662]`, used by `lisp_sin` and `lisp_atan2`). `Math.sqrt`, `+ − × ÷` on doubles and `Math.imul` are exactly specified
   and allowed. Today WEaBuse's `behaviors.js`, `weapons.js` and `game.js` call
   `Math.atan2`, `sin` and `cos` about 20 times, so replacing them is the first task (M4).
4. **One random source.** Only the seeded PRNG inside the simulation state (WEaBuse's
   `g.rand`, the original's LCG). No `Math.random`, `Date.now`, `performance.now`, or
   iteration over anything with unstable order. Effects in the presentation layer get their
   **own** RNG and never touch the simulation's (WEaBuse already follows this, `game.js` "not rand()").
5. **Input is the only way in.** A tick input is `{buttons bitmask, aimDeg 0–359}`. A run
   is `(level, start snapshot, inputs[])`. The camera, window size, audio and the GPU have
   no path into the simulation.
6. **Snapshot / restore** is exact: restoring and stepping gives the same hashes as never
   having stopped. The Go-Explore search depends on this.
7. **`stateHash()`** (FNV-1a over a canonical serialisation) is computed every tick in
   tests and debug builds. It is the unit of comparison everywhere below.
8. **The one-way wall.** `sim/` imports nothing from `engine/`, `client/` or the DOM. Lint
   enforces this with `no-restricted-imports` and `no-restricted-properties` on `Math.random`,
   `Math.sin` and the rest, scoped to `sim/`.

---

## Testing

All test tools drive the **real** game code, headless in Node or in real browsers, as WEaBuse's do.
`npm test` runs the fast layers. CI runs all of them.

| # | Layer | What it proves | How | When |
| --- | --- | --- | --- | --- |
| 1 | **Unit** | Parsers (spe, map, bsp, mdl, spr), fixed-point and table maths, the colormap | `node --test` | Every commit |
| 2 | **Repeatability** | The same run twice gives the same hash stream | Replay every winning run twice, compare per-tick hashes | Every commit |
| 3 | **Snapshot** | Restore mid-run gives an identical continuation | Snapshot at random ticks, restore, compare hashes | Every commit |
| 4 | **Oracle** | Lane mode equals 2D WEaBuse | Same inputs into both, report the **first** tick where hashes diverge and what changed | Every commit |
| 5 | **Demo regression** | All 22 levels are still won by their recorded runs | WEaBuse's `regress.mjs` against this build (won list only grows) | Every commit (~30 s) |
| 6 | **Cross-runtime** | Node = Chrome = Firefox = WebKit, bit for bit | Playwright runs one long run per level in each browser, posts the hash stream, compares to Node | CI, and before each milestone gate |
| 7 | **Render independence** | Drawing never changes the game | Same run headless, with renderer at 30, 60 and 144 fps, and with tab throttling; hashes equal | CI |
| 8 | **Map compiler** | Every level compiles, has no leaks, solid matches the simulation, build is reproducible | `content/` tests ([acceptance](#turning-2d-maps-into-3d)) | When `content/` or `sim/` changes |
| 9 | **Golden images** | Rendering has not regressed | Headless Chrome with **SwiftShader** (deterministic software GL) renders fixed ticks from fixed cameras, pixel diff with small tolerance | Every commit touching `engine/` or `client/` |
| 10 | **Fuzz and invariants** | No crash or NaN, player inside world, entity count bounded | Random tick inputs, every level, 10k ticks, assert invariants each tick | Nightly |
| 11 | **Performance budget** | Smooth on a mid laptop | Frame time, draw calls and BSP size per level, against limits in `tests/budgets.json` | CI (trend), gate at milestones |
| 12 | **Licence scan** | No id assets slip in | Reject `.pak`, known id file hashes, the `id1/` path | Pre-commit + CI |

Golden images and winning runs, like WEaBuse's won list, are **only replaced on purpose**,
in a commit that says why. A test is never edited to make a change pass.

Levels 0 to 4 are finished under the 3D rules by those runs (`tests/depth-win.test.mjs`), and the page plays
them: **Watch levels 0–4 in 3D** plays each level's run in first person under the 3D rules, exactly as the tests
and the search play it (`client/autopilot.js`), and goes on from one level to the next. It plays them as a 3D player would: it aims
its shots across the hall at the foe it is fighting, and its view turns to that foe (up and down too), else the
way it runs, along and across the hall; on a ladder it faces the ladder and looks up or down. (The routes are
still WEaBuse's 2D ones; a 3D search of every level is to come.)

The 3D finish tests replay WEaBuse's recorded 2D runs under the 3D rules (`tools/depth-harness.mjs`). Where a
piece of a run no longer survives a change to the 3D rules, `tools/depth-run-search.mjs` finds inputs for that
piece that do, reaching where the next piece starts, and keeps them in `tests/data/depth-runs.json` (WEaBuse's
own recording is not touched). Level 1's piece 33 has them since the Quake step-down: the recorded inputs ran on
past the next piece's start into enemy fire with 19 health; the new ones stop there with 42.

---

## The AI loop

This project is meant to be built mostly by AI agents (Claude Code) running in a loop, with
a human at each milestone gate. There are three loops: one **builds**, one **plays**, and one
**reviews**.

### Loop 1: the build loop (agents writing code)

A driver, `tools/agent-loop.sh` (written in M3), runs Claude Code headless (`claude -p`)
in iterations, or an interactive session uses `/loop`. Each iteration does the following:

1. **Orient.** Read `CLAUDE.md`, this README's current milestone, the last entries of
   `LOOP_LOG.md`, and `BACKLOG.md`.
2. **Pick one task.** Take the first unchecked task of the current milestone in `BACKLOG.md`.
   It should be small enough for one commit.
3. **Read the source of truth first.** The Abuse source for behaviour, the Quake source for
   engine code. Note the file and symbol being ported.
4. **Make the smallest change** that does the task, with its tests in the same change.
5. **Verify.**
   - `npm test`, which runs layers 1–5 (plus 8 and 9 when relevant).
   - For anything visual: screenshot with headless Chrome over CDP and **look at it**
     (full page, check element boxes), as WEaBuse's rules require.
6. **Decide.**
   - **Green:** commit with a message citing the sources. Tick the task. Append to
     `LOOP_LOG.md` what changed, the evidence, and anything the next agent should know.
   - **Red after 3 honest attempts:** revert, move the task to *Blocked* in `BACKLOG.md`
     with the failing output and the agent's best diagnosis, then move on.
7. **Stop** when the milestone's exit criteria all pass. A human then plays the build and
   approves the gate before the next milestone opens.

**Guardrails.** These are written into `CLAUDE.md` and enforced by hooks where possible.
- Never weaken, skip or rewrite a test or golden image to get green.
- Never take a level off the won list.
- Never add Quake game data. The licence scan runs as a pre-commit hook.
- Never use banned APIs in `sim/`. Lint runs as a pre-commit hook.
- Ask the human before departing from Abuse behaviour. Accepted departures go under
  [Jared rules](#jared-rules).
- **Parallel agents** each work in their own git worktree on independent tasks (for example,
  engine sprites alongside a content-compiler task). At most **3 heavy processes** run at
  once (search, browsers, map builds) on a ~9 GB machine.
- `AGENT_HANDOFF.md` is rewritten at the end of every session, so a fresh agent with no
  context can continue.

### Loop 2: the play loop (AI proving the game is winnable)

WEaBuse's **Go-Explore search** (`tools/search.mjs`) plays the real simulation thousands of
times faster than real time. It keeps an archive of distinct situations and explores from the
most promising, and it found winning runs for all 22 levels.
- **In lane mode** the simulation is WEaBuse's, so the existing runs already apply. The search
  only reruns when a deliberate fidelity change makes old runs drift (as in WEaBuse's rule 5).
- **In depth mode** the search is pointed at the 3D simulation, with cells extended by a depth
  band, and it re-solves every level. A level counts as playable in depth mode only when the
  search wins it.
- Every winning run is a regression test, a determinism test (layers 2, 3 and 6), and the
  in-game **Demo** button.

### Loop 3: the review loop (AI looking for what tests miss)

- **Visual playtest.** For each level, play its winning run in the browser and take a
  screenshot every N ticks in each camera. An agent reviews them for missing textures,
  z-fighting, floating or buried sprites, light leaks, and the camera inside a wall. Each
  finding becomes a `BACKLOG.md` task with the tick and camera. The review is advisory,
  never a gate.
- **Side by side.** The same tick in 2D WEaBuse and 3D Classic mode, next to each other, makes
  mismatches (missing objects, wrong positions) easy to spot.
- **Code review.** Every ~10 commits, run `/code-review` on the range and turn its findings
  into tasks.

---

## Milestones

Each milestone has **exit criteria**, which are tests, not opinions. The loop does not
start the next milestone until they pass and a human has signed off.

### M0: First walk
Level 0 compiled into a Quake BSP, and you can walk around in it in the browser.
- `content/`: level 0 read with WEaBuse's own parser, tile shapes extruded, compiled by our
  JavaScript BSP compiler into **BSP2** with textures (Abuse tiles, Abuse palette), clip hulls
  and baked lightmaps (Abuse's light formula).
- `engine/`: BSP2 loader, `SV_RecursiveHullCheck` and the player walk physics ported from
  Quake, deterministic angle tables, and a WebGL2 world renderer.
- `client/`: first-person walking (pointer-lock mouse look, WASD, jump) on a fixed 15 Hz tick,
  with interpolated drawing.
- **Exit:** the build is byte-for-byte reproducible. The compiled world is solid exactly where
  the simulation's tiles are solid. A scripted walk never enters a wall and gives the same hash
  twice in Node and in Chrome. Screenshots of level 0 have been checked. A human walks around
  level 0.

### M1: Level 0, complete, with 3D models
Level 0 is playable from the start to its exit in 3D. WEaBuse's simulation runs the game, and
every object it draws becomes a 3D model built from Abuse's own sprites.
- `client/sim-host.js`: WEaBuse's `Game` runs inside the 3D client with a stub 2D renderer, stepped at
  its own 60 Hz step / 15 Hz logic tick. The 3D camera's pointer is turned into the simulation's aim
  point exactly (aim = mouse + cam, `game.js updatePlayer`).
- `client/scene.js`: what WEaBuse's `render()` would draw (entities, the player and gun, projectiles,
  effects, beams), recorded in level pixels instead of drawn. It mirrors `render()`'s entity section
  and never changes simulation state.
- `engine/voxel.js`: each sprite frame becomes a voxel model. Every opaque pixel is a column whose
  thickness grows with its distance from the silhouette, so bodies come out rounded. Models are
  merged into runs, coloured from the palette, and cached per frame and facing.
- `engine/render.js`: Abuse's own light formula (lights, area ambient, dimmer switches, the L key)
  evaluated per pixel in the shader for the world and the models alike; a front cap layer (solid
  tiles' fronts, so the classic camera sees Abuse's tile art); bullets and beams as small boxes.
- **First person, like Quake** (Jared: "I want it 3D POV like Quake"). Mouse look is free in pitch and
  yaw; W A S D move relative to the view (cl_input.c CL_BaseMove) and the part of the move along the
  lane drives Abuse's left/right; the aim is the view direction projected onto the lane. The 2.5D
  cameras (angled and side) are kept on the branch `feature/2.5d`.
- Abuse's controls, HUD, help messages and voice-overs, sound, death and checkpoints all come
  from the simulation. A **Watch** button plays the recorded winning run of level 0 in 3D.
- **Exit:** in Node, the recorded run of level 0 replayed through the 3D client's host reaches the
  exit; recording the scene every step never changes the game (same state hash with and without);
  voxel models are deterministic and closed; screenshots of the flyers, the player, doors and lifts
  checked; a human finishes level 0 by hand.

### M2: Depth mode (3D gameplay)
The levels become rooms you move through in all three dimensions, and the objects take their places in 3D.
WEaBuse's simulation stays the brain: it runs every rule in its 2D plane, and a **depth layer**
(`client/depth.js`) gives the player and every object a position across the lane, deciding when two
things meet in 3D.
- **The lane widens** from 128 to 320 units (LANE = 160), so corridors become halls. The geometry
  stays an extrusion of the 2D map, so the simulation's collision is still exact everywhere.
- **The player moves in depth** with W A S D relative to the view. The part along the lane drives
  Abuse's own running and jumping, and the part across it is the depth layer's.
- **Where things are:**
  - *Wall-mounted, on the back wall:* switches, the switch ball, the pointer sign, spray-gun turrets
    and ant cracks. You walk up to the wall to use them, and shoot them where they hang.
  - *On the floor, at a spot:* teleporters and springs, made as deep as they are wide. You step onto them.
  - *Items* (health, ammo, power-ups) at their own depth, spinning like Quake's.
  - *Enemies* (flyers, ants) move in depth toward the player, and their shots are aimed in 3D.
  - *Spanning the hall:* doors, hidden walls, force fields, lifts, lava, boulders, exits and every
    sensor and logic gate. Otherwise you could walk round a door or a lava pit.
- **Meeting in 3D:** a pickup, switch, teleporter or touch counts only at the right depth
  (`touchesPlayer`). Contact damage counts only from an enemy at your depth (`hurtPlayer`, with the
  behaviour that is running). A shot travels in depth along its 3D direction and hits only what is at
  its depth there. A blast falls off with 3D distance.
- **Hooks in WEaBuse:** projectile hits and blasts are decided inside `weapons.js`, so WEaBuse gains two
  inert hooks (`g.apart?.(shot, target)` in `hitAt` and `explode`). They do nothing in the 2D game, and
  its regression still passes bit for bit. Everything else is wrapped from the 3D client.
- **Watch** plays the recorded run under 2D rules (the depth layer is off), since the run was found in 2D.
- **Exit:** WEaBuse's 22-level regression passes with the hooks. Node tests: an item is picked up only at
  its depth; a switch works only at the wall; an enemy shot aimed at your depth hits and one beside you
  misses; a shot aimed along the hall hits an enemy at that depth; enemies close in on your depth; a
  scripted 3D session repeats exactly. Screenshots of a wall switch, a floor teleporter, items and flyers
  in the hall are checked, and a human finishes level 0 in 3D.

### M3: Skeleton
- Repo, `CLAUDE.md`, `BACKLOG.md`, `LOOP_LOG.md`, `tools/agent-loop.sh`, pre-commit hooks
  (lint, licence scan, fast tests), CI (GitHub Actions).
- `ref/` fetch script for abuse-0.8, id's Quake GPL source and WebQuake (git-ignored).
- WEaBuse added as the `sim/` submodule (done in M0). Headless runner works from this repo.
- **Exit:** `npm test` runs WEaBuse's 22-level regression from this repo and passes.

### M4: Determinism hardening (work done in WEaBuse, which benefits too)
- Split the simulation from presentation in WEaBuse.
- Replace `Math.atan2`, `sin` and `cos` in the simulation with integer tables ported from Abuse.
- `stateHash()`, the canonical tick-input format, and conversion of the existing runs to it.
- Lint scoped to the simulation.
- Re-search any levels whose runs drift (expected, since angles move by up to a degree).
- **Exit:** layers 2, 3, 5 and **6 (cross-browser)** pass on all 22 levels.

### M5: Engine core
- WebGL2 context, console, cvars, commands, and the main loop (fixed 15 Hz tick, display-rate frames).
- BSP2 loader, PVS, frustum culling, surfaces, lightmap atlas, lightstyles, the palette and
  colormap shader, and a free-fly camera.
- Tested on a **home-made test map** (our own brushes and textures, nothing from id).
- **Exit:** unit tests for the loaders; golden images of the test map; 60 fps on the reference laptop.

### M6: Map compiler
- The level compiler for all levels: tile textures (palette-index), slopes from boundary polygons, back wall, lights
  and lightstyles, brush models for doors and lifts, all 22 levels.
- **Exit:** layer 8 passes on all 22 levels. You can free-fly every level in the browser.

### M7: Lane mode is a game
- The simulation drives the world. Objects drawn as sprites. Classic camera. Input.
  Statbar HUD. Doors and lifts follow the simulation. Switchable lights work.
- **Exit:** layers 1–7 and 9 pass. **The Demo button plays all 22 levels in 3D.**
  A human finishes level 0 by hand.

### M8: Cameras
- Chase (default) and First person, with the aim angle mapped from mouse look and
  turn-around. Camera collision against the BSP (presentation only). Near-wall handling per camera.
- **Exit:** golden images per camera. Runs recorded in each camera replay the same
  in the others and in 2D WEaBuse.

### M9: Looks
- Voxel models from sprites, dynamic lights, particles, and Abuse's effects in 3D.
- **Exit:** golden images updated on purpose. Performance budget met on all levels.

### M10: Sound, music, menus, mobile, deploy
- `S_Spatialize`-style 3D audio on Web Audio, music (if the licence question is settled),
  title and menus, touch controls, GitHub Pages.
- **Exit:** a human plays through. CI deploys on green.

(Depth mode, once M10 here, was pulled forward to M3.)

---

## Risks and open questions

| Risk | Mitigation |
| --- | --- |
| Removing `Math.atan2` and the rest changes aim by up to 1°, so recorded runs drift | Expected. Re-search drifted levels (M4). It is a one-time cost. |
| Our own BSP compiler has bugs a mature one would not | Tests check every level: structure, reproducibility, and that it is solid exactly where the simulation is. |
| Levels too big for BSP limits | BSP2. Split very large levels into brush groups. Measure in M6. |
| Some sprite-art scenes look wrong extruded (for example signs or decor meant to be seen flat) | Per-tile and per-sprite overrides table in `content/overrides.json`, reviewed visually. |
| First person hides threats behind the player | Chase is the default. First person gets a rear-view strip or radar if playtests ask for it. |
| Safari WebGL2 or Web Audio quirks | Layer 6 runs WebKit, and layer 9 runs on SwiftShader. Check real Safari at each gate. |
| Bobby Prince sfx/music licence | Confirm before M10. Keep audio swappable. |
| The simulation submodule and WEaBuse drift apart | Pin the commit. Bumping it is a task that must pass all layers. |

**Open questions for the human** (to answer at the M3 gate):
- ~~Repo name and hosting~~: settled, public at
  [github.com/jrodimusprime/WEaBuse3D](https://github.com/jrodimusprime/WEaBuse3D).
- Should a new camera mode or depth mode ever change Abuse's rules (for example, enemies that
  can see you in depth)? Any such change belongs under Jared rules.

---

## Jared rules

Deliberate departures from the original Abuse 0.8 go here, the same way they do in WEaBuse.
Departures inherited from WEaBuse's simulation (such as level 5's jetpack room door)
apply here too and are listed in WEaBuse's README.

- **Faster player bullets.** In first person the player's bullets fly 2.5 times faster than the original's,
  with the same reach: the life of each bullet is cut to the fewest ticks that cover the original distance
  (`client/depth.js` `quicken`, after weapons.js sgun_ai). Jared: "player bullet speeds dont feel right,
  needs to be faster". Each bullet is drawn as a glowing tracer along its path through 3D.
- **Ants run up the side walls.** Abuse's ants leap to the roof; in 3D the hall also has side walls, so an
  ant running at the player may leap onto the nearer one, cling there up to 40 px up and scuttle along it
  towards the player, spit from it, then spring off at the player (when the player is under it, when it is
  shot, when its way is blocked, or after under three seconds). Jared: "can they also do one where they jump
  on the walls?". It lives in the depth layer (`client/depth.js` `wallRun`), so the simulation, and WEaBuse,
  are unchanged; its chances come from the tick and the ant, not the simulation's random numbers.
- **Packs spread across the hall.** The depth layer brings enemies in on their own flank of the player
  (up to 90 units either side, narrowing to the player's depth within 110 px), and keeps enemies near each
  other apart across the hall, so a pack does not come in single file. Jared: "the creatures also tend to
  spawn in a straight line ... they should be spaced out more".
- **The city outside is further away.** Abuse scrolls its background at the level's rate, often 5/8 across
  and 1:1 up and down, which in 3D put the city just behind the glass and fixed it to the wall when jumping.
  Each window now looks out on a plane at least 4 lane depths behind the middle of the hall (Abuse's own depth,
  1 / rate, where that is further), anchored on the picture Abuse shows behind that window, so the city slides
  by slowly as you pass. It is lit by Abuse's own lamps but not by the hall's flashes, and hazed. Jared: "the
  images in the window appear too near ... takes away from the atmosphere", then "may be too far".
- **The weapons are the original's.** WEaBuse simplified them (the fire bomb a grenade, plasma, frisbee and saber
  one plasma bolt, the player's rockets not locking on, one's own blasts hurting). In 3D they work as Abuse 0.8's
  source has them (sim `Game.originalWeapons`, on here, off in WEaBuse, whose recorded runs used its own): the
  fire bomb runs along the floor burning, plasma and the saber are lines traced at once, the frisbee steers to
  the aim, rockets lock on to what they can see, and one's own blasts spare one. Jared: "make sure they align in
  functionality and damage" (`tests/weapons.test.mjs`).
- **Jump pads sit on the floor.** Abuse hangs some jump pads in the air, to be met in a jump; in 3D a pad in
  the air read as broken, so one within 120 px above a floor or step is set down on it (both the pad and where
  it throws the player from), and put back when the depth layer comes off. Jared: "the jump pad on the stairs
  ... closer to the stairs".
- **Track guns fire three times as often.** Across the hall most of a turret's shots go wide, so the track guns
  (not the spray guns, which already sweep a shot every tick or two) fire three times as often as in Abuse.
  Jared: "the turent lasers arent as dangerous as they shoot through the whole room ... speed them up".
- **J: the jetpack, a hack.** J puts the jetpack (Abuse's fly power, flown on the right mouse button) in hand,
  wherever one is, and J again puts it down; not while a recorded run plays. Abuse has no such key. Jared:
  "J jetpack (hack)".
