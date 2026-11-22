// Ambient traffic: keeps the streets near the player full of cars that follow lanes and stop at
// red lights, fills parking bays with cars to steal, and clears away what is left far behind.
import { spawnPedestrian, scarePedestrian } from '../characters/pedestrians.js';
import { game, onEvent } from '../core/state.js';
import { rand } from '../core/mathutil.js';
import { cam } from '../core/camera.js';
import { randomLanePoint } from '../world/roads.js';
import { parkingSpots } from '../world/buildings.js';
import { sun } from '../world/sky.js';
import { Vehicle } from './vehicle.js';
import { CIVILIAN_TYPES } from './catalog.js';
import { LaneDriver } from './driver.js';

/** Puts one AI-driven car in a lane. `at` comes from randomLanePoint. Returns the Vehicle. */
export function spawnTrafficCar(at, typeId = null) {
  const id = typeId || (rand.chance(0.05) ? 'cruiser' : rand.pick(CIVILIAN_TYPES));
  const v = new Vehicle(id, at.x, at.z, at.heading);
  const driver = new LaneDriver(v, at.i, at.j, at.di, at.dj, at.lane);
  v.driver = driver;
  v.ambient = true;
  v.vx = Math.sin(at.heading) * driver.cruise * 0.8; v.vz = Math.cos(at.heading) * driver.cruise * 0.8;
  driver.onEject = (x, z) => {
    const ped = spawnPedestrian(x, z, {});
    scarePedestrian(ped, v.pos.x, v.pos.z, game.player, 14);
    return ped;
  };
  return v;
}

export function spawnParkedCar(spot, typeId = null) {
  const v = new Vehicle(typeId || rand.pick(CIVILIAN_TYPES), spot.x, spot.z, spot.heading);
  v.ambient = true;
  v.parkedAt = spot;
  spot.vehicle = v;
  return v;
}

let spawnClock = 0, parkClock = 0;

function clearOf(x, z, radius) {
  for (const v of game.vehicles) if (Math.hypot(v.pos.x - x, v.pos.z - z) < radius) return false;
  return true;
}

/** Spawns and removes ambient vehicles around the player. Call every frame. */
export function updateTraffic(dt) {
  const p = game.player;
  let moving = 0;
  for (const v of [...game.vehicles]) {
    if (v.driver === 'player' || v.keep) continue;
    const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
    const abandoned = v.ownedByPlayer && !v.driver;
    const far = v.ambient && !v.ownedByPlayer ? d > 250 : abandoned ? d > 190 && v !== game.lastVehicle : false;
    const wreck = v.destroyed && (d > 120 || v.age > 9999);
    if (v.destroyed) { v.wreckAge = (v.wreckAge || 0) + dt; }
    if (far || wreck || (v.destroyed && v.wreckAge > 50 && d > 45)) {
      if (v.parkedAt) v.parkedAt.vehicle = null;
      if (v.driver && v.driver.onRemove) v.driver.onRemove();
      v.remove();
      continue;
    }
    if (v.parkedAt && Math.hypot(v.pos.x - v.parkedAt.x, v.pos.z - v.parkedAt.z) > 6) { v.parkedAt.vehicle = null; v.parkedAt = null; }
    if (v.ambient && v.driver && v.driver.kind === 'traffic') moving++;
  }
  spawnClock -= dt; parkClock -= dt;
  const want = Math.round((game.debug.trafficDensity ?? 1) * (11 + 13 * sun.day));
  if (spawnClock <= 0 && moving < want) {
    spawnClock = 0.15;
    const at = randomLanePoint(rand, p.pos.x, p.pos.z, 55, 215);
    if (at) {
      const dx = at.x - p.pos.x, dz = at.z - p.pos.z, dist = Math.hypot(dx, dz);
      const inView = (dx * cam.forward.x + dz * cam.forward.z) / dist > 0.5;
      if ((!inView || dist > 130 || game.debug.spawnInView) && clearOf(at.x, at.z, 13)) spawnTrafficCar(at);
    }
  }
  if (parkClock <= 0) {
    parkClock = 0.4;
    const minDist = game.time < 4 ? 6 : 60; // the first seconds fill the bays right around the player
    let made = 0;
    for (const spot of parkingSpots) {
      if (spot.vehicle || spot.reserved) continue;
      const d = Math.hypot(spot.x - p.pos.x, spot.z - p.pos.z);
      if (d < minDist || d > 180) continue;
      if (spot.roll === undefined) spot.roll = rand();
      if (spot.roll < 0.55 && clearOf(spot.x, spot.z, 5)) { spawnParkedCar(spot); if (++made >= 3) break; }
    }
  }
}

function panicNear(x, z, range, seconds) {
  for (const v of game.vehicles) {
    const d = v.driver;
    if (!d || d === 'player' || d.kind !== 'traffic' || v.type.police) continue;
    if (Math.hypot(v.pos.x - x, v.pos.z - z) < range) d.panic = Math.max(d.panic, seconds);
  }
}

onEvent('gunfire', ({ x, z }) => panicNear(x, z, 40, 8));
onEvent('explosion', ({ x, z }) => panicNear(x, z, 60, 10));
onEvent('vehicleCollision', ({ a, b, impact }) => {
  if (impact < 5) return;
  for (const v of [a, b]) if (v.driver && v.driver.kind === 'traffic' && (a.driver === 'player' || b.driver === 'player')) v.driver.panic = 7;
});
onEvent('vehicleShot', ({ vehicle }) => { if (vehicle.driver && vehicle.driver.kind === 'traffic') vehicle.driver.panic = 12; });
onEvent('enteredVehicle', ({ vehicle }) => { game.lastVehicle = vehicle; });
