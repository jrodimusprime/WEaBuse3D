// Jumping that works on slopes, like Quake's.
//
// WEaBuse queues a jump only on a frame where the player is standing (game.js
// updatePlayer: `if (jump && p.ground) p.jumpQueued = true`). Walking over a
// slope's little steps, `ground` drops out for a frame now and then, and a
// press on that frame was lost (Jared: "there are some mini bumps that mean
// your jump press doesn't work"). Quake keeps the player on the ground there.
//
// So a press is remembered for a moment (the buffer), and counts if the player
// stood within the last moment (coyote time): it queues the jump the game
// would have queued. Deterministic: it depends only on the input and the game.
//
// Standing is Quake's: anything under the body's box holds the player up (Quake's hull), not only what is
// under its centre, as Abuse has it. Over a gap narrower than the body (level 2 has a floor slit by the
// lift) the player runs on, held up at both edges, but Abuse counts them in the air for ten frames.
export const JUMP_BUFFER = 9; // steps (60 a second) a press is remembered: 150 ms
export const COYOTE = 8; // steps after leaving the ground that a jump is still allowed: 133 ms

const HALF_W = 6, BODY_H = 29; // the player's box (sim game.js)
export const standing = (g, p) => p.ground || (p.vy >= 0 && g.boxHits(p.x, p.y + 1, HALF_W, BODY_H, g.around));

export class JumpAssist {
  constructor() { this.buffer = 0; this.sinceGround = 99; this.held = false; }

  // Call once a step, before g.update, with whether the jump key is down.
  step(g, held) {
    const p = g.player;
    this.sinceGround = standing(g, p) ? 0 : this.sinceGround + 1;
    if (held && !this.held) this.buffer = JUMP_BUFFER;
    this.held = held;
    if (this.buffer <= 0) return;
    this.buffer--;
    if (!p.dead && !p.climbing && p.vy >= 0 && this.sinceGround <= COYOTE) {
      p.jumpQueued = true; // taken on the next 15 Hz tick, exactly as a standing press would be
      this.buffer = 0;
    }
  }
}

// On a ladder, like a 3D shooter: walking forward (fwd 1, backward -1) looking up (pitch below -20 degrees)
// climbs, looking down descends; returns 1 up, -1 down, 0 neither (forward then walks along the hall).
// Up climbs only below a ladder's top: on top Abuse has let go, and Up there is a jump, so holding it hopped
// again and again (Jared: "you can get caught in a loop jumping"). It still hops where another ladder goes on
// up above, to catch it (game.js updatePlayer: "that hop is how one ladder leads to the next"). Just after a
// jump off a ladder (`justOff`) it does not catch the player again.
export function climbIntent(g, fwd, pitch, justOff = false) {
  const p = g.player;
  const over = (l) => p.x >= l.x0 - 5 && p.x <= l.x1 + 5;
  const onLadder = g.ladders.some((l) => over(l) && p.y >= l.y0 && p.y <= l.y1 + 3); // (3 px of grace at the foot, as game.js inLadder)
  if (!onLadder || justOff || fwd === 0 || Math.abs(pitch) <= 20) return 0;
  const climb = pitch < 0 ? fwd : -fwd;
  if (climb < 0) return -1;
  // (p.ladderExit: Abuse has just let go of the player off this ladder's top, and Up is a jump until they step away)
  const below = p.climbing || (!p.ladderExit && g.ladders.some((l) => over(l) && p.y > l.y0 + 2 && p.y <= l.y1 + 3));
  const above = g.ladders.some((l) => over(l) && l.y1 < p.y && l.y1 > p.y - 60);
  return below || above ? 1 : 0;
}
