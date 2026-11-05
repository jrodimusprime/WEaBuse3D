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
- **Machine limits.** About 9 GB of RAM, so run at most 3 heavy processes at once (search, browsers, map builds).

## Each loop iteration
1. Read this file, the README milestone, the tail of LOOP_LOG.md, and BACKLOG.md.
2. Take the first unchecked task of the current milestone.
3. Read the source of truth for it.
4. Make the smallest change, with its tests.
5. Run `npm test`. For visual changes, also take a screenshot and look at it.
6. If green, commit, tick the task, and append to LOOP_LOG.md. If still red after 3 attempts, revert, record the task under Blocked with the output, and move on.
7. Stop when the milestone exit criteria pass. A human signs off each gate.
