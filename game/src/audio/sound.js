// All sound effects, synthesised with WebAudio at run time: gunshots, explosions, crashes, engine
// note, tyre squeal, police sirens, surf on the beach, and the interface blips. No audio files.
import { game } from '../core/state.js';
import { clamp } from '../core/mathutil.js';

let ctx = null, master = null, sfx = null, music = null, noiseBuffer = null;
let engine = null, screech = null, siren = null, surf = null;

export function audioContext() { return ctx; }
export function musicBus() { return music; }

/** Must be called from a click or key press: browsers only start audio on a user gesture. */
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.connect(master);
  sfx = ctx.createGain(); sfx.connect(comp);
  music = ctx.createGain(); music.connect(comp);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  applyVolumes();
  startLoops();
}

export function applyVolumes() {
  if (!ctx) return;
  master.gain.value = game.settings.master;
  sfx.gain.value = game.settings.sfx;
  music.gain.value = game.settings.music * 0.55;
}

function noise(duration, filterType, f0, f1, gain, when = 0, q = 1, dest = sfx) {
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + duration);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random()); src.stop(t + duration + 0.02);
}

function tone(type, f0, f1, duration, gain, when = 0, dest = sfx) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + duration);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + duration + 0.02);
}

const RECIPES = {
  pistol: (v) => { noise(0.14, 'bandpass', 2400, 700, 0.9 * v, 0, 0.7); tone('sine', 190, 55, 0.12, 0.8 * v); },
  smg: (v) => { noise(0.09, 'bandpass', 3200, 1100, 0.7 * v, 0, 0.8); tone('square', 240, 90, 0.06, 0.25 * v); },
  rifle: (v) => { noise(0.2, 'bandpass', 1900, 500, 1.0 * v, 0, 0.6); tone('sine', 150, 45, 0.16, 0.9 * v); },
  shotgun: (v) => { noise(0.36, 'lowpass', 2600, 240, 1.2 * v); tone('sine', 120, 38, 0.3, 1.0 * v); },
  launcher: (v) => { tone('sine', 260, 60, 0.28, 0.9 * v); noise(0.2, 'lowpass', 900, 200, 0.5 * v); },
  explosion: (v) => { noise(1.5, 'lowpass', 1400, 50, 1.6 * v); tone('sine', 90, 24, 1.1, 1.3 * v); noise(0.25, 'bandpass', 3000, 800, 0.5 * v); },
  punch: (v) => { tone('sine', 170, 60, 0.09, 0.9 * v); noise(0.05, 'lowpass', 1500, 500, 0.5 * v); },
  swing: (v) => { noise(0.14, 'bandpass', 700, 1800, 0.22 * v, 0, 2); },
  thud: (v) => { tone('sine', 110, 40, 0.2, 1.0 * v); noise(0.1, 'lowpass', 700, 200, 0.5 * v); },
  grunt: (v) => { tone('sawtooth', 160, 95, 0.16, 0.16 * v); },
  crash: (v) => { noise(0.4, 'bandpass', 1300, 300, 1.0 * v, 0, 0.5); tone('square', 310, 140, 0.22, 0.2 * v); tone('sine', 90, 40, 0.25, 0.7 * v); },
  glass: (v) => { noise(0.3, 'highpass', 5000, 2500, 0.5 * v); },
  door: (v) => { tone('sine', 130, 70, 0.08, 0.6 * v); noise(0.05, 'lowpass', 900, 300, 0.4 * v, 0.05); },
  horn: (v) => { tone('sawtooth', 392, 392, 0.4, 0.22 * v); tone('sawtooth', 494, 494, 0.4, 0.22 * v); },
  step: (v) => { noise(0.04, 'lowpass', 500, 200, 0.14 * v); },
  pickup: (v) => { tone('sine', 880, 880, 0.09, 0.3 * v); tone('sine', 1320, 1320, 0.14, 0.3 * v, 0.08); },
  cash: (v) => { for (let i = 0; i < 3; i++) tone('triangle', 1500 + i * 400, 1500 + i * 400, 0.06, 0.25 * v, i * 0.06); },
  ui: (v) => { tone('triangle', 620, 620, 0.05, 0.25 * v); },
  uiBack: (v) => { tone('triangle', 420, 380, 0.07, 0.25 * v); },
  wanted: (v) => { tone('square', 740, 740, 0.12, 0.16 * v); tone('square', 990, 990, 0.16, 0.16 * v, 0.13); },
  cleared: (v) => { tone('sine', 660, 660, 0.1, 0.25 * v); tone('sine', 880, 880, 0.2, 0.25 * v, 0.1); },
  missionPass: (v) => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.5, 0.3 * v, i * 0.11)); },
  missionFail: (v) => { [392, 370, 330, 262].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.42, 0.13 * v, i * 0.2)); },
  checkpoint: (v) => { tone('sine', 1040, 1040, 0.08, 0.3 * v); tone('sine', 1560, 1560, 0.12, 0.3 * v, 0.07); },
  reload: (v) => { noise(0.04, 'highpass', 2500, 2000, 0.25 * v); noise(0.05, 'highpass', 3000, 2400, 0.3 * v, 0.22); },
  empty: (v) => { noise(0.03, 'highpass', 3500, 3000, 0.2 * v); },
  spray: (v) => { noise(0.9, 'highpass', 4500, 3500, 0.3 * v); },
  radioTune: (v) => { noise(0.18, 'bandpass', 1200, 4000, 0.18 * v, 0, 3); },
};

/** Plays a one-shot effect. With (x, z) it fades with distance from the camera. */
export function playSound(name, x = null, z = null, volume = 1) {
  if (!ctx || ctx.state !== 'running' || !RECIPES[name]) return;
  let v = volume;
  if (x !== null && game.camera) {
    const d = Math.hypot(x - game.camera.position.x, z - game.camera.position.z);
    if (d > 190) return;
    v *= 1 / (1 + (d / 22) * (d / 22));
  }
  if (v < 0.01) return;
  RECIPES[name](v);
}

function loopNoise(filterType, freq, q = 1) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(sfx); src.start();
  return { filter: f, gain: g };
}

function startLoops() {
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
  o1.type = 'sawtooth'; o2.type = 'square';
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  const g = ctx.createGain(); g.gain.value = 0;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfx);
  o1.start(); o2.start();
  engine = { o1, o2, filter: f, gain: g };
  screech = loopNoise('bandpass', 1700, 6);
  surf = loopNoise('lowpass', 520, 0.4);
  const s = ctx.createOscillator(); s.type = 'sawtooth';
  const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1100; sf.Q.value = 1.2;
  const sg = ctx.createGain(); sg.gain.value = 0;
  s.connect(sf); sf.connect(sg); sg.connect(sfx); s.start();
  siren = { osc: s, gain: sg };
}

/**
 * Continuous sounds, set once a frame. engineRpm 0..1 (or -1 when on foot), slip 0..1 tyre squeal,
 * sirenLevel 0..1 loudness of the nearest siren, surfLevel 0..1 nearness of the sea.
 */
export function updateLoops(engineRpm, throttle, slip, sirenLevel, surfLevel) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (engineRpm >= 0) {
    const f = 48 + engineRpm * 150;
    engine.o1.frequency.setTargetAtTime(f, t, 0.05);
    engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    engine.filter.frequency.setTargetAtTime(350 + engineRpm * 1500 + throttle * 500, t, 0.08);
    engine.gain.gain.setTargetAtTime(0.1 + throttle * 0.1 + engineRpm * 0.05, t, 0.08);
  } else engine.gain.gain.setTargetAtTime(0, t, 0.1);
  screech.gain.gain.setTargetAtTime(clamp(slip, 0, 1) * 0.3, t, 0.05);
  const wail = 0.5 + 0.5 * Math.sin(t * 2.6);
  siren.osc.frequency.setTargetAtTime(620 + 560 * wail, t, 0.03);
  siren.gain.gain.setTargetAtTime(clamp(sirenLevel, 0, 1) * 0.14, t, 0.15);
  surf.gain.gain.setTargetAtTime(clamp(surfLevel, 0, 1) * (0.1 + 0.06 * Math.sin(t * 0.7)), t, 0.3);
}

export function silenceLoops() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const l of [engine, screech, siren, surf]) if (l) l.gain.gain.setTargetAtTime(0, t, 0.05);
}
