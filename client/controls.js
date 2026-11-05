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
