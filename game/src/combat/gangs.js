// Armed opposition: the Coral Kings street gang and Sterling Vance's private security. Spawns
// gunmen, runs their fight (advance, hold, shoot, search), and keeps a few Kings loitering on their turf.
import { game, onEvent } from '../core/state.js';
import { rand } from '../core/mathutil.js';
import { pointInBuilding } from '../core/collision.js';
import { districtAt, BLOCK, ROAD_HALF } from '../world/layout.js';
import { Npc } from '../characters/npc.js';

const KING_SHIRTS = [0xff6b4a, 0xff8a5c, 0xf2542d];
let turfClock = 2;

function lookFor(gang) {
  const skin = rand.pick([0xf2c9a0, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e]);
  if (gang === 'vance') return { skin, shirt: 0x1b1b1f, pants: 0x1b1b1f, hair: 0x111111, shades: true, shoes: 0x111111 };
  return { skin, shirt: rand.pick(KING_SHIRTS), pants: rand.pick([0xf5f5f5, 0x2a3a5a]), hair: 0x111111, hat: rand.chance(0.6) ? 'cap' : null, hatColor: 0xff6b4a, sleeveless: rand.chance(0.5), shades: rand.chance(0.4) };
}

/** opts: { gang: 'kings' | 'vance', weapon, hostile, health, hold (stay near the post), persistent } */
export function spawnGangster(x, z, opts = {}) {
  const gang = opts.gang || 'kings';
  const npc = new Npc({
    x, z, heading: opts.heading ?? rand.range(0, 6.28), look: lookFor(gang), role: gang === 'vance' ? 'guard' : 'gang',
    health: opts.health ?? (gang === 'vance' ? 110 : 80), weapon: opts.weapon || rand.pick(['pistol', 'pistol', 'smg']), accuracy: opts.accuracy ?? 0.085, brain: gangBrain,
  });
  npc.gang = gang;
  npc.hostileToPlayer = !!opts.hostile;
  npc.persistent = !!opts.persistent;
  npc.mem = { post: { x, z }, hold: !!opts.hold, alert: 0, strafe: rand.chance(0.5) ? 1 : -1, strafeClock: 0, lastKnown: null };
  return npc;
}

export function alertGang(x, z, range, gang = null) {
  for (const n of game.npcs) {
    if ((n.role !== 'gang' && n.role !== 'guard') || n.dead) continue;
    if (gang && n.gang !== gang) continue;
    if (n.distanceTo(x, z) < range) { n.hostileToPlayer = true; n.mem.alert = 20; }
  }
}

function gangBrain(npc, dt) {
  const m = npc.mem, p = game.player;
  if (!npc.hostileToPlayer || p.dead) {
    // off duty: lean about near the post
    m.strafeClock -= dt;
    if (m.strafeClock <= 0) { m.strafeClock = rand.range(4, 10); m.wander = { x: m.post.x + rand.range(-3, 3), z: m.post.z + rand.range(-3, 3) }; }
    if (m.wander && npc.distanceTo(m.wander.x, m.wander.z) > 0.6) npc.moveToward(m.wander.x, m.wander.z, 1.2, dt);
    return;
  }
  const target = p.vehicle || p;
  const d = npc.distanceTo(p.pos.x, p.pos.z);
  if (npc.seesPlayer && d < 60) {
    m.lastKnown = { x: p.pos.x, z: p.pos.z };
    m.alert = 15;
    if (d > 24 && !m.hold) npc.moveToward(p.pos.x, p.pos.z, 4.4, dt);
    else if (d < 30 || m.hold) {
      // sidestep between bursts so they are not sitting ducks
      m.strafeClock -= dt;
      if (m.strafeClock <= 0) { m.strafeClock = rand.range(1.2, 3); m.strafe = -m.strafe; }
      if (!m.hold && npc.fireCooldown > 0.35) {
        const sx = Math.cos(npc.heading) * m.strafe, sz = -Math.sin(npc.heading) * m.strafe;
        npc.pos.x += sx * 1.6 * dt; npc.pos.z += sz * 1.6 * dt;
      }
      npc.shootAt(target, dt);
    }
  } else if (m.lastKnown && !m.hold) {
    m.alert -= dt;
    if (npc.distanceTo(m.lastKnown.x, m.lastKnown.z) > 2) npc.moveToward(m.lastKnown.x, m.lastKnown.z, 4.2, dt);
    else if (m.alert <= 0) { m.lastKnown = null; }
  }
}

/** Keeps a handful of Coral Kings hanging around Southside street corners when the player is there. */
export function updateGangs(dt) {
  const p = game.player;
  turfClock -= dt;
  let kings = 0;
  for (const n of [...game.npcs]) {
    if (n.role !== 'gang' || n.persistent) continue;
    const d = n.distanceTo(p.pos.x, p.pos.z);
    if (d > 170 || (n.dead && (n.deadTime > 50 || d > 90))) { n.remove(); continue; }
    if (!n.dead) kings++;
  }
  if (turfClock > 0 || kings >= 4 || game.flags.noAmbientGangs) return;
  turfClock = 3;
  const bx = Math.floor(p.pos.x / BLOCK) + rand.int(-1, 1), bz = Math.floor(p.pos.z / BLOCK) + rand.int(-1, 1);
  const x = bx * BLOCK + ROAD_HALF + 1.8 + rand.range(0, 4), z = bz * BLOCK + ROAD_HALF + 1.8 + rand.range(0, 4);
  if (districtAt(x + 10, z + 10) !== 'southside') return;
  const d = Math.hypot(x - p.pos.x, z - p.pos.z);
  if (d < 45 || d > 140 || pointInBuilding(x, z)) return;
  const n = 2 + rand.int(0, 1);
  for (let k = 0; k < n; k++) spawnGangster(x + k * 1.2, z + rand.range(-1, 1), { gang: 'kings' });
}

onEvent('npcHurt', ({ npc, attacker }) => {
  if ((npc.role === 'gang' || npc.role === 'guard') && attacker === game.player) alertGang(npc.pos.x, npc.pos.z, 45, npc.gang);
});
onEvent('npcKilled', ({ npc, attacker }) => {
  if ((npc.role === 'gang' || npc.role === 'guard') && attacker === game.player) alertGang(npc.pos.x, npc.pos.z, 45, npc.gang);
});
onEvent('gunfire', ({ shooter, x, z }) => {
  if (shooter === game.player) alertGang(x, z, 22);
});
