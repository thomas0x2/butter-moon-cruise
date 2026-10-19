// Tiny WebAudio blips so the prototype has feedback without audio files.

type Cue = 'pick' | 'place' | 'ding' | 'coin' | 'nope' | 'toss' | 'bell' | 'miss' | 'burn' | 'start';

const CUES: Record<Cue, [number, number, OscillatorType][]> = {
  pick: [[660, 0.06, 'square']],
  place: [[440, 0.06, 'square']],
  ding: [[880, 0.08, 'triangle'], [1320, 0.16, 'triangle']],
  coin: [[988, 0.07, 'square'], [1319, 0.14, 'square']],
  nope: [[180, 0.12, 'sawtooth']],
  toss: [[220, 0.08, 'triangle'], [150, 0.08, 'triangle']],
  bell: [[1046, 0.12, 'sine'], [784, 0.2, 'sine']],
  miss: [[330, 0.12, 'square'], [247, 0.2, 'square']],
  burn: [[120, 0.3, 'sawtooth']],
  start: [[523, 0.08, 'square'], [659, 0.08, 'square'], [784, 0.16, 'square']],
};

let ctx: AudioContext | null = null;
export let muted = false;

export function toggleMute() {
  muted = !muted;
  return muted;
}

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function sfx(cue: Cue) {
  if (muted || !ctx) return;
  let at = ctx.currentTime;
  for (const [freq, dur, type] of CUES[cue]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + dur);
    at += dur * 0.8;
  }
}
