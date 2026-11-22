// Pedestrians: the people of Marisol Bay. They stroll the sidewalks block by block, cross at
// corners, stop to idle, sunbathe on the beach, and panic, cower, flee or fight back when trouble starts.
import '../police/wanted.js'; // load order: witnesses, then the law they call
import { game, onEvent } from '../core/state.js';
import { rand, headingTo } from '../core/mathutil.js';
import { pointInBuilding } from '../core/collision.js';
import { cam } from '../core/camera.js';
import { GRID, BLOCK, ROAD_HALF, CITY, ISLAND, districtOfBlock } from '../world/layout.js';
import { sun } from '../world/sky.js';
import { Npc } from './npc.js';
import { randomLook } from './humanoid.js';

/** Creates one civilian at (x, z). opts: { look, brave, armed, beach, bx, bz, corner } */
export function spawnPedestrian(x, z, opts = {}) {
  const look = opts.look || randomLook(rand, opts.beach ? 'beach' : 'street');
  const npc = new Npc({ x, z, heading: rand.range(0, 6.28), look, role: 'civilian', health: 55, brain: civilianBrain });
  npc.mem = {
    state: opts.beach ? 'idle' : 'walk', timer: opts.beach ? rand.range(4, 30) : 0, beach: !!opts.beach,
    bx: opts.bx ?? Math.max(0, Math.min(GRID - 2, Math.floor(x / BLOCK))), bz: opts.bz ?? Math.max(0, Math.min(GRID - 2, Math.floor(z / BLOCK))),
    corner: opts.corner ?? rand.int(0, 3), dir: rand.chance(0.5) ? 1 : -1,
    brave: opts.brave ?? rand.chance(0.14), speed: WALK_SPEED * rand.range(0.85, 1.25), threat: null,
  };
  if (opts.armed ?? rand.chance(0.04)) { npc.weapon = 'pistol'; npc.mem.brave = true; npc.accuracy = 0.09; }
  return npc;
}

/** Makes a civilian run from (x, z) for a while; brave ones stand and fight instead. */
export function scarePedestrian(npc, x, z, attacker = null, seconds = 9) {
  if (npc.dead || npc.role !== 'civilian') return;
  const m = npc.mem;
  m.threat = { x, z };
  if (attacker && m.brave && attacker === game.player) { m.state = 'fight'; m.timer = 25; npc.hostileToPlayer = true; return; }
  if (m.state === 'fight') return;
  m.state = rand.chance(0.18) && !attacker ? 'cower' : 'flee';
  m.timer = seconds * rand.range(0.7, 1.3);
}

const WALK_SPEED = 1.5, FLEE_SPEED = 6.2;
let spawnClock = 0;

/** The four sidewalk corners of block (bx, bz): 0 NW, 1 NE, 2 SE, 3 SW. */
function cornerOf(bx, bz, k) {
  const a = ROAD_HALF + 1.6, b = BLOCK - ROAD_HALF - 1.6;
  return { x: bx * BLOCK + (k === 1 || k === 2 ? b : a), z: bz * BLOCK + (k >= 2 ? b : a) };
}

function civilianBrain(npc, dt) {
  const m = npc.mem, p = game.player;
  m.timer -= dt;
  if (m.state === 'fight') {
    if (m.timer <= 0 || p.dead || npc.distanceTo(p.pos.x, p.pos.z) > 45) { m.state = 'flee'; m.timer = 5; npc.hostileToPlayer = false; return; }
    const d = npc.distanceTo(p.pos.x, p.pos.z);
    if (npc.weapon) {
      if (d < 26 && npc.seesPlayer) npc.shootAt(p.vehicle || p, dt); else npc.moveToward(p.pos.x, p.pos.z, 4.2, dt);
    } else if (p.vehicle) { m.state = 'flee'; m.timer = 6; }
    else if (d > 1.5) npc.moveToward(p.pos.x, p.pos.z, 4.6, dt);
    else npc.punch(p, dt);
    return;
  }
  if (m.state === 'flee') {
    if (m.timer <= 0) { m.state = m.beach ? 'idle' : 'walk'; m.timer = 3; return; }
    const dx = npc.pos.x - m.threat.x, dz = npc.pos.z - m.threat.z, d = Math.hypot(dx, dz) || 1;
    // run away, veering a little so a crowd scatters
    const veer = Math.sin(npc.body.phase * 0.3 + npc.pos.x) * 0.5;
    npc.moveToward(npc.pos.x + (dx / d) * 8 - (dz / d) * veer * 6, npc.pos.z + (dz / d) * 8 + (dx / d) * veer * 6, FLEE_SPEED, dt);
    return;
  }
  if (m.state === 'cower') {
    npc.anim = 'cower';
    if (m.timer <= 0) { m.state = 'flee'; m.timer = 4; }
    return;
  }
  // a gun pointed their way: hands up
  if (p && !p.vehicle && p.aiming && npc.seesPlayer && npc.distanceTo(p.pos.x, p.pos.z) < 11) {
    const facing = Math.cos(headingTo(npc.pos.x - p.pos.x, npc.pos.z - p.pos.z) - p.heading);
    if (facing > 0.9) { npc.anim = 'handsup'; npc.faceToward(p.pos.x, p.pos.z, dt); m.scared = (m.scared || 0) + dt; if (m.scared > 2.5) scarePedestrian(npc, p.pos.x, p.pos.z); return; }
  }
  if (m.state === 'idle') {
    if (m.timer <= 0) {
      if (m.beach) { m.wander = { x: npc.pos.x + rand.range(-12, 12), z: npc.pos.z + rand.range(-12, 12) }; m.state = 'stroll'; m.timer = 9; }
      else m.state = 'walk';
    }
    return;
  }
  if (m.state === 'stroll') {
    if (npc.moveToward(m.wander.x, m.wander.z, 1.2, dt) < 0.4 || m.timer <= 0) { m.state = 'idle'; m.timer = rand.range(5, 25); }
    return;
  }
  // walking the sidewalk toward the next corner of the block
  const c = cornerOf(m.bx, m.bz, m.corner);
  if (npc.moveToward(c.x, c.z, m.speed, dt) < 0.5) {
    if (rand.chance(0.12)) { m.state = 'idle'; m.timer = rand.range(2, 7); }
    if (rand.chance(0.35)) {
      // cross the street to the neighbouring block
      const k = m.corner, alongX = rand.chance(0.5);
      let nbx = m.bx, nbz = m.bz, nk = k;
      if (alongX) { nbx += k === 1 || k === 2 ? 1 : -1; nk = [1, 0, 3, 2][k]; }
      else { nbz += k >= 2 ? 1 : -1; nk = [3, 2, 1, 0][k]; }
      if (nbx >= 0 && nbz >= 0 && nbx < GRID - 1 && nbz < GRID - 1) { m.bx = nbx; m.bz = nbz; m.corner = nk; return; }
    }
    m.corner = (m.corner + m.dir + 4) % 4;
  }
}

/** Keeps the streets around the player populated; fewer people walk at night. */
export function updatePedestrians(dt) {
  const p = game.player;
  let civilians = 0;
  for (const n of [...game.npcs]) {
    if (n.role !== 'civilian' || n.persistent) continue;
    const d = n.distanceTo(p.pos.x, p.pos.z);
    if (d > 175 || (n.dead && (n.deadTime > 45 || d > 90))) { n.remove(); continue; }
    if (!n.dead) civilians++;
  }
  spawnClock -= dt;
  const want = Math.round((game.debug.pedDensity ?? 1) * (16 + 20 * sun.day));
  if (spawnClock > 0 || civilians >= want) return;
  spawnClock = 0.12;
  const onBeach = p.pos.x > CITY - 60 && rand.chance(0.4);
  let x, z, opts = {};
  if (onBeach) {
    x = rand.range(CITY + 14, ISLAND.x1 - 36); z = p.pos.z + rand.range(-110, 110);
    if (z < -20 || z > CITY + 30) return;
    opts.beach = true;
  } else {
    const bx = Math.max(0, Math.min(GRID - 2, Math.floor(p.pos.x / BLOCK) + rand.int(-2, 2)));
    const bz = Math.max(0, Math.min(GRID - 2, Math.floor(p.pos.z / BLOCK) + rand.int(-2, 2)));
    const d = districtOfBlock(bx, bz);
    if ((d === 'docks' || d === 'heights') && rand.chance(0.5)) return;
    const k = rand.int(0, 3), k2 = (k + 1) % 4, t = rand();
    const a = cornerOf(bx, bz, k), b = cornerOf(bx, bz, k2);
    x = a.x + (b.x - a.x) * t; z = a.z + (b.z - a.z) * t;
    opts = { bx, bz, corner: k2 };
  }
  const dx = x - p.pos.x, dz = z - p.pos.z, dist = Math.hypot(dx, dz);
  if (dist < 28 || dist > 150) return;
  // never pop in where the camera is looking, unless far away
  const inView = (dx * cam.forward.x + dz * cam.forward.z) / dist > 0.55;
  if (inView && dist < 85 && !game.debug.spawnInView) return;
  if (pointInBuilding(x, z)) return;
  spawnPedestrian(x, z, opts);
}

onEvent('gunfire', ({ shooter, x, z }) => {
  for (const n of game.npcs) if (n.role === 'civilian' && !n.dead && n.distanceTo(x, z) < 45) scarePedestrian(n, x, z, null, 10);
});
onEvent('explosion', ({ x, z }) => {
  for (const n of game.npcs) if (n.role === 'civilian' && !n.dead && n.distanceTo(x, z) < 70) scarePedestrian(n, x, z, null, 12);
});
onEvent('npcHurt', ({ npc, attacker }) => {
  if (npc.role === 'civilian' && !npc.dead) scarePedestrian(npc, attacker ? attacker.pos.x : npc.pos.x + 1, attacker ? attacker.pos.z : npc.pos.z, attacker, 12);
  for (const n of game.npcs) if (n !== npc && n.role === 'civilian' && !n.dead && n.distanceTo(npc.pos.x, npc.pos.z) < 22) scarePedestrian(n, npc.pos.x, npc.pos.z, null, 8);
});
onEvent('carjack', ({ vehicle }) => {
  for (const n of game.npcs) if (n.role === 'civilian' && !n.dead && n.distanceTo(vehicle.pos.x, vehicle.pos.z) < 18) scarePedestrian(n, vehicle.pos.x, vehicle.pos.z, null, 6);
});
