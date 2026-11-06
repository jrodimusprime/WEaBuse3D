# Rules for agents working in WEaBuse3D

The plan is README.md. Read its current milestone before doing anything.
These rules are binding. If a task seems to need breaking one, stop and ask the human.

## Sources of truth (higher wins)
1. Abuse 0.8 original (`ref/abuse-0.8/src`, `ref/abuse-0.8/data/lisp`, `data/addon`) decides game behaviour.
2. WEaBuse's simulation (`sim/` submodule) is the oracle. In lane mode the game must match it tick for tick.
3. id's Quake GPL source (`ref/quake`) decides engine behaviour. WebQuake (`ref/webquake`) is a cross-reference only.

Cite the source file and symbol you port in every commit (`gl_rsurf.c R_RecursiveWorldNode`, `cop.cpp player_move`).

## Hard rules
- **No Quake game data, ever.** That means no `.pak` files, no id models, textures, sounds or maps, and no script that downloads them. Use test maps and textures we made ourselves.
- **Determinism.** Code in `sim/` must not use `Math.random`, `Math.sin`/`cos`/`tan`/`atan2`/`pow`/`exp`/`log`, `Date`, `performance`, the DOM, or anything under `engine/` or `client/`. Use integer tables and the simulation's own PRNG. The presentation layer reads simulation state and never writes it.
- **Fixed 15 Hz tick.** The simulation never sees frame time.
- **Tests are not edited to pass.** Golden images and winning runs are replaced only on purpose, in a commit that says why. Never take a level off the won list.
- **Visual changes are verified by screenshot.** Use headless Chrome over CDP, full page, and look at the result.
- **Key bindings** never overlap game controls (arrows/WASD, Space/Up, Down/E, 1-7/wheel, mouse buttons, L, G). Use F-keys or the console.
- **Departures from Abuse** need the human's approval. Approved ones are listed under "Jared rules" in README.md.
- **Decisions are recorded** in the private repo conv_tractics (https://github.com/jrodimusprime/conv_tractics, cloned at ../conv_tractics): add each decision about the conversion (a rule, a departure, a choice the human made, a change of approach) to its Decisions table, with the date and why, and push it.
- **Machine limits.** About 9 GB of RAM, so run at most 3 heavy processes at once (search, browsers, map builds).

## Each loop iteration
1. Read this file, the README milestone, the tail of LOOP_LOG.md, and BACKLOG.md.
2. Take the first unchecked task of the current milestone.
3. Read the source of truth for it.
4. Make the smallest change, with its tests.
5. Run `npm test`. For visual changes, also take a screenshot and look at it.
6. If green, commit, tick the task, and append to LOOP_LOG.md. If still red after 3 attempts, revert, record the task under Blocked with the output, and move on.
7. Stop when the milestone exit criteria pass. A human signs off each gate.

## 3D conversion rules (binding for every object brought into 3D)
1. **Design every model; never just extrude a sprite.** Read the sprite's frames first (render them, look at
   them) and work out what the thing *is*: its parts, materials, colours and how it moves. Then build a real
   3D model from primitives (boxes, cylinders, spheres, tori, lathes) in the sprite's own palette colours,
   with the detail a Quake-era model would have. Take inspiration from what the 2D art implies (a sprite
   that narrows over its frames is turning; a door whose middle lifts is a panel sliding up).
2. **Animate from the simulation's state.** The model's pose comes from the object's state, frame and
   aistate (a door's openness from running/blocking/walking, a lift's lamp from running), plus presentation
   time (spin, bob, glow). The model never changes the simulation.
3. **Keep things their own size.** A door is door-sized and stands in a doorway; a lift is lift-sized and
   runs in a shaft. Whatever the object does not cover across the hall is closed by *frame* geometry (walls
   beside a doorway, walls around a shaft), and the depth layer enforces it: the player passes only through
   the opening, and shots stop at the frame. Never stretch an object across the whole hall to make a puzzle
   work.
4. **Place things where they would be in a 3D level:** buttons on walls, pads on floors, items on the ground
   where you can walk over them, enemies free to move across the hall.
5. **Move like a 3D shooter.** On a ladder, walking forward while looking up climbs and looking down
   descends; Space jumps off it. A ladder through a floor climbs through a hole of its own against the back
   wall. On slopes the player stays on the ground, as in Quake. Use is "walk up to it and press E".
6. **The voxel extrusion is a placeholder only.** Every object still drawn by it is listed in BACKLOG.md
   under "Models awaiting design" until it has a designed model.
7. Check every new model with screenshots from several angles and in motion before ticking it off.
8. **Atmospheric light everywhere** (Quake's great feature, and Abuse was lit the same way). Nothing is lit
   flat. Every light source has a visible fixture and a glow (halo); everything that burns or shines casts
   coloured dynamic light on what is around it: muzzle flashes, explosions, shots and rockets, lava,
   screens, pads, beams, lamps on lifts and switches. Leave darkness between the pools of light, let some
   lamps flicker (Quake's lightstyles), and keep the haze with distance. A new object that emits light is
   not done until it lights the room (client/atmosphere.js) and its glowing parts glow (additive parts).
9. **Controls must feel like Quake's.** A press must never be lost to a bump: jumps are buffered and allowed
   just after leaving the ground (client/controls.js); test movement on slopes, steps and edges.
10. **Quake's palette and resolution.** Every frame is drawn at about Quake's resolution (~400 lines) and
    snapped to Quake's 256-colour palette (web/palettes/quake.lmp, from LibreQuake under BSD; never id's
    pak files). Design colours as if picking from Quake's ramps: earthy browns, greys, muted greens and
    the few fullbright reds, oranges and yellows for things that glow. Avoid pure, saturated primaries.
    Abuse's art keeps its shapes and is drawn through the same palette.
