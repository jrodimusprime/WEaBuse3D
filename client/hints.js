// Abuse's hints, said for the 3D controls (Jared: "it says press down to active platform on screen and with voice
// over. can you make it say press E instead in both voice and on screen"). The simulation's hints (behaviors.js
// HINTS) name Abuse's keys; here each one that names a key reads as this game's controls, on screen, and is
// spoken in those words by the browser's own voice (Abuse's recordings cannot say them), low and slow to suit.
// Hints that hold as they are keep Abuse's own voice.
export const HINTS_3D = {
  'Press the down key to activate objects. This is a switch.': 'Press E to activate objects. This is a switch.',
  'This console saves the state of the game, press down': 'This console saves the state of the game, press E',
  'Press down to activate platform': 'Press E to activate the platform',
  'Use the CTRL & INS keys (or 1-7, or the mouse wheel) to select weapons': 'Use 1 to 7, or the mouse wheel, to select weapons',
  'Press the up key to climb ladders': 'Walk forward looking up to climb ladders',
  'Press the down key to start!': 'Press E to start!',
  'Press down to teleport': 'Press E to teleport',
};

// Takes over the game's showHelp: the 3D words on screen, and spoken.
export function sayHints(g) {
  const show = g.showHelp.bind(g);
  g.showHelp = (text, voice) => {
    const said = HINTS_3D[text];
    if (!said) return show(text, voice);
    show(said, null);
    if (voice && g.helpVoice !== voice) { g.helpVoice = voice; speak(said, g); }
  };
}

function speak(text, g) {
  const s = globalThis.speechSynthesis;
  if (!s || g.audio?.muted || g.audio?.userMuted) return;
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = 0.55; u.rate = 0.88; u.volume = 1;
  const v = s.getVoices().find((x) => /en[-_](GB|US)/i.test(x.lang) && /male|daniel|fred|alex|google uk english male/i.test(x.name)) || s.getVoices().find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  s.cancel();
  s.speak(u);
}
