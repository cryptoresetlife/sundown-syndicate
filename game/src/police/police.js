// The Marisol Bay Police Department: dispatches cruisers, tactical trucks and roadblocks to match
// the wanted level, drives the pursuit, puts officers on foot to arrest or shoot, and books the player.
import { game, onEvent, emitEvent } from '../core/state.js';
import { rand, headingTo } from '../core/mathutil.js';
import { cam } from '../core/camera.js';
import { BLOCK, LANE } from '../world/layout.js';
import { randomLanePoint, nearestNode, exitsOf, nodeExists } from '../world/roads.js';
import { Vehicle } from '../vehicles/vehicle.js';
import { ChaseDriver, LaneDriver } from '../vehicles/driver.js';
import { Npc } from '../characters/npc.js';
import { fireWeapon } from '../combat/weapons.js';
import { wanted, reportCrime } from './wanted.js';
import { updateHelicopter, dismissHelicopter } from './helicopter.js';

const units = []; // { vehicle, crew, deployed, tactical, roadblock, shotClock }
const CRUISERS = [0, 1, 2, 3, 3, 4], TRUCKS = [0, 0, 0, 0, 1, 2];
let dispatchClock = 0, roadblockClock = 12, arrestClock = 0;

const OFFICER_LOOK = { skin: 0xe0ac7e, shirt: 0x1f3f73, pants: 0x14203a, hair: 0x1a1208, hat: 'cap', hatColor: 0x14203a, shoes: 0x111111 };
const TACTICAL_LOOK = { skin: 0xc68642, shirt: 0x1a1f2a, pants: 0x1a1f2a, hair: 0x111111, hat: 'helmet', vest: 0x2a3140, shades: true, shoes: 0x111111 };

/** One officer on foot. tactical officers wear armour and carry automatic weapons. */
export function spawnOfficer(x, z, tactical = false) {
  const skin = rand.pick([0xf2c9a0, 0xe0ac7e, 0xc68642, 0x8d5524]);
  const npc = new Npc({
    x, z, look: { ...(tactical ? TACTICAL_LOOK : OFFICER_LOOK), skin }, role: 'cop', health: tactical ? 130 : 85,
    weapon: tactical ? (rand.chance(0.5) ? 'smg' : 'rifle') : 'pistol', accuracy: tactical ? 0.05 : 0.075, brain: officerBrain,
  });
  npc.armor = tactical;
  npc.mem = { tactical, idle: 0 };
  return npc;
}

function officerBrain(npc, dt) {
  const p = game.player, m = npc.mem;
  if (wanted.stars === 0 && !npc.hostileToPlayer) {
    // stand down: stroll off; cleared away once out of sight
    m.idle += dt;
    if (m.idle > 4 && !m.post) npc.moveToward(npc.pos.x + Math.sin(npc.heading) * 5, npc.pos.z + Math.cos(npc.heading) * 5, 1.4, dt);
    return;
  }
  m.idle = 0;
  const target = p.vehicle || p;
  const d = npc.distanceTo(p.pos.x, p.pos.z);
  if (p.dead) return;
  const lethal = wanted.stars >= 2 || npc.hostileToPlayer || (p.aiming && d < 30);
  if (npc.seesPlayer) {
    if (lethal && d < (m.tactical ? 48 : 34) && d > 2.2) {
      if (d > 14 && !m.post) npc.moveToward(p.pos.x, p.pos.z, 3.2, dt);
      npc.shootAt(target, dt);
    } else if (d > 1.7) npc.moveToward(p.pos.x, p.pos.z, 6.1, dt);
    else { npc.anim = 'aim'; npc.faceToward(p.pos.x, p.pos.z, dt); }
  } else if (!m.post) {
    const gx = wanted.lastSeen.x, gz = wanted.lastSeen.z;
    if (npc.distanceTo(gx, gz) > 3) npc.moveToward(gx, gz, 5.4, dt);
  }
}

function pickSpawnPoint(minDist, maxDist) {
  const p = game.player;
  for (let tries = 0; tries < 12; tries++) {
    const at = randomLanePoint(rand, p.pos.x, p.pos.z, minDist, maxDist);
    if (!at) continue;
    const dx = at.x - p.pos.x, dz = at.z - p.pos.z, d = Math.hypot(dx, dz);
    const inView = (dx * cam.forward.x + dz * cam.forward.z) / d > 0.6;
    if (inView && d < 120 && !game.debug.spawnInView) continue;
    let clear = true;
    for (const v of game.vehicles) if (Math.hypot(v.pos.x - at.x, v.pos.z - at.z) < 12) { clear = false; break; }
    if (clear) return at;
  }
  return null;
}

function chaseTarget() {
  const p = game.player;
  if (wanted.seen || wanted.hidden < 2) return { x: p.pos.x, z: p.pos.z, vx: p.vx, vz: p.vz };
  return { x: wanted.lastSeen.x, z: wanted.lastSeen.z, vx: 0, vz: 0 };
}

function crewEject(unit) {
  return (x, z) => {
    unit.crew = 0;
    const cop = spawnOfficer(x, z, unit.tactical);
    cop.hostileToPlayer = true;
    reportCrime('copCarTheft', x, z);
    return cop;
  };
}

function makeUnit(vehicle, tactical = false) {
  const unit = { vehicle, crew: tactical ? 4 : 2, deployed: false, tactical, roadblock: false, shotClock: rand.range(0.5, 2) };
  vehicle.siren = true;
  vehicle.ambient = false;
  vehicle.policeUnit = unit;
  const driver = new ChaseDriver(vehicle, chaseTarget, { kind: 'police' });
  driver.onEject = crewEject(unit);
  vehicle.driver = driver;
  units.push(unit);
  return unit;
}

/** Sends one more police vehicle after the player; 'bulwark' is the armoured tactical truck. */
export function spawnPoliceCruiser(typeId = 'cruiser', at = null) {
  const point = at || pickSpawnPoint(85, 190);
  if (!point) return null;
  const v = new Vehicle(typeId, point.x, point.z, point.heading);
  v.vx = Math.sin(point.heading) * 12; v.vz = Math.cos(point.heading) * 12;
  return makeUnit(v, typeId === 'bulwark');
}

/** Two cruisers nose to tail across the road ahead of a fleeing car, officers behind them. */
export function spawnRoadblock() {
  const p = game.player, v = p.vehicle;
  if (!v || Math.abs(v.speed) < 8) return false;
  const di = Math.abs(v.forwardX) > Math.abs(v.forwardZ) ? Math.sign(v.forwardX) : 0;
  const dj = di === 0 ? Math.sign(v.forwardZ) : 0;
  const here = nearestNode(p.pos.x + di * 60, p.pos.z + dj * 60);
  const ni = here.i + di, nj = here.j + dj;
  if (!nodeExists(ni, nj) || !nodeExists(here.i, here.j)) return false;
  const cx = here.i * BLOCK + di * BLOCK * 0.55, cz = here.j * BLOCK + dj * BLOCK * 0.55;
  if (Math.hypot(cx - p.pos.x, cz - p.pos.z) < 70) return false;
  for (const u of units) if (u.roadblock && Math.hypot(u.vehicle.pos.x - cx, u.vehicle.pos.z - cz) < 40) return false;
  const heading = headingTo(di, dj) + Math.PI / 2;
  for (const side of [-1, 1]) {
    const x = cx - dj * side * LANE * 0.95, z = cz + di * side * LANE * 0.95;
    const car = new Vehicle('cruiser', x, z, heading + (side > 0 ? 0 : Math.PI));
    const unit = makeUnit(car);
    unit.roadblock = true; unit.deployed = true; unit.crew = 0;
    car.driver = { kind: 'parked', update() { car.input.throttle = 0; car.input.brake = 1; }, onEject: crewEject(unit) };
    const cop = spawnOfficer(x + di * 3.5, z + dj * 3.5, wanted.stars >= 4);
    cop.mem.post = true;
    cop.heading = headingTo(-di, -dj);
  }
  emitEvent('roadblock', { x: cx, z: cz });
  return true;
}

function deploy(unit) {
  const v = unit.vehicle;
  unit.deployed = true;
  v.driver = { kind: 'parked', update() { v.input.throttle = 0; v.input.brake = 1; }, onEject: crewEject(unit) };
  for (let k = 0; k < unit.crew; k++) {
    const side = k % 2 ? -1 : 1;
    const w = v.localToWorld(side * (v.type.wid / 2 + 0.9), k < 2 ? 0.4 : -1.4, { x: 0, z: 0 });
    spawnOfficer(w.x, w.z, unit.tactical);
  }
  unit.crew = 0;
}

function standDown(unit) {
  const v = unit.vehicle;
  v.siren = false;
  v.ambient = true;
  if (unit.deployed || v.destroyed || v.driver === 'player') return;
  // rejoin traffic from the nearest corner
  const n = nearestNode(v.pos.x, v.pos.z);
  const exits = exitsOf(n.i, n.j);
  if (!exits.length) return;
  const e = rand.pick(exits);
  const d = new LaneDriver(v, n.i, n.j, e.di, e.dj, 1);
  d.onEject = crewEject(unit);
  v.driver = d;
}

/** Run every frame: sizes the response to the stars, runs each unit, and makes arrests. */
export function updatePolice(dt) {
  const p = game.player;
  // patrol cars already cruising in traffic join the chase
  for (const v of game.vehicles) {
    if (!v.type.police || v.policeUnit || v.destroyed || !v.driver || v.driver === 'player') continue;
    if (!v.driver.copReady) { v.driver.copReady = true; const stub = { crew: 2, tactical: false }; v.driver.onEject = crewEject(stub); }
    if (wanted.stars > 0 && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < 140) makeUnit(v);
  }
  let cruisers = 0, trucks = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i], v = u.vehicle;
    const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
    if (v.removed || v.destroyed || v.driver === 'player' || wanted.stars === 0 || d > 330) {
      if (wanted.stars === 0) standDown(u);
      else if (d > 330 && !v.removed && v.driver !== 'player') v.remove();
      v.policeUnit = null;
      units.splice(i, 1);
      continue;
    }
    if (u.deployed) { if (u.roadblock && d > 200) { v.remove(); v.policeUnit = null; units.splice(i, 1); } continue; }
    if (u.tactical) trucks++; else cruisers++;
    const drv = v.driver;
    drv.ram = !!p.vehicle && wanted.stars >= 2;
    drv.stopDistance = p.vehicle ? 0 : 13;
    const playerSlow = Math.hypot(p.vx, p.vz) < 5;
    if (!p.vehicle && d < 17 && Math.abs(v.speed) < 4 && wanted.seen) deploy(u);
    else if (p.vehicle && playerSlow && d < 9 && Math.abs(v.speed) < 3 && wanted.stars <= 2) deploy(u);
    // officers lean out and shoot at three stars and up
    u.shotClock -= dt;
    if (wanted.stars >= 3 && wanted.seen && d < 45 && u.shotClock <= 0 && !p.dead) {
      u.shotClock = u.tactical ? 0.35 : 0.9 + Math.random();
      const t = p.vehicle || p;
      const ox = v.pos.x, oy = v.pos.y + v.height + 0.7, oz = v.pos.z;
      let dx = t.pos.x - ox, dy = t.pos.y + 0.9 - oy, dz = t.pos.z - oz;
      const len = Math.hypot(dx, dy, dz) || 1;
      fireWeapon(u, u.tactical ? 'smg' : 'pistol', ox, oy, oz, dx / len, dy / len, dz / len, 0.07);
    }
  }
  if (wanted.stars > 0 && !game.flags.policeBlind) {
    dispatchClock -= dt;
    if (dispatchClock <= 0) {
      dispatchClock = 2.2;
      if (cruisers < CRUISERS[wanted.stars]) spawnPoliceCruiser('cruiser');
      else if (trucks < TRUCKS[wanted.stars]) spawnPoliceCruiser('bulwark');
    }
    roadblockClock -= dt;
    if (wanted.stars >= 3 && roadblockClock <= 0) roadblockClock = spawnRoadblock() ? 26 : 4;
  }
  updateHelicopter(dt, wanted.stars >= 3 && !game.flags.policeBlind);

  // officers who lost their quarry are cleared away once far off
  for (const n of [...game.npcs]) {
    if (n.role !== 'cop' || n.persistent) continue;
    const d = n.distanceTo(p.pos.x, p.pos.z);
    if (d > 210 || (n.dead && n.deadTime > 40 && d > 50) || (wanted.stars === 0 && n.mem.idle > 14 && d > 60)) n.remove();
  }

  // the arrest: an officer at arm's length of a player who is on foot, or stopped in a car
  if (wanted.stars > 0 && !p.dead && game.mode === 'play') {
    let close = false;
    const still = p.vehicle ? Math.abs(p.vehicle.speed) < 1.5 : true;
    for (const n of game.npcs) if (n.role === 'cop' && !n.dead && !n.knock && n.distanceTo(p.pos.x, p.pos.z) < (p.vehicle ? 3.4 : 2.0)) { close = true; break; }
    arrestClock = close && still ? arrestClock + dt : Math.max(0, arrestClock - dt * 2);
    if (arrestClock > (wanted.stars <= 2 ? 1.3 : 2.6)) { arrestClock = 0; p.die('booked'); }
  } else arrestClock = 0;
}

export function arrestProgress() { return arrestClock; }

/** Removes every police unit at once (after an arrest, a death, or a respray). */
export function clearPolice() {
  for (const u of units) { if (!u.vehicle.removed && u.vehicle.driver !== 'player') u.vehicle.remove(); u.vehicle.policeUnit = null; }
  units.length = 0;
  for (const n of [...game.npcs]) if (n.role === 'cop' && !n.persistent) n.remove();
  dismissHelicopter();
}

export function policeUnitCount() { return units.length; }

onEvent('vehicleDestroyed', ({ vehicle }) => {
  const u = vehicle.policeUnit;
  if (u && u.crew > 0 && vehicle.lastHitBy === 'player') { game.stats.kills += u.crew; reportCrime('copKill', vehicle.pos.x, vehicle.pos.z); }
});
