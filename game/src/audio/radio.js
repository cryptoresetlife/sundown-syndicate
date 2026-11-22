// The car radio: four stations of music composed and synthesised live (drums, bass, chords and
// lead from step patterns), switched with R while driving. Nothing is sampled or downloaded.
import '../world/sky.js'; // load order: the radio, then sky, roads and buildings
import { audioContext, musicBus, playSound } from './sound.js';
import { game, emitEvent } from '../core/state.js';
import { wasKeyPressed } from '../core/input.js';

// Patterns are 16 steps to the bar: x = hit, - = rest. Chords are semitone offsets from the root note.
const STATIONS = [
  { name: 'SOLWAVE 88.1', genre: 'Synthwave', bpm: 104, root: 45, chords: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]],
    kick: 'x---x---x---x---', snare: '----x-------x---', hat: 'x-x-x-x-x-x-x-x-', bass: 'x-x-x-x-x-x-x-x-', lead: 'x--x--x-x--x-x--', pad: true, leadWave: 'sawtooth' },
  { name: 'RADIO CALIENTE 94.7', genre: 'Dembow', bpm: 96, root: 50, chords: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]],
    kick: 'x---x---x---x---', snare: '---x--x----x--x-', hat: 'x-xxx-xxx-xxx-xx', bass: 'x--x--x-x--x--x-', lead: 'x-x---x-x-x---x-', pad: false, leadWave: 'triangle' },
  { name: 'LO-TIDE 101.3', genre: 'Chillhop', bpm: 78, root: 53, chords: [[0, 4, 7, 11], [-1, 2, 6, 9], [-3, 0, 4, 7], [-5, -1, 2, 6]],
    kick: 'x-----x---x-----', snare: '----x-------x---', hat: 'x-x-x-x-x-x-x-x-', bass: 'x-------x--x----', lead: '--x-----x-----x-', pad: true, leadWave: 'sine' },
  { name: 'THE BASSMENT 107.9', genre: 'House', bpm: 124, root: 48, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
    kick: 'x---x---x---x---', snare: '----x-------x---', hat: '--x---x---x---x-', bass: '--x---x---x--x--', lead: 'x--x--x---x--x--', pad: false, leadWave: 'square' },
];

export const radio = { station: 0, on: false, playing: false, name: '', showTime: 0 };
let stationGain = null, noiseBuf = null, nextStepTime = 0, step = 0;

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function voice(type, f, t, dur, gain, cutoff = 0) {
  const ctx = audioContext();
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  if (cutoff) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); lp.connect(g); } else o.connect(g);
  g.connect(stationGain);
  o.start(t); o.stop(t + dur + 0.03);
  return o;
}

function drum(kind, t) {
  const ctx = audioContext();
  if (kind === 'kick') { const o = voice('sine', 150, t, 0.2, 0.9); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); return; }
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7500 : 1900;
  const g = ctx.createGain(); const dur = kind === 'hat' ? 0.04 : 0.16;
  g.gain.setValueAtTime(kind === 'hat' ? 0.16 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  src.connect(f); f.connect(g); g.connect(stationGain);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}

function scheduleStep(s, n, t) {
  const stepLen = 60 / s.bpm / 4;
  const bar = Math.floor(n / 16), i = n % 16;
  const chord = s.chords[bar % s.chords.length];
  if (s.kick[i] === 'x') drum('kick', t);
  if (s.snare[i] === 'x') drum('snare', t);
  if (s.hat[i] === 'x') drum('hat', t);
  if (s.bass[i] === 'x') voice('sawtooth', freq(s.root + chord[0] - 12), t, stepLen * 1.7, 0.34, 420);
  if (s.lead[i] === 'x') {
    const note = chord[(i + bar) % chord.length] + (i % 5 === 0 ? 12 : 0);
    voice(s.leadWave, freq(s.root + note + 12), t, stepLen * 2.4, s.leadWave === 'sine' ? 0.2 : 0.085, 2600);
  }
  if (i === 0 && s.pad) for (const c of chord) { voice('sawtooth', freq(s.root + c), t, stepLen * 15.5, 0.045, 900); voice('sawtooth', freq(s.root + c) * 1.006, t, stepLen * 15.5, 0.04, 900); }
  if (!s.pad && (i === 0 || i === 6 || i === 10)) for (const c of chord) voice('triangle', freq(s.root + c + 12), t, stepLen * 1.5, 0.07, 3000);
}

function ensureBus() {
  const ctx = audioContext();
  if (!ctx || stationGain) return !!ctx;
  stationGain = ctx.createGain(); stationGain.gain.value = 0;
  stationGain.connect(musicBus());
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

export function nextStation() {
  radio.station = (radio.station + 1) % (STATIONS.length + 1); // the extra slot is "radio off"
  radio.name = radio.station < STATIONS.length ? STATIONS[radio.station].name + '  ·  ' + STATIONS[radio.station].genre : 'RADIO OFF';
  radio.showTime = 3.5;
  step = 0; nextStepTime = 0;
  playSound('radioTune');
  emitEvent('radioChanged', { name: radio.name });
}

/** Run every frame: the radio plays while the player is in a vehicle; R changes the station. */
export function updateRadio(dt) {
  const p = game.player;
  if (radio.showTime > 0) radio.showTime -= dt;
  const inCar = !!(p && p.vehicle) && game.mode === 'play';
  if (inCar && wasKeyPressed('KeyR')) nextStation();
  if (inCar && !radio.on) { radio.on = true; radio.name = radio.station < STATIONS.length ? STATIONS[radio.station].name + '  ·  ' + STATIONS[radio.station].genre : 'RADIO OFF'; radio.showTime = 3.5; }
  if (!inCar) radio.on = false;
  if (!ensureBus()) return;
  const ctx = audioContext();
  const s = STATIONS[radio.station];
  const audible = inCar && !!s && game.settings.radioOn && ctx.state === 'running';
  stationGain.gain.setTargetAtTime(audible ? 0.9 : 0, ctx.currentTime, 0.12);
  radio.playing = audible;
  if (!audible) { nextStepTime = 0; return; }
  if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
  const stepLen = 60 / s.bpm / 4;
  while (nextStepTime < ctx.currentTime + 0.18) {
    scheduleStep(s, step, nextStepTime);
    step++;
    nextStepTime += stepLen * (s.bpm < 85 && step % 2 ? 1.16 : s.bpm < 85 ? 0.84 : 1); // slow stations swing
  }
}
