// Sound effects, made on the phone with the Web Audio API: tones and filtered
// noise shaped into knocks, chimes, cracks and gongs. There are no audio files
// to download, license or allow in the CSP.
//
// PRIVACY: phones sit side by side, and a sound carries further than a glance.
// So, like the buzz and the animations, a sound only ever follows something
// the whole table already knows (a reveal, a public turn, the Lady's choice),
// and it is the same for every role and every answer. Locking in a vote or a
// quest card makes one identical click whatever was chosen; choosing makes no
// sound at all; holding your role card is silent.
//
// Off with Menu → Sound effects. iPhones on silent stay silent.

import { prefs } from './prefs.js';

let ctx = null;
let out = null; // { ac, dest, noise }

// Browsers only let a page make sound once the player has touched it, so the
// audio starts on the first tap (and resumes after a phone call or the like).
export function unlockAudio() {
  const wake = () => {
    if (!prefs.sound) return;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        out = output(ctx, ctx.destination);
      }
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    } catch {
      ctx = null; // no audio on this phone: the game is silent, nothing else changes
    }
  };
  document.addEventListener('pointerdown', wake, true);
  document.addEventListener('keydown', wake, true);
}

// Play a sound now, if sound is on and the page is in front.
export function sound(name) {
  if (!prefs.sound || !ctx || ctx.state !== 'running' || document.hidden) return;
  try {
    schedule(out, name, ctx.currentTime + 0.01);
  } catch {
    // a sound that fails is never worth an error
  }
}

// The volume, a gentle limiter (several sounds can overlap), and three shared
// seconds of noise. Also used to render the sounds offline for a preview.
export function output(ac, destination) {
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 6;
  const dest = ac.createGain();
  dest.gain.value = 0.75;
  dest.connect(limiter).connect(destination);
  const noise = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return { ac, dest, noise };
}

// ---------- building blocks ----------

// A quick rise to `peak`, then an exponential fade over `decay` seconds.
function envelope(o, t, { peak, attack, decay }) {
  const g = o.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function tone(o, t, freq, { type = 'sine', peak = 0.2, attack = 0.005, decay = 0.3, to = null, lowpass = null } = {}) {
  const osc = o.ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  let node = osc;
  if (lowpass) {
    const f = o.ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    node = node.connect(f);
  }
  node.connect(envelope(o, t, { peak, attack, decay })).connect(o.dest);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

function noise(o, t, { type = 'bandpass', freq = 2000, to = null, q = 1, peak = 0.2, attack = 0.002, decay = 0.1 } = {}) {
  const src = o.ac.createBufferSource();
  src.buffer = o.noise;
  const f = o.ac.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  src.connect(f).connect(envelope(o, t, { peak, attack, decay })).connect(o.dest);
  src.start(t, Math.random() * 0.4);
  src.stop(t + attack + decay + 0.05);
}

// Phone speakers can't play much below 200 Hz, so every low sound also has
// a body an octave or two up that they can.
const thud = (o, t, { peak = 0.45, freq = 140 } = {}) => {
  tone(o, t, freq, { to: 50, peak, decay: 0.16 });
  tone(o, t, freq * 2, { type: 'triangle', to: 110, peak: peak * 0.55, decay: 0.12 });
  noise(o, t, { type: 'lowpass', freq: 1400, peak: peak * 0.5, decay: 0.06 });
};
const notes = (o, t, freqs, opts, gap = 0) => freqs.forEach((f, i) => tone(o, t + i * gap, f, opts));

// Note frequencies (Hz).
const C4 = 261.63, E4 = 329.63, G4 = 392, A4 = 440, C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, B6 = 1975.5;
const D2 = 73.42, F2 = 87.31, A2 = 110, C3 = 130.81, Eb3 = 155.56;

// ---------- the sounds ----------

const SOUNDS = {
  // Your turn: two soft bells, rising.
  turn: (o, t) => {
    tone(o, t, G5, { type: 'triangle', peak: 0.2, decay: 0.35 });
    tone(o, t + 0.12, C6, { type: 'triangle', peak: 0.2, decay: 0.55 });
  },
  // The night begins: a low, soft gong.
  night: (o, t) => {
    notes(o, t, [C3, C3 * 1.5, C3 * 2.38, C3 * 4, C3 * 5.4], { peak: 0.12, attack: 0.02, decay: 2.2 });
    noise(o, t, { type: 'lowpass', freq: 600, peak: 0.08, decay: 0.4 });
  },
  // Someone sits down in the lobby.
  pop: (o, t) => tone(o, t, 520, { to: 900, peak: 0.16, decay: 0.09 }),
  // A knight is picked on the ring.
  tick: (o, t) => {
    tone(o, t, 1400, { type: 'triangle', peak: 0.15, decay: 0.05 });
    noise(o, t, { freq: 3200, q: 2, peak: 0.12, decay: 0.03 });
  },
  // The leader token glides on: a soft rising shimmer.
  glide: (o, t) => notes(o, t, [A4 * 2, 1108.7, E6], { peak: 0.09, decay: 0.3 }, 0.07),
  // Locking in a vote or a quest card: one click, whatever the choice.
  lock: (o, t) => {
    tone(o, t, 240, { type: 'triangle', to: 140, peak: 0.22, decay: 0.08 });
    noise(o, t, { type: 'lowpass', freq: 1600, peak: 0.12, decay: 0.04 });
  },
  // A vote slams onto its row.
  slam: (o, t) => thud(o, t, { peak: 0.3, freq: 170 }),
  // The verdict lands like a seal.
  approved: (o, t) => {
    thud(o, t, { peak: 0.5 });
    notes(o, t + 0.03, [C5, E5, G5], { type: 'triangle', peak: 0.1, decay: 1.1 });
  },
  rejected: (o, t) => {
    thud(o, t, { peak: 0.5 });
    notes(o, t + 0.03, [A2, C3], { type: 'sawtooth', lowpass: 1000, peak: 0.12, decay: 0.8 });
  },
  // The fifth rejection: Evil wins.
  doom: (o, t) => {
    thud(o, t, { peak: 0.6, freq: 110 });
    notes(o, t + 0.03, [D2, F2, A2, D2 * 4], { type: 'sawtooth', lowpass: 900, peak: 0.12, attack: 0.04, decay: 1.8 });
  },
  // Quest cards: the shuffle, a card turning over, then what it shows.
  shuffle: (o, t) => {
    for (let i = 0; i < 6; i++) noise(o, t + i * 0.07, { type: 'highpass', freq: 2800, peak: 0.16, decay: 0.035 });
  },
  flip: (o, t) => noise(o, t, { freq: 900, to: 4200, q: 0.8, peak: 0.45, decay: 0.09 }),
  success: (o, t) => {
    tone(o, t, E6, { peak: 0.17, decay: 0.7 });
    tone(o, t, B6, { peak: 0.07, decay: 0.45 });
  },
  fail: (o, t) => {
    noise(o, t, { type: 'highpass', freq: 1800, peak: 0.3, decay: 0.07 });
    tone(o, t, 95, { to: 45, peak: 0.32, decay: 0.16 });
    tone(o, t, 240, { type: 'triangle', to: 110, peak: 0.18, decay: 0.12 });
    for (let i = 1; i <= 4; i++) noise(o, t + i * 0.028, { freq: 2500 + i * 500, q: 3, peak: 0.08, decay: 0.012 });
  },
  // The last card waits: a low swell.
  tension: (o, t) => tone(o, t, 110, { type: 'sawtooth', lowpass: 700, to: 165, peak: 0.16, attack: 0.3, decay: 0.15 }),
  // The quest's verdict.
  questWon: (o, t) => {
    notes(o, t, [C5, E5, G5], { type: 'triangle', peak: 0.22, decay: 0.45 }, 0.09);
    tone(o, t + 0.27, C6, { type: 'triangle', peak: 0.25, decay: 1.1 });
  },
  questLost: (o, t) => {
    notes(o, t, [98, 98 * 1.51, 98 * 2.38, 98 * 4, 98 * 5.4], { peak: 0.15, attack: 0.01, decay: 1.7 });
    noise(o, t, { type: 'lowpass', freq: 700, peak: 0.14, decay: 0.3 });
  },
  // The Assassin's hold: lub-dub, timed with the beating portrait.
  heartbeat: (o, t) => {
    tone(o, t + 0.09, 72, { to: 40, peak: 0.45, decay: 0.12 });
    tone(o, t + 0.09, 160, { type: 'triangle', to: 80, peak: 0.28, decay: 0.1 });
    tone(o, t + 0.3, 64, { to: 38, peak: 0.32, decay: 0.12 });
    tone(o, t + 0.3, 140, { type: 'triangle', to: 72, peak: 0.2, decay: 0.1 });
  },
  // The blade, then the named player's card.
  slash: (o, t) => {
    noise(o, t, { type: 'highpass', freq: 7000, to: 1200, peak: 0.32, attack: 0.01, decay: 0.24 });
    tone(o, t + 0.05, 2637, { peak: 0.05, decay: 0.55 });
    tone(o, t + 0.05, 3951, { peak: 0.025, decay: 0.4 });
  },
  merlinFound: (o, t) => {
    thud(o, t, { peak: 0.6, freq: 100 });
    notes(o, t, [D2, F2, A2, D2 * 4], { type: 'sawtooth', lowpass: 1000, peak: 0.1, attack: 0.03, decay: 1.6 });
  },
  bladeMissed: (o, t) => notes(o, t, [E5, G5, C6], { type: 'triangle', peak: 0.2, decay: 0.9 }, 0.06),
  // Game over.
  goodWins: (o, t) => {
    notes(o, t, [G4, C5, E5], { type: 'triangle', peak: 0.12, decay: 0.3 }, 0.11);
    notes(o, t + 0.33, [C5, E5, G5, C6], { type: 'triangle', peak: 0.09, attack: 0.02, decay: 1.6 });
    notes(o, t + 0.33, [C4, E4], { peak: 0.1, attack: 0.02, decay: 1.6 });
  },
  evilWins: (o, t) => {
    noise(o, t, { type: 'lowpass', freq: 350, peak: 0.35, attack: 0.4, decay: 1.6 });
    notes(o, t + 0.1, [C3, Eb3, C3 * 1.5, C3 * 2], { type: 'sawtooth', lowpass: 900, peak: 0.11, attack: 0.25, decay: 1.8 });
  },
  // The Lady looks into someone: a water drop and its echoes.
  water: (o, t) => {
    tone(o, t, 380, { to: 1100, peak: 0.26, attack: 0.003, decay: 0.12 });
    tone(o, t + 0.22, 480, { to: 1200, peak: 0.1, attack: 0.003, decay: 0.1 });
    tone(o, t + 0.44, 560, { to: 1300, peak: 0.045, attack: 0.003, decay: 0.08 });
  },
  // She lands with her new holder.
  drop: (o, t) => tone(o, t, 420, { to: 1000, peak: 0.2, attack: 0.003, decay: 0.1 }),
};

export const SOUND_NAMES = Object.keys(SOUNDS);

export function schedule(o, name, t) {
  SOUNDS[name]?.(o, t);
}
