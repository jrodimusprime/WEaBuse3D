// Abuse's hints, said for the 3D controls (Jared: "it says press down to active platform on screen and with voice
// over. can you make it say press E instead in both voice and on screen"). The simulation's hints (behaviors.js
// HINTS) name Abuse's keys; here each one that names a key reads as this game's controls, on screen, and is
// spoken in those words in the manner of Abuse's own voice-overs (tools/make-voices.mjs; Abuse's recordings
// cannot say them. Jared: "the atmosphere of the initial voiceover has been lost, can you generate the audio in
// the same fashion?"). Hints that hold as they are keep Abuse's own voice.
export const HINTS_3D = {
  'Press the down key to activate objects. This is a switch.': 'Press E to activate objects. This is a switch.',
  'This console saves the state of the game, press down': 'This console saves the state of the game, press E',
  'Press down to activate platform': 'Press E to activate the platform',
  'Use the CTRL & INS keys (or 1-7, or the mouse wheel) to select weapons': 'Use 1 to 7, or the mouse wheel, to select weapons',
  'Press the up key to climb ladders': 'Walk forward looking up to climb ladders',
  'Press the down key to start!': 'Press E to start!',
  'Press down to teleport': 'Press E to teleport',
};

// each line's voice-over: made by tools/make-voices.mjs in the manner of Abuse's (web/voice)
export const VOICES_3D = {
  'Press E to activate objects. This is a switch.': 'switch_e',
  'This console saves the state of the game, press E': 'save_e',
  'Press E to activate the platform': 'platform_e',
  'Use 1 to 7, or the mouse wheel, to select weapons': 'weapon_e',
  'Walk forward looking up to climb ladders': 'ladder_e',
  'Press E to start!': 'start_e',
  'Press E to teleport': 'teleport_e',
};
// (the game's audio fetches sfx/<name>.wav from the simulation's data: this reaches web/voice instead)
const CLIP = (name) => `../../../../web/voice/${name}`;

// Takes over the game's showHelp: the 3D words on screen, and their voice-over through the game's own audio,
// as Abuse's clips are played (game.js showHelp: once, when the hint comes on).
export function sayHints(g) {
  const show = g.showHelp.bind(g);
  g.showHelp = (text, voice) => {
    const said = HINTS_3D[text];
    if (!said) return show(text, voice);
    show(said, null);
    if (voice && g.helpVoice !== voice) { g.helpVoice = voice; g.audio.play(CLIP(VOICES_3D[said]), null); }
  };
}
