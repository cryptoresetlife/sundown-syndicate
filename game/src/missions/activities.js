// Side activities outside the story: Sol Cab taxi fares, three street races around the island,
// and the reward for hunting down the Golden Flamingos.
import { game, onEvent, emitEvent, addMoney } from '../core/state.js';
import { wasKeyPressed } from '../core/input.js';
import { rand, formatMoney } from '../core/mathutil.js';
import { LANDMARKS, GRID } from '../world/layout.js';
import { exitsOf, lanePoint } from '../world/roads.js';
import { addMarker, removeMarker } from '../world/markers.js';
import { FLAMINGO_TOTAL } from '../world/pickups.js';
import { spawnPedestrian } from '../characters/pedestrians.js';
import { mission, registerSideMissions, race } from './missions.js';
import { say } from './dialogue.js';
import { playSound } from '../audio/sound.js';

export const taxi = { on: false, state: 'idle', passenger: null, marker: null, fares: 0, streak: 0, timeLeft: 0, tripLength: 0, earned: 0 };

const FARE_LINES = [
  'Club Flamingo, and step on it!', 'Take the scenic route, I am on expenses.', 'Is this thing air-conditioned?',
  'My ex is behind us. Drive.', 'I will tip if we beat the light.', 'First time in Marisol Bay. Is it always this loud?',
];

registerSideMissions([
  { id: 'race_tidewater', title: 'Tidewater Sprint', side: true, needVehicle: true, unlockAt: 1, x: 798, z: 196, letter: 'R', reward: 800, passText: 'RACE WON',
    steps: [race({ nodes: [[10, 3], [10, 7], [10, 10], [7, 10], [7, 8], [10, 8], [10, 5]], rivals: [{ type: 'marlin', paint: 0x35c8e8, pace: 0.72 }, { type: 'caliente', paint: 0xffd23f, pace: 0.78 }] })] },
  { id: 'race_docks', title: 'Dockside Dash', side: true, needVehicle: true, unlockAt: 2, x: -2, z: 500, letter: 'R', reward: 700, passText: 'RACE WON',
    steps: [race({ nodes: [[0, 7], [0, 10], [3, 10], [3, 8], [1, 8], [1, 6], [0, 6]], rivals: [{ type: 'dune', paint: 0xe63946, pace: 0.95 }, { type: 'caliente', paint: 0x2b2d42, pace: 0.76 }] })] },
  { id: 'race_heights', title: 'Heights Loop', side: true, needVehicle: true, unlockAt: 3, x: 250, z: 2, letter: 'R', reward: 900, passText: 'RACE WON',
    steps: [race({ nodes: [[4, 0], [8, 0], [8, 2], [4, 2], [4, 1], [1, 1], [1, 0], [3, 0]], rivals: [{ type: 'vanta', paint: 0xff70a6, pace: 0.66 }, { type: 'marlin', paint: 0x06d6a0, pace: 0.76 }, { type: 'caliente', paint: 0xffffff, pace: 0.8 }] })] },
]);

function setTaxiMarker(x, z, color, label) {
  if (taxi.marker) removeMarker(taxi.marker);
  taxi.marker = addMarker({ x, z, color, radius: 4, label, kind: 'objective' });
}

function nextPickup() {
  const p = game.player;
  for (let tries = 0; tries < 40; tries++) {
    const i = rand.int(0, GRID - 1), j = rand.int(0, GRID - 1);
    const exits = exitsOf(i, j);
    if (!exits.length) continue;
    const e = rand.pick(exits);
    const at = lanePoint(i, j, e.di, e.dj, rand.range(28, 52), 1);
    const d = Math.hypot(at.x - p.pos.x, at.z - p.pos.z);
    if (d < 90 || d > 300) continue;
    // the fare waits on the sidewalk beside the kerb lane
    const ped = spawnPedestrian(at.x - e.dj * 3.6, at.z + e.di * 3.6, {});
    ped.persistent = true; ped.mem.state = 'idle'; ped.mem.timer = 9999; ped.invulnerable = false;
    taxi.passenger = ped;
    taxi.state = 'pickup';
    setTaxiMarker(at.x, at.z, 0xffe14a, '☺');
    mission.objective = 'Pick up the fare';
    return;
  }
}

function startTrip() {
  const p = game.player;
  const places = Object.values(LANDMARKS).filter((l) => Math.hypot(l.streetX - p.pos.x, l.streetZ - p.pos.z) > 180);
  const dest = rand.pick(places);
  taxi.tripLength = Math.hypot(dest.streetX - p.pos.x, dest.streetZ - p.pos.z);
  taxi.timeLeft = taxi.tripLength / 9.5 + 20;
  taxi.state = 'dropoff';
  taxi.dest = dest;
  setTaxiMarker(dest.streetX, dest.streetZ, 0x4dff9a, '$');
  mission.objective = 'Drive the fare to ' + dest.name;
  say([['FARE', rand.pick(FARE_LINES).replace('Club Flamingo', dest.name)]]);
}

export function stopTaxiWork(reason = '') {
  if (!taxi.on) return;
  taxi.on = false; taxi.state = 'idle';
  if (taxi.marker) { removeMarker(taxi.marker); taxi.marker = null; }
  if (taxi.passenger && !taxi.passenger.removed) { taxi.passenger.persistent = false; taxi.passenger.inVehicle = null; taxi.passenger.mem.state = 'walk'; }
  taxi.passenger = null;
  if (!mission.active) { mission.objective = ''; mission.timer = null; mission.info = ''; }
  if (reason) emitEvent('hint', { text: reason });
}

/** Taxi work: toggled with T while driving a Sol Cab and no mission is running. */
export function updateActivities(dt) {
  const p = game.player, v = p.vehicle;
  const inCab = v && v.typeId === 'solcab' && !v.destroyed;
  if (!taxi.on) {
    if (inCab && !mission.active) {
      if (!taxi.hinted) { taxi.hinted = true; emitEvent('hint', { text: 'Press T to work Sol Cab fares' }); }
      if (wasKeyPressed('KeyT')) { taxi.on = true; taxi.streak = 0; taxi.earned = 0; playSound('checkpoint'); nextPickup(); }
    } else taxi.hinted = false;
    return;
  }
  if (!inCab || mission.active) { stopTaxiWork(mission.active ? '' : 'Taxi shift over: ' + formatMoney(taxi.earned) + ' earned'); return; }
  if (wasKeyPressed('KeyT')) { stopTaxiWork('Taxi shift over: ' + formatMoney(taxi.earned) + ' earned'); return; }
  mission.info = 'Fares in a row: ' + taxi.streak + '   ·   Shift: ' + formatMoney(taxi.earned);
  const stopped = Math.abs(v.speed) < 2;
  if (taxi.state === 'idle') { nextPickup(); return; }
  const ped = taxi.passenger;
  if (taxi.state === 'pickup') {
    if (!ped || ped.dead || ped.removed) { taxi.streak = 0; nextPickup(); return; }
    const d = Math.hypot(p.pos.x - taxi.marker.x, p.pos.z - taxi.marker.z);
    if (d < 9 && stopped) {
      // the fare walks over and climbs in
      ped.mem.state = 'boarding';
      ped.brain = (n, step) => { if (n.moveToward(v.pos.x, v.pos.z, 3, step) < 2.6) { n.inVehicle = v; n.brain = null; startTrip(); } };
      taxi.state = 'boarding';
      mission.objective = 'Wait for the fare to get in';
    }
    return;
  }
  if (taxi.state === 'boarding') { if (!ped || ped.dead || ped.removed) { taxi.streak = 0; nextPickup(); } return; }
  // dropoff
  taxi.timeLeft -= dt;
  mission.timer = { left: taxi.timeLeft };
  if (taxi.timeLeft <= 0) {
    say([['FARE', 'Forget it, I will walk from here!']]);
    taxi.streak = 0; mission.timer = null;
    if (ped && !ped.removed) ped.remove();
    nextPickup();
    return;
  }
  const d = Math.hypot(p.pos.x - taxi.marker.x, p.pos.z - taxi.marker.z);
  if (d < 7 && stopped) {
    const pay = Math.round(30 + taxi.tripLength * 0.4 + taxi.timeLeft * 3 + taxi.streak * 25);
    addMoney(pay, 'fare');
    taxi.earned += pay; taxi.streak++; taxi.fares++; game.stats.fares++;
    playSound('cash');
    emitEvent('hint', { text: 'Fare paid: ' + formatMoney(pay) + (taxi.streak > 1 ? '  (streak x' + taxi.streak + ')' : '') });
    if (ped && !ped.removed) ped.remove();
    mission.timer = null;
    nextPickup();
  }
}

onEvent('pickup', ({ kind }) => {
  if (kind !== 'flamingo') return;
  addMoney(300, 'flamingo');
  emitEvent('hint', { text: 'Golden Flamingo ' + game.stats.flamingos + ' of ' + FLAMINGO_TOTAL + '  +$300' });
  if (game.stats.flamingos === FLAMINGO_TOTAL) { addMoney(10000, 'flamingo'); mission.banner = { kind: 'pass', title: 'FLOCK COMPLETE', sub: 'All Golden Flamingos found  +$10,000', time: 6 }; }
});
onEvent('playerDown', () => stopTaxiWork());
