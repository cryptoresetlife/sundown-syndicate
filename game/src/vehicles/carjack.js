// Getting in and out of cars: stealing a parked one, dragging a driver out of a moving one
// (a carjacking, which witnesses report), and climbing out again without ending up inside a wall.
import { game, emitEvent } from '../core/state.js';
import { pointInBuilding } from '../core/collision.js';
import { playSound } from '../audio/sound.js';
import { snapCameraBehind } from '../core/camera.js';

export const ENTER_RANGE = 3.6;

/** The closest vehicle the player could get into right now, or null. */
export function nearestEnterableVehicle(player) {
  let best = null, bestD = ENTER_RANGE;
  for (const v of game.vehicles) {
    if (v.destroyed || v.locked || v.burnTimer > 0) continue;
    const l = v.worldToLocal(player.pos.x, player.pos.z, { x: 0, z: 0 });
    const d = Math.hypot(Math.max(0, Math.abs(l.x) - v.type.wid / 2), Math.max(0, Math.abs(l.z) - v.type.len / 2));
    if (d < bestD && Math.abs(v.speed) < 9) { bestD = d; best = v; }
  }
  return best;
}

/** Throws the AI driver out onto the street and puts the player behind the wheel. */
export function hijackVehicle(player, vehicle) {
  const ai = vehicle.driver;
  const door = vehicle.doorPosition();
  vehicle.driver = null;
  let victim = null;
  if (ai && ai.onEject) victim = ai.onEject(door.x, door.z, vehicle);
  if (victim) victim.knock = { vx: (door.x - vehicle.pos.x) * 1.2, vy: 1.5, vz: (door.z - vehicle.pos.z) * 1.2, time: 0.9 };
  emitEvent('carjack', { vehicle, victim, ai });
  playSound('punch', vehicle.pos.x, vehicle.pos.z);
  enterVehicle(player, vehicle, true);
}

export function enterVehicle(player, vehicle, stolen = false) {
  if (vehicle.driver && vehicle.driver !== 'player') return hijackVehicle(player, vehicle);
  const firstTime = !vehicle.ownedByPlayer;
  vehicle.driver = 'player';
  vehicle.ownedByPlayer = true;
  vehicle.siren = false;
  player.vehicle = vehicle;
  player.body.root.visible = false;
  player.aiming = false;
  if (firstTime) game.stats.carsStolen++;
  playSound('door', vehicle.pos.x, vehicle.pos.z);
  snapCameraBehind(vehicle.heading);
  emitEvent('enteredVehicle', { vehicle, stolen: stolen || firstTime });
}

export function exitVehicle(player) {
  const v = player.vehicle;
  if (!v) return;
  // driver's side first, then the passenger side, then behind
  const spots = [[v.type.wid / 2 + 0.8, 0], [-v.type.wid / 2 - 0.8, 0], [0, -v.type.len / 2 - 1], [0, v.type.len / 2 + 1]];
  let out = null;
  for (const [lx, lz] of spots) {
    const w = v.localToWorld(lx, lz, { x: 0, z: 0 });
    if (!pointInBuilding(w.x, w.z)) { out = w; break; }
  }
  if (!out) out = v.localToWorld(spots[0][0], 0, { x: 0, z: 0 });
  v.driver = null;
  v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = false;
  player.vehicle = null;
  player.pos.x = out.x; player.pos.z = out.z;
  player.heading = v.heading;
  player.body.root.visible = true;
  playSound('door', v.pos.x, v.pos.z);
  emitEvent('exitedVehicle', { vehicle: v });
}
