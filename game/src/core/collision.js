// Static world collision: every building is an axis-aligned box with a height, kept in a grid.
// Circles (people, car bumpers) are pushed out of them; rays (bullets, camera, line of sight) stop at them.
import { ISLAND, PIER } from '../world/layout.js';

const CELL = 20;
const grid = new Map();
export const colliders = [];

function keyOf(cx, cz) {
  return (cx + 100) * 4096 + (cz + 100);
}

export function addBoxCollider(x0, z0, x1, z1, height = 200, y0 = 0) {
  const box = { x0, z0, x1, z1, y0, y1: y0 + height };
  colliders.push(box);
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = keyOf(cx, cz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(box);
    }
  }
  return box;
}

const hit = { nx: 0, nz: 0, depth: 0 };

/** Pushes the circle at pos (x, z) out of every box it overlaps; returns the last contact or null. */
export function collideCircle(pos, radius, y = 0.5) {
  let found = null;
  const cx0 = Math.floor((pos.x - radius) / CELL), cx1 = Math.floor((pos.x + radius) / CELL);
  const cz0 = Math.floor((pos.z - radius) / CELL), cz1 = Math.floor((pos.z + radius) / CELL);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const list = grid.get(keyOf(cx, cz));
    if (!list) continue;
    for (const b of list) {
      if (y > b.y1 || y < b.y0) continue;
      const px = Math.max(b.x0, Math.min(pos.x, b.x1)), pz = Math.max(b.z0, Math.min(pos.z, b.z1));
      let dx = pos.x - px, dz = pos.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        hit.depth = radius - d;
      } else {
        // centre is inside the box: leave by the nearest wall
        const left = pos.x - b.x0, right = b.x1 - pos.x, up = pos.z - b.z0, down = b.z1 - pos.z;
        const m = Math.min(left, right, up, down);
        dx = 0; dz = 0;
        if (m === left) dx = -1; else if (m === right) dx = 1; else if (m === up) dz = -1; else dz = 1;
        hit.depth = m + radius;
      }
      pos.x += dx * hit.depth; pos.z += dz * hit.depth;
      hit.nx = dx; hit.nz = dz;
      found = hit;
    }
  }
  return found;
}

/** Keeps a position on the island (the beach ends at the waterline) or on the pier. */
export function clampToIsland(pos, margin = 1) {
  const zones = [
    [ISLAND.x0 + margin, ISLAND.z0 + margin, ISLAND.x1 - margin, ISLAND.z1 - margin],
    [PIER.x0, PIER.z0 + 0.6, PIER.x1 - 0.8, PIER.z1 - 0.6],
    [PIER.headX0 + 0.6, PIER.headZ0 + 0.6, PIER.x1 - 0.8, PIER.headZ1 - 0.6],
  ];
  let bestX = pos.x, bestZ = pos.z, bestD = Infinity;
  for (const [x0, z0, x1, z1] of zones) {
    const cx = Math.max(x0, Math.min(pos.x, x1)), cz = Math.max(z0, Math.min(pos.z, z1));
    const d = Math.abs(cx - pos.x) + Math.abs(cz - pos.z);
    if (d < bestD) { bestD = d; bestX = cx; bestZ = cz; }
  }
  if (bestD < 1e-6) return false;
  pos.x = bestX; pos.z = bestZ;
  return true;
}

/** Distance along the ray to the first building (or the ground), or maxDist when nothing is hit. */
export function raycastWorld(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  if (dy < -1e-5) {
    const t = -oy / dy;
    if (t > 0 && t < best) best = t;
  }
  for (const b of colliders) {
    let t0 = 0, t1 = best;
    if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; }
    else {
      let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; }
    else {
      let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) continue;
    }
    if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) continue; }
    else {
      let a = (b.y0 - oy) / dy, c = (b.y1 - oy) / dy;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) continue;
    }
    if (t0 < best) best = t0;
  }
  return best;
}

/** True when a building stands between two points at eye height: no line of sight. */
export function sightBlocked(ax, az, bx, bz, y = 1.6) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return false;
  return raycastWorld(ax, y, az, dx / len, 0, dz / len, len) < len - 0.05;
}

export function pointInBuilding(x, z) {
  const list = grid.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return false;
  for (const b of list) if (b.y0 < 1 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  return false;
}
