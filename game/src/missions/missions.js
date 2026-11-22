// The mission engine: start markers, cutscene intros, step-by-step objectives (go there, steal that,
// eliminate them, lose the cops, win the race), timers, pass and fail, rewards and cleanup.
import { game, emitEvent, onEvent, addMoney } from '../core/state.js';
import { cam } from '../core/camera.js';
import { formatMoney } from '../core/mathutil.js';
import { LANDMARKS, BLOCK } from '../world/layout.js';
import { addMarker, removeMarker, playerInMarker } from '../world/markers.js';
import { spawnPickup, removePickup } from '../world/pickups.js';
import { parkingSpots } from '../world/buildings.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { RouteDriver } from '../vehicles/driver.js';
import { Npc } from '../characters/npc.js';
import { spawnGangster } from '../combat/gangs.js';
import { wanted } from '../police/wanted.js';
import { say, isTalking, clearDialogue } from './dialogue.js';
import { playSound } from '../audio/sound.js';

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

export function registerStory(list) { story.push(...list); }
export function registerSideMissions(list) { sideMissions.push(...list); }
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

export function refreshStartMarkers() {
  if (!mission.active) placeStartMarkers();
}

/** Begins a mission: plays its intro as a short cutscene, then runs setup and the first step. */
export function startMission(def, skipIntro = false) {
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

export function completeMission() {
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

export function failMission(reason) {
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
export function updateMissions(dt) {
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

// ---- Step builders: story.js and activities.js assemble missions out of these -------------------

const at = (getPos, ctx) => (typeof getPos === 'function' ? getPos(ctx) : getPos);

/** Reach a place. opts: { vehicle: ctx => Vehicle (must be driving it), anyVehicle, onFoot, stop, radius, label, color } */
export function goTo(getPos, text, opts = {}) {
  const step = {
    text,
    enter(ctx) {
      const pos = at(getPos, ctx);
      step.marker = addMarker({ x: pos.x, z: pos.z, color: opts.color ?? 0xffe14a, radius: opts.radius ?? 3.2, label: opts.label || '', kind: 'objective' });
    },
    update(ctx) {
      const p = game.player;
      if (!playerInMarker(step.marker)) return false;
      if (opts.vehicle && p.vehicle !== opts.vehicle(ctx)) return false;
      if (opts.anyVehicle && !p.vehicle) return false;
      if (opts.onFoot && p.vehicle) return false;
      if (opts.stop && p.vehicle && Math.abs(p.vehicle.speed) > 2.5) return false;
      return true;
    },
  };
  return step;
}

/** Get behind the wheel of a particular vehicle. */
export function getIn(getVehicle, text) {
  const step = {
    text,
    enter(ctx) { step.marker = addMarker({ follow: getVehicle(ctx), color: 0x4db8ff, ring: false, label: '▼', kind: 'objective' }); },
    update(ctx) { return game.player.vehicle === getVehicle(ctx); },
  };
  return step;
}

/** Kill every listed enemy; each gets a red blip. */
export function eliminate(getTargets, text) {
  const step = {
    text,
    enter(ctx) {
      step.targets = getTargets(ctx);
      step.blips = step.targets.map((n) => ctx.marker({ follow: n, color: 0xff3a3a, ring: false, beam: false, label: '▼', kind: 'enemy' }));
    },
    update() {
      let left = 0;
      step.targets.forEach((n, i) => { if (n.dead || n.removed) { removeMarker(step.blips[i]); } else left++; });
      mission.info = left ? 'Targets left: ' + left : '';
      return left === 0;
    },
    exit() { mission.info = ''; },
  };
  return step;
}

/** Destroy a vehicle. */
export function wreck(getVehicle, text) {
  const step = {
    text,
    enter(ctx) { step.marker = addMarker({ follow: getVehicle(ctx), color: 0xff3a3a, ring: false, label: '▼', kind: 'enemy' }); },
    update(ctx) {
      const v = getVehicle(ctx);
      mission.meter = { label: 'TARGET', value: v.health / v.type.health, color: '#ff4a4a' };
      return v.destroyed;
    },
    exit() { mission.meter = null; },
  };
  return step;
}

/** Pick up a mission item (a pickup created by the mission, found through getPickup). */
export function pickUp(getPickup, text) {
  const step = {
    text,
    enter(ctx) { const p = getPickup(ctx); step.pickup = p; step.marker = addMarker({ x: p.x, z: p.z, color: 0x4dff9a, radius: 1.6, label: '$', kind: 'objective' }); },
    update() { return !game.pickups.includes(step.pickup); },
  };
  return step;
}

/** Shake the wanted level. */
export function loseCops(text = 'Lose the cops') {
  return {
    text,
    enter() { game.flags.wantedLocked = false; },
    update() { mission.info = wanted.stars > 0 ? (wanted.seen ? 'They can see you' : 'Stay out of sight…') : ''; return wanted.stars === 0; },
    exit() { mission.info = ''; },
  };
}

/** Wait for the current dialogue to finish (optionally speaking first). */
export function talk(lines) {
  return { enter(ctx) { if (lines) say(typeof lines === 'function' ? lines(ctx) : lines); }, update() { return !isTalking(); } };
}

export function custom(def) { return def; }

/**
 * A street race through intersections. opts: { nodes: [[i, j], ...], rivals: [{ type, paint, pace }], text }
 * The player must already be in a vehicle at the first node; rivals line up alongside.
 */
export function race(opts) {
  const step = {
    text: opts.text || 'Win the race',
    enter(ctx) {
      const p = game.player, v = p.vehicle;
      const cps = opts.nodes.map(([i, j]) => ({ x: i * BLOCK, z: j * BLOCK }));
      const r = { cps, index: 0, rivals: [], countdown: 3.99, finished: 0, place: 0, time: 0 };
      step.race = r;
      opts.rivals.forEach((spec, k) => {
        const side = k % 2 ? -1 : 1, row = Math.floor(k / 2);
        const w = v.localToWorld(side * 3.6 * (row + 1), row * -1.5 + 1, { x: 0, z: 0 });
        const car = ctx.vehicle(spec.type, w.x, w.z, v.heading, spec.paint);
        const drv = new RouteDriver(car, cps, () => {
          // rubber band: ease off when far ahead, push when behind
          const gap = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
          const ahead = drv.index > r.index || (drv.index === r.index && gap > 30);
          return car.type.topSpeed * spec.pace * (ahead ? 0.86 : 1.04);
        });
        drv.frozen = true;
        car.driver = { kind: 'racer', update(dt) { if (r.countdown > 0) { car.input.throttle = 0; car.input.brake = 1; } else drv.update(dt); } };
        r.rivals.push({ car, drv, place: 0 });
      });
      game.flags.freezeDriving = true;
      step.marker = addMarker({ x: cps[0].x, z: cps[0].z, color: 0x4dff9a, radius: 6, label: '1', kind: 'race' });
      step.nextMarker = cps[1] ? addMarker({ x: cps[1].x, z: cps[1].z, color: 0x2a8f58, radius: 4, beam: false, kind: 'race', hideOnMap: true }) : null;
    },
    update(ctx, dt) {
      const r = step.race, p = game.player;
      if (!p.vehicle) { failMission('You left your car'); return false; }
      if (r.countdown > 0) {
        const before = Math.floor(r.countdown);
        r.countdown -= dt;
        const now = Math.floor(r.countdown);
        if (now !== before || !mission.banner) {
          mission.banner = { kind: 'count', title: r.countdown > 0 ? String(Math.ceil(r.countdown)) : 'GO!', sub: '', time: 1.05 };
          playSound(r.countdown > 0 ? 'ui' : 'checkpoint');
        }
        if (r.countdown <= 0) game.flags.freezeDriving = false;
        return false;
      }
      r.time += dt;
      for (const rv of r.rivals) if (rv.drv.done && !rv.place) rv.place = ++r.finished;
      const cp = r.cps[r.index];
      if (Math.hypot(p.pos.x - cp.x, p.pos.z - cp.z) < 15) {
        r.index++;
        playSound('checkpoint');
        if (r.index >= r.cps.length) {
          r.place = ++r.finished;
          if (r.place > 1) { failMission('You finished ' + ['', '1st', '2nd', '3rd', '4th', '5th'][r.place] + ' — only first place pays'); return false; }
          game.stats.racesWon++;
          return true;
        }
        removeMarker(step.marker); if (step.nextMarker) removeMarker(step.nextMarker);
        const a = r.cps[r.index], b = r.cps[r.index + 1];
        step.marker = addMarker({ x: a.x, z: a.z, color: 0x4dff9a, radius: 6, label: r.index === r.cps.length - 1 ? '⚑' : String(r.index + 1), kind: 'race' });
        step.nextMarker = b ? addMarker({ x: b.x, z: b.z, color: 0x2a8f58, radius: 4, beam: false, kind: 'race', hideOnMap: true }) : null;
      }
      // position: count rivals further along the route
      let rank = 1;
      const myLeft = Math.hypot(p.pos.x - r.cps[r.index].x, p.pos.z - r.cps[r.index].z);
      for (const rv of r.rivals) {
        if (rv.place) { rank++; continue; }
        const c = r.cps[Math.min(rv.drv.index, r.cps.length - 1)];
        const left = Math.hypot(rv.car.pos.x - c.x, rv.car.pos.z - c.z);
        if (rv.drv.index > r.index || (rv.drv.index === r.index && left < myLeft)) rank++;
      }
      mission.info = 'POSITION ' + rank + ' / ' + (r.rivals.length + 1) + '   ·   CHECKPOINT ' + r.index + ' / ' + r.cps.length;
      return false;
    },
    exit() { if (step.nextMarker) removeMarker(step.nextMarker); mission.info = ''; game.flags.freezeDriving = false; },
  };
  return step;
}
