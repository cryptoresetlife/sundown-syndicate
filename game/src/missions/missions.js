// The mission engine: start markers, cutscene intros, step-by-step objectives (go there, steal that,
// eliminate them, lose the cops, win the race), timers, pass and fail, rewards and cleanup.
import '../vehicles/carjack.js'; // load order: missions, then the cars, weapons and player they are played with
import { Vehicle } from '../vehicles/vehicle.js';
import { game, emitEvent, onEvent, addMoney } from '../core/state.js';
import { cam } from '../core/camera.js';
import { formatMoney } from '../core/mathutil.js';
import { LANDMARKS } from '../world/layout.js';
import { addMarker, removeMarker, playerInMarker } from '../world/markers.js';
import { spawnPickup, removePickup } from '../world/pickups.js';
import { parkingSpots } from '../world/buildings.js';
import { Npc } from '../characters/npc.js';
import { spawnGangster } from '../combat/gangs.js';
import { wanted } from '../police/wanted.js';
import { say, clearDialogue } from './dialogue.js';
import { playSound } from '../audio/sound.js';

export { startMission, completeMission, failMission, updateMissions, refreshStartMarkers, registerStory, registerSideMissions };

export const mission = {
  active: null, // the running mission's definition
  ctx: null,
  stepIndex: 0,
  objective: '',
  timer: null, // { left, onExpire }
  meter: null, // { label, value 0..1, color }
  info: '', // an extra HUD line (race position, kills left)
  banner: null, // { kind: 'pass' | 'fail' | 'title', title, sub, time }
  startMarkers: [],
  cutscene: null,
};

const story = [];
const sideMissions = [];
const GIVERS = {
  lupe: { letter: 'L', name: 'Mama Lupe', color: 0xff7ab8, look: { skin: 0xc68642, shirt: 0xff5fa2, pants: 0xf5f5f5, hair: 0x4a4a4a, skirt: true } },
  benny: { letter: 'B', name: 'Benny Two-Tone', color: 0x7fd4ff, look: { skin: 0xf2c9a0, shirt: 0x35c8e8, pants: 0x1b1b1f, hair: 0xd9b36a, hat: 'cap', hatColor: 0x111111 } },
  juno: { letter: 'J', name: 'Juno Park', color: 0xb79bff, look: { skin: 0xffdbac, shirt: 0x9b5de5, pants: 0x2b2d42, hair: 0x00bbf9, shades: true } },
};

function registerStory(list) { story.push(...list); }
function registerSideMissions(list) { sideMissions.push(...list); }
export function storyMissions() { return story; }
export function nextStoryMission() { return story[game.storyIndex] || null; }

/** Everything a running mission spawns goes through its context, so it can all be cleaned up. */
class MissionContext {
  constructor(def) {
    this.def = def;
    this.vars = {};
    this.vehicles = []; this.npcs = []; this.markers = []; this.pickups = []; this.reserved = [];
  }
  vehicle(typeId, x, z, heading = 0, paint = null) {
    const v = new Vehicle(typeId, x, z, heading, paint);
    v.keep = true;
    this.vehicles.push(v);
    return v;
  }
  enemy(x, z, opts = {}) {
    const n = spawnGangster(x, z, { ...opts, persistent: true });
    this.npcs.push(n);
    return n;
  }
  person(x, z, look, opts = {}) {
    const n = new Npc({ x, z, look, role: opts.role || 'ally', health: opts.health || 100, heading: opts.heading || 0, brain: opts.brain || null, weapon: opts.weapon || null });
    n.persistent = true;
    n.invulnerable = !!opts.invulnerable;
    this.npcs.push(n);
    return n;
  }
  marker(opts) { const m = addMarker(opts); this.markers.push(m); return m; }
  unmark(m) { removeMarker(m); }
  pickup(kind, x, z, value, opts) { const p = spawnPickup(kind, x, z, value, opts); this.pickups.push(p); return p; }
  say(lines, onDone) { say(lines, onDone); }
  objective(text) { mission.objective = text; }
  setTimer(seconds, onExpire = null) { mission.timer = { left: seconds, onExpire }; }
  addTime(seconds) { if (mission.timer) mission.timer.left += seconds; }
  clearTimer() { mission.timer = null; }
  fail(reason) { failMission(reason); }
  cleanup() {
    for (const m of this.markers) removeMarker(m);
    for (const spot of this.reserved) spot.reserved = false;
    for (const p of this.pickups) if (game.pickups.includes(p)) removePickup(p);
    for (const v of this.vehicles) { v.keep = false; v.ambient = true; v.locked = false; v.invulnerable = false; if (v.driver && v.driver !== 'player') { v.driver = null; } }
    for (const n of this.npcs) {
      // gunmen left alive join the ambient gang population; anyone else leaves with the mission
      n.persistent = false;
      if (n.role === 'guard') n.role = 'gang';
      if (n.role !== 'gang' || n.inVehicle) n.remove();
    }
  }
  /** Moves parked and ambient cars out of a spot the mission needs. */
  clearArea(x, z, radius) {
    for (const spot of parkingSpots) if (Math.hypot(spot.x - x, spot.z - z) < radius + 3) { spot.reserved = true; this.reserved.push(spot); }
    for (const v of [...game.vehicles]) {
      if (v.driver === 'player' || v.keep || Math.hypot(v.pos.x - x, v.pos.z - z) > radius) continue;
      if (v.parkedAt) v.parkedAt.vehicle = null;
      v.remove();
    }
  }
}

function placeStartMarkers() {
  clearStartMarkers();
  const next = nextStoryMission();
  if (next) {
    const lm = LANDMARKS[next.start], giver = GIVERS[next.giver];
    const m = addMarker({ x: lm.x, z: lm.z, color: giver.color, label: giver.letter, kind: 'mission', name: next.title, radius: 2 });
    m.def = next;
    m.giverNpc = new Npc({ x: lm.x + 2.6, z: lm.z + (lm.north ? 2.5 : -2.5), heading: lm.facing, look: giver.look, role: 'ally', health: 999 });
    m.giverNpc.invulnerable = true; m.giverNpc.persistent = true;
    mission.startMarkers.push(m);
  }
  for (const def of sideMissions) {
    if (def.unlockAt > game.storyIndex) continue;
    const m = addMarker({ x: def.x, z: def.z, color: def.color || 0x4dff9a, label: def.letter || 'R', kind: 'activity', name: def.title, radius: 3 });
    m.def = def;
    mission.startMarkers.push(m);
  }
}

function clearStartMarkers() {
  for (const m of mission.startMarkers) { removeMarker(m); if (m.giverNpc) m.giverNpc.remove(); }
  mission.startMarkers.length = 0;
}

function refreshStartMarkers() {
  if (!mission.active) placeStartMarkers();
}

/** Begins a mission: plays its intro as a short cutscene, then runs setup and the first step. */
function startMission(def, skipIntro = false) {
  if (mission.active) return false;
  clearStartMarkers();
  mission.active = def;
  mission.ctx = new MissionContext(def);
  mission.stepIndex = -1;
  mission.objective = ''; mission.timer = null; mission.meter = null; mission.info = '';
  mission.banner = { kind: 'title', title: def.title, sub: def.side ? 'Side job' : 'Chapter ' + (story.indexOf(def) + 1) + ' of ' + story.length, time: 3.5 };
  emitEvent('missionStarted', { def });
  const begin = () => {
    mission.cutscene = null;
    cam.cinematic = null;
    if (game.mode === 'cutscene') game.mode = 'play';
    if (def.setup) def.setup(mission.ctx);
    advanceStep();
  };
  if (def.intro && !skipIntro) {
    const p = game.player;
    game.mode = 'cutscene';
    mission.cutscene = { x: p.pos.x, z: p.pos.z, angle: p.heading + 2.4, time: 0 };
    say(def.intro, begin);
  } else begin();
  return true;
}

function advanceStep() {
  const def = mission.active, ctx = mission.ctx;
  if (!def) return;
  const prev = def.steps[mission.stepIndex];
  if (prev && prev.exit) prev.exit(ctx);
  if (prev && prev.marker) { removeMarker(prev.marker); prev.marker = null; }
  mission.stepIndex++;
  if (mission.stepIndex >= def.steps.length) { completeMission(); return; }
  const step = def.steps[mission.stepIndex];
  mission.objective = typeof step.text === 'function' ? step.text(ctx) : step.text || mission.objective;
  if (step.enter) step.enter(ctx);
  if (mission.stepIndex > 0) playSound('checkpoint');
}

function completeMission() {
  const def = mission.active;
  if (!def) return;
  const reward = typeof def.reward === 'function' ? def.reward(mission.ctx) : def.reward || 0;
  mission.ctx.cleanup();
  mission.active = null; mission.ctx = null; mission.timer = null; mission.meter = null; mission.info = ''; mission.objective = '';
  game.flags.wantedLocked = false; game.flags.freezeDriving = false; game.flags.policeBlind = false;
  if (reward) addMoney(reward, 'mission');
  if (!def.side) { game.storyIndex = Math.max(game.storyIndex, story.indexOf(def) + 1); game.stats.missionsDone++; }
  mission.banner = { kind: 'pass', title: def.side ? def.passText || 'JOB DONE' : 'JOB DONE', sub: def.title + (reward ? '  +' + formatMoney(reward) : ''), time: 5 };
  playSound('missionPass');
  emitEvent('missionPassed', { def, reward });
  if (def.outro) say(def.outro);
  placeStartMarkers();
}

function failMission(reason) {
  const def = mission.active;
  if (!def) return;
  const step = def.steps[mission.stepIndex];
  if (step && step.exit) step.exit(mission.ctx);
  if (step && step.marker) { removeMarker(step.marker); step.marker = null; }
  mission.ctx.cleanup();
  clearDialogue();
  mission.active = null; mission.ctx = null; mission.timer = null; mission.meter = null; mission.info = ''; mission.objective = '';
  mission.cutscene = null; cam.cinematic = null;
  if (game.mode === 'cutscene') game.mode = 'play';
  game.flags.wantedLocked = false; game.flags.freezeDriving = false; game.flags.policeBlind = false;
  mission.banner = { kind: 'fail', title: 'JOB FAILED', sub: reason, time: 5 };
  playSound('missionFail');
  emitEvent('missionFailed', { def, reason });
  placeStartMarkers();
}

/** Run every frame in play and cutscene modes. */
function updateMissions(dt) {
  if (mission.banner) { mission.banner.time -= dt; if (mission.banner.time <= 0) mission.banner = null; }
  if (mission.cutscene) {
    const c = mission.cutscene;
    c.time += dt; c.angle += dt * 0.22;
    cam.cinematic = { x: c.x + Math.sin(c.angle) * 6.5, y: 2.3 + Math.sin(c.time * 0.4) * 0.3, z: c.z + Math.cos(c.angle) * 6.5, lookX: c.x, lookY: 1.45, lookZ: c.z, fov: 46 };
    return;
  }
  const p = game.player;
  if (!mission.active) {
    if (game.mode !== 'play' || p.dead) return;
    for (const m of mission.startMarkers) {
      // a marker that appears under the player's feet waits until they step out and back in
      if (!playerInMarker(m)) { m.inside = false; m.armed = true; continue; }
      if (!m.armed) continue;
      if (m.def.needVehicle ? !p.vehicle : !!p.vehicle) { if (!m.inside) emitEvent('hint', { text: m.def.needVehicle ? 'Come back in a vehicle to start this race' : 'Step out of the vehicle to start the job' }); m.inside = true; continue; }
      if (wanted.stars > 0) { if (!m.inside) emitEvent('hint', { text: 'Lose the cops first' }); m.inside = true; continue; }
      startMission(m.def);
      break;
    }
    return;
  }
  const def = mission.active, ctx = mission.ctx;
  if (mission.timer) {
    mission.timer.left -= dt;
    if (mission.timer.left <= 0) {
      const cb = mission.timer.onExpire;
      mission.timer = null;
      if (cb) cb(ctx); else { failMission('You ran out of time'); return; }
    }
  }
  if (def.failIf) { const reason = def.failIf(ctx); if (reason) { failMission(reason); return; } }
  const step = def.steps[mission.stepIndex];
  if (step && step.update && step.update(ctx, dt)) advanceStep();
}

onEvent('playerDown', ({ cause }) => {
  if (mission.active) failMission(cause === 'booked' ? 'You were booked' : 'You were flatlined');
});

// The step builders missions are assembled from (goTo, getIn, eliminate, race...) live in objectives.js.
