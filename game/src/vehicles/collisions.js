// Collisions between moving things: car against car (momentum, damage, sparks) and people against
// parked or passing cars. Cars against buildings are handled by each Vehicle itself.
import { game, emitEvent } from '../core/state.js';
import { spawnSparks } from '../fx/effects.js';

/** Car-against-car: three bumper circles each, pushed apart by mass, trading momentum and damage. */
export function collideVehicles() {
  const list = game.vehicles;
  const a3 = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }], b3 = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, reachSum = a.radius + b.radius;
      if (dx * dx + dz * dz > reachSum * reachSum) continue;
      const ra = a.type.wid / 2, rb = b.type.wid / 2, la = a.type.len / 2 - ra, lb = b.type.len / 2 - rb;
      a.localToWorld(0, la, a3[0]); a.localToWorld(0, 0, a3[1]); a.localToWorld(0, -la, a3[2]);
      b.localToWorld(0, lb, b3[0]); b.localToWorld(0, 0, b3[1]); b.localToWorld(0, -lb, b3[2]);
      let best = 0, bnx = 0, bnz = 0;
      for (const p of a3) for (const q of b3) {
        const ex = q.x - p.x, ez = q.z - p.z, d = Math.hypot(ex, ez), pen = ra + rb - d;
        if (pen > best && d > 1e-4) { best = pen; bnx = ex / d; bnz = ez / d; }
      }
      if (best <= 0) continue;
      const ma = a.destroyed ? a.type.mass * 2 : a.type.mass, mb = b.destroyed ? b.type.mass * 2 : b.type.mass, total = ma + mb;
      a.pos.x -= bnx * best * (mb / total); a.pos.z -= bnz * best * (mb / total);
      b.pos.x += bnx * best * (ma / total); b.pos.z += bnz * best * (ma / total);
      const rel = (b.vx - a.vx) * bnx + (b.vz - a.vz) * bnz;
      if (rel >= 0) continue;
      const jImp = (-(1 + 0.25) * rel) / (1 / ma + 1 / mb);
      a.vx -= (jImp / ma) * bnx; a.vz -= (jImp / ma) * bnz;
      b.vx += (jImp / mb) * bnx; b.vz += (jImp / mb) * bnz;
      const impact = -rel;
      if (impact > 3) {
        const dmg = (impact - 3) * 0.9;
        a.damage(dmg * (mb / total) * 2, b.driver); b.damage(dmg * (ma / total) * 2, a.driver);
        spawnSparks((a.pos.x + b.pos.x) / 2, 0.7, (a.pos.z + b.pos.z) / 2, 8);
        emitEvent('vehicleCollision', { a, b, impact });
      }
    }
  }
}

/** Keeps a person on foot from walking through cars; returns the vehicle they bumped, if any. */
export function pushOutOfVehicles(pos, radius, ignore = null) {
  let bumped = null;
  for (const v of game.vehicles) {
    if (v === ignore) continue;
    const dx = pos.x - v.pos.x, dz = pos.z - v.pos.z;
    if (dx * dx + dz * dz > (v.radius + radius) * (v.radius + radius)) continue;
    const l = v.worldToLocal(pos.x, pos.z, { x: 0, z: 0 });
    const hw = v.type.wid / 2 + radius, hl = v.type.len / 2 + radius;
    if (Math.abs(l.x) >= hw || Math.abs(l.z) >= hl) continue;
    const px = hw - Math.abs(l.x), pz = hl - Math.abs(l.z);
    if (px < pz) l.x = Math.sign(l.x || 1) * hw; else l.z = Math.sign(l.z || 1) * hl;
    const w = v.localToWorld(l.x, l.z, { x: 0, z: 0 });
    pos.x = w.x; pos.z = w.z;
    bumped = v;
  }
  return bumped;
}

/** The closest vehicle to a point that passes the filter, within maxDist. */
export function nearestVehicle(x, z, maxDist, filter = null) {
  let best = null, bestD = maxDist;
  for (const v of game.vehicles) {
    if (filter && !filter(v)) continue;
    const d = Math.hypot(v.pos.x - x, v.pos.z - z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
