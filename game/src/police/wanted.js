// The wanted level: crimes seen by witnesses or police add heat, heat becomes one to five stars,
// and the stars fade only after the player stays out of every officer's sight for long enough.
import { game, onEvent, emitEvent } from '../core/state.js';
import { sightBlocked } from '../core/collision.js';
import { playSound } from '../audio/sound.js';

export const wanted = {
  stars: 0,
  heat: 0,
  seen: false, // an officer has eyes on the player right now
  hidden: 0, // seconds out of sight
  lastSeen: { x: 0, z: 0 },
  evadeNeeded: 10,
  gunfireClock: 0,
};

const STAR_HEAT = [0, 8, 30, 70, 130, 210];
const CRIMES = {
  gunfire: { heat: 5, range: 55 },
  assault: { heat: 8, range: 40 },
  hitrun: { heat: 11, range: 45 },
  murder: { heat: 22, range: 55 },
  gangKill: { heat: 7, range: 40 },
  carjack: { heat: 12, range: 45 },
  copAssault: { heat: 24, range: 200, min: 2, always: true },
  copKill: { heat: 46, range: 200, min: 3, always: true },
  copCarTheft: { heat: 30, range: 200, min: 2, always: true },
  ramCop: { heat: 12, range: 200, min: 1, always: true },
  wreck: { heat: 14, range: 60 },
  robbery: { heat: 80, range: 999, min: 3, always: true },
};
const spotters = [];

/** Other police units (the helicopter) add their own "can I see the player" test here. */
export function registerSpotter(fn) {
  spotters.push(fn);
}

function starsForHeat(heat) {
  let s = 0;
  for (let i = 1; i <= 5; i++) if (heat >= STAR_HEAT[i]) s = i;
  return s;
}

function officerSees(range) {
  const p = game.player;
  for (const n of game.npcs) {
    if (n.role !== 'cop' || n.dead || n.inVehicle) continue;
    const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
    if (d < range && !sightBlocked(n.pos.x, n.pos.z, p.pos.x, p.pos.z)) return true;
  }
  for (const v of game.vehicles) {
    if (!v.type.police || v.destroyed || !v.driver || v.driver === 'player') continue;
    const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
    if (d < range && !sightBlocked(v.pos.x, v.pos.z, p.pos.x, p.pos.z)) return true;
  }
  for (const fn of spotters) if (fn(range)) return true;
  return false;
}

function civilianWitness(x, z, range) {
  for (const n of game.npcs) {
    if (n.dead || n.role !== 'civilian') continue;
    if (Math.hypot(n.pos.x - x, n.pos.z - z) < range) return true;
  }
  return false;
}

/** Tells the police about something the player did at (x, z). */
export function reportCrime(kind, x, z) {
  const c = CRIMES[kind];
  if (!c || game.flags.policeBlind || !game.player) return;
  const known = c.always || wanted.stars > 0 || officerSees(c.range + 20) || (civilianWitness(x, z, c.range) && Math.random() < 0.7);
  if (!known) return;
  addHeat(c.heat, c.min || 0);
}

export function addHeat(amount, minStars = 0) {
  wanted.heat = Math.min(260, wanted.heat + amount);
  const stars = Math.max(starsForHeat(wanted.heat), minStars, wanted.stars);
  if (minStars > starsForHeat(wanted.heat)) wanted.heat = STAR_HEAT[minStars];
  applyStars(stars);
}

export function setWantedLevel(stars) {
  wanted.heat = STAR_HEAT[stars] + (stars > 0 ? 2 : 0);
  applyStars(stars, true);
}

export function clearWantedLevel(silent = false) {
  if (wanted.stars > 0 && !silent) { playSound('cleared'); emitEvent('wantedCleared', {}); }
  wanted.stars = 0; wanted.heat = 0; wanted.hidden = 0; wanted.seen = false;
  emitEvent('wantedChanged', { stars: 0 });
}

function applyStars(stars, force = false) {
  if (stars === wanted.stars && !force) return;
  const rising = stars > wanted.stars;
  wanted.stars = stars;
  if (stars === 0) { wanted.heat = 0; }
  else {
    wanted.hidden = 0;
    wanted.lastSeen.x = game.player.pos.x; wanted.lastSeen.z = game.player.pos.z;
    wanted.evadeNeeded = 9 + stars * 4.5;
    if (rising) playSound('wanted');
  }
  emitEvent('wantedChanged', { stars });
}

/** Run every frame: tracks whether the police can see the player and cools the level off when they cannot. */
export function updateWantedLevel(dt) {
  const p = game.player;
  if (!p) return;
  wanted.gunfireClock -= dt;
  if (wanted.stars === 0) {
    wanted.heat = Math.max(0, wanted.heat - dt * 0.6);
    wanted.seen = false;
    return;
  }
  wanted.seen = officerSees(70 + wanted.stars * 12);
  if (wanted.seen) {
    wanted.hidden = 0;
    wanted.lastSeen.x = p.pos.x; wanted.lastSeen.z = p.pos.z;
  } else {
    wanted.hidden += dt;
    if (wanted.hidden >= wanted.evadeNeeded && !game.flags.wantedLocked) clearWantedLevel();
  }
}

onEvent('gunfire', ({ shooter, x, z }) => {
  if (shooter !== game.player || wanted.gunfireClock > 0) return;
  wanted.gunfireClock = 1.5;
  reportCrime('gunfire', x, z);
});

onEvent('npcHurt', ({ npc, attacker, info }) => {
  if (attacker !== game.player || npc.dead || npc.health <= 0) return;
  if (npc.role === 'cop') reportCrime('copAssault', npc.pos.x, npc.pos.z);
  else if (npc.role === 'civilian') reportCrime(info && info.vehicle ? 'hitrun' : 'assault', npc.pos.x, npc.pos.z);
});

onEvent('npcKilled', ({ npc, attacker }) => {
  if (attacker !== game.player) return;
  if (npc.role === 'cop') reportCrime('copKill', npc.pos.x, npc.pos.z);
  else if (npc.role === 'civilian') reportCrime('murder', npc.pos.x, npc.pos.z);
  else reportCrime('gangKill', npc.pos.x, npc.pos.z);
});

onEvent('vehicleCollision', ({ a, b, impact }) => {
  if (impact < 7) return;
  const mine = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
  if (!mine) return;
  const other = mine === a ? b : a;
  if (other.type.police && other.driver) reportCrime('ramCop', mine.pos.x, mine.pos.z);
  else if (other.driver && impact > 11) reportCrime('hitrun', mine.pos.x, mine.pos.z);
});

onEvent('vehicleDestroyed', ({ vehicle, by }) => {
  if (by === 'player' || by === game.player) reportCrime('wreck', vehicle.pos.x, vehicle.pos.z);
});
