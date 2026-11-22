// Weapons and ballistics: the arsenal's numbers, hitscan bullets against people, cars and walls,
// shotgun spreads, the grenade launcher's blast, fists, and everything a hit sets off.
import '../characters/player.js'; // load order: the guns, then the player who fires them
import { game, emitEvent, onEvent } from '../core/state.js';
import { raycastWorld } from '../core/collision.js';
import { spawnTracer, spawnMuzzleFlash, spawnSparks, spawnBlood, spawnExplosion, spawnDust } from '../fx/effects.js';
import { playSound } from '../audio/sound.js';

export const WEAPONS = {
  fists: { name: 'Fists', melee: true, damage: 16, rate: 0.42, range: 1.9, icon: '✊' },
  pistol: { name: 'Viper 9', damage: 24, rate: 0.24, clip: 12, spread: 0.01, range: 110, price: 350, ammoPack: 48, ammoPrice: 60, sound: 'pistol', icon: '▄︻', model: 'pistol' },
  smg: { name: 'Hornet SMG', damage: 15, rate: 0.08, clip: 32, spread: 0.028, range: 100, auto: true, price: 1400, ammoPack: 96, ammoPrice: 110, sound: 'smg', icon: '▄︻═', model: 'pistol' },
  shotgun: { name: 'Boomstick 12', damage: 13, pellets: 8, rate: 0.85, clip: 6, spread: 0.075, range: 42, price: 1100, ammoPack: 24, ammoPrice: 90, sound: 'shotgun', icon: '▄︻══', model: 'long' },
  rifle: { name: 'Coyote AR', damage: 28, rate: 0.105, clip: 30, spread: 0.014, range: 170, auto: true, price: 3200, ammoPack: 90, ammoPrice: 160, sound: 'rifle', icon: '▄︻┻═', model: 'long' },
  launcher: { name: 'Thumper GL', damage: 190, rate: 1.5, clip: 1, spread: 0.008, range: 140, explosive: 8, price: 7500, ammoPack: 6, ammoPrice: 600, sound: 'launcher', icon: '▄︻██', model: 'long' },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'launcher'];

const HUMAN_RADIUS = 0.42, HUMAN_HEIGHT = 1.82;

/** Finds what a ray hits first. Returns { dist, x, y, z, npc, vehicle, player } (dist = range on a miss). */
export function hitscan(ox, oy, oz, dx, dy, dz, range, ignore = null) {
  const hit = { dist: raycastWorld(ox, oy, oz, dx, dy, dz, range), npc: null, vehicle: null, player: null, x: 0, y: 0, z: 0 };
  const flat = dx * dx + dz * dz;
  const person = (who, px, py, pz) => {
    if (flat < 1e-8) return false;
    // closest approach of the ray to a vertical cylinder
    const t = ((px - ox) * dx + (pz - oz) * dz) / flat;
    if (t < 0 || t > hit.dist) return false;
    const cx = ox + dx * t - px, cz = oz + dz * t - pz;
    const d2 = cx * cx + cz * cz;
    if (d2 > HUMAN_RADIUS * HUMAN_RADIUS) return false;
    const back = Math.sqrt((HUMAN_RADIUS * HUMAN_RADIUS - d2) / flat);
    const te = Math.max(0, t - back), y = oy + dy * te;
    if (y < py - 0.05 || y > py + HUMAN_HEIGHT) return false;
    hit.dist = te; hit.npc = null; hit.vehicle = null; hit.player = null;
    hit.headshot = y > py + 1.5;
    return true;
  };
  for (const n of game.npcs) {
    if (n === ignore || n.dead || n.inVehicle) continue;
    if (person(n, n.pos.x, n.pos.y, n.pos.z)) hit.npc = n;
  }
  const p = game.player;
  if (p && p !== ignore && !p.vehicle && !p.dead && person(p, p.pos.x, p.pos.y, p.pos.z)) hit.player = p;
  for (const v of game.vehicles) {
    if (v === ignore) continue;
    const rx = v.pos.x - ox, rz = v.pos.z - oz;
    const along = rx * dx + rz * dz;
    if (along < -v.radius || along > hit.dist + v.radius) continue;
    // the ray in the car's own frame, against its bounding box
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const lox = -rx * c + rz * s, loz = -rx * s - rz * c, loy = oy - v.pos.y;
    const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
    const hw = v.type.wid / 2, hl = v.type.len / 2, hh = v.height + 0.1;
    let t0 = 0, t1 = hit.dist, ok = true;
    for (const [o, d, lo, hi] of [[lox, ldx, -hw, hw], [loy, dy, 0.2, hh], [loz, ldz, -hl, hl]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) { const w = a; a = b; b = w; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (t0 > t1) { ok = false; break; }
    }
    if (!ok) continue;
    hit.dist = t0; hit.vehicle = v; hit.npc = null; hit.player = null;
  }
  hit.x = ox + dx * hit.dist; hit.y = oy + dy * hit.dist; hit.z = oz + dz * hit.dist;
  return hit;
}

/** Hurts everything within radius of a blast; used by the launcher and by exploding cars. */
export function applyBlast(x, y, z, radius, damage, attacker = null, source = null) {
  for (const n of game.npcs) {
    if (n.dead) continue;
    const d = Math.hypot(n.pos.x - x, n.pos.z - z);
    if (d < radius) n.takeDamage(damage * (1 - d / radius), attacker, { knock: { x: (n.pos.x - x) / (d || 1) * 7, z: (n.pos.z - z) / (d || 1) * 7 } });
  }
  for (const v of [...game.vehicles]) {
    if (v === source || v.destroyed) continue;
    const d = Math.hypot(v.pos.x - x, v.pos.z - z);
    if (d < radius + 1.5) {
      v.damage(damage * 0.8 * (1 - d / (radius + 1.5)), attacker === game.player ? 'player' : attacker);
      v.vx += (v.pos.x - x) / (d || 1) * 4; v.vz += (v.pos.z - z) / (d || 1) * 4;
    }
  }
  const p = game.player;
  if (p && !p.dead) {
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d < radius) p.takeDamage(damage * 0.55 * (1 - d / radius) * (p.vehicle ? 0.4 : 1), attacker === p ? null : attacker);
  }
}

/**
 * Fires one trigger pull of a gun from (ox,oy,oz) along the unit direction, with the weapon's spread.
 * `shooter` is the player or an Npc; `aimSpread` adds an NPC's inaccuracy. Returns the last hit.
 */
export function fireWeapon(shooter, weaponId, ox, oy, oz, dx, dy, dz, aimSpread = 0) {
  const w = WEAPONS[weaponId];
  const isPlayer = shooter === game.player;
  const ignore = isPlayer && shooter.vehicle ? shooter.vehicle : shooter;
  const pellets = w.pellets || 1;
  let last = null;
  for (let k = 0; k < pellets; k++) {
    const sp = w.spread + aimSpread;
    let sx = dx + (Math.random() - 0.5) * 2 * sp, sy = dy + (Math.random() - 0.5) * 2 * sp, sz = dz + (Math.random() - 0.5) * 2 * sp;
    const len = Math.hypot(sx, sy, sz); sx /= len; sy /= len; sz /= len;
    const hit = hitscan(ox, oy, oz, sx, sy, sz, w.range, ignore);
    last = hit;
    if (k < 4) spawnTracer(ox, oy, oz, hit.x, hit.y, hit.z, isPlayer ? 0xfff0a0 : 0xffc890);
    if (w.explosive) {
      spawnExplosion(hit.x, Math.max(0, hit.y), hit.z, 1);
      applyBlast(hit.x, hit.y, hit.z, w.explosive, w.damage, shooter);
      playSound('explosion', hit.x, hit.z);
      continue;
    }
    if (hit.npc) {
      // a vehicle's own passengers are not hit by its driver
      hit.npc.takeDamage(w.damage * (hit.headshot ? 2.5 : 1), shooter, { headshot: hit.headshot });
      spawnBlood(hit.x, hit.y, hit.z);
    } else if (hit.player) {
      hit.player.takeDamage(w.damage * 0.5, shooter);
      spawnBlood(hit.x, hit.y, hit.z, 4);
    } else if (hit.vehicle) {
      const v = hit.vehicle;
      v.damage(w.damage * 0.45, isPlayer ? 'player' : shooter);
      spawnSparks(hit.x, hit.y, hit.z, 4);
      if (v.driver === 'player' && Math.random() < 0.3) game.player.takeDamage(w.damage * 0.35, shooter);
      else if (v.driver && v.driver !== 'player' && isPlayer) emitEvent('vehicleShot', { vehicle: v, shooter });
    } else if (hit.dist < w.range) {
      if (hit.y < 0.1) spawnDust(hit.x, 0.1, hit.z, 2); else spawnSparks(hit.x, hit.y, hit.z, 3, 1, 0.9, 0.7);
    }
  }
  spawnMuzzleFlash(ox, oy, oz, dx, dy, dz);
  playSound(w.sound, ox, oz);
  emitEvent('gunfire', { shooter, x: ox, z: oz, weapon: weaponId });
  return last;
}

/** A punch: hurts the nearest person within reach in front of the attacker. Returns who was hit. */
export function meleeAttack(attacker, heading, range = WEAPONS.fists.range, damage = WEAPONS.fists.damage) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  let best = null, bestD = range;
  const consider = (who) => {
    if (who === attacker || who.dead || who.inVehicle || who.vehicle) return;
    const dx = who.pos.x - attacker.pos.x, dz = who.pos.z - attacker.pos.z, d = Math.hypot(dx, dz);
    if (d < bestD && (dx * fx + dz * fz) / (d || 1) > 0.35) { best = who; bestD = d; }
  };
  for (const n of game.npcs) consider(n);
  if (attacker !== game.player && game.player) consider(game.player);
  if (best) {
    best.takeDamage(damage, attacker, { knock: { x: fx * 2.5, z: fz * 2.5 }, melee: true });
    playSound('punch', attacker.pos.x, attacker.pos.z);
    spawnDust(best.pos.x, 1.3, best.pos.z, 1);
  } else playSound('swing', attacker.pos.x, attacker.pos.z);
  return best;
}

onEvent('vehicleDestroyed', ({ vehicle, by }) => {
  applyBlast(vehicle.pos.x, 0.5, vehicle.pos.z, 8.5, 130, by === 'player' ? game.player : by && by.takeDamage ? by : null, vehicle);
  playSound('explosion', vehicle.pos.x, vehicle.pos.z);
});
