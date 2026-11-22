// The road network of Marisol Bay: which intersections and road segments exist, lane geometry for
// traffic, route finding for police, the traffic-light cycle, and the painted road markings.
import './buildings.js'; // load order: roads, then the buildings between them
import * as THREE from '../../vendor/three.module.min.js';
import { MeshBatch } from '../core/meshbatch.js';
import { GRID, BLOCK, ROAD_HALF, CITY, LANE } from './layout.js';

export { buildRoads, updateTrafficLights, lightState, findRoute, randomLanePoint, lanePoint };

const LIGHT_PERIOD = 18;
let lightClock = 0;
let bulbMesh = null;
const bulbSlots = []; // { index, i, j, axis, lamp: 0 red | 1 yellow | 2 green }
export const lampPosts = []; // street lamp heads, for the night glow

export function nodeExists(i, j) {
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) return false;
  return !(i === 3 && j === 5); // the middle of Flamingo Park has no crossing
}

/** True when a road runs from intersection (i, j) one step in direction (di, dj). */
export function roadBetween(i, j, di, dj) {
  const ni = i + di, nj = j + dj;
  if (!nodeExists(i, j) || !nodeExists(ni, nj)) return false;
  return true;
}

export function nodePos(i, j) {
  return { x: i * BLOCK, z: j * BLOCK };
}

export function nearestNode(x, z) {
  let i = Math.max(0, Math.min(GRID - 1, Math.round(x / BLOCK)));
  let j = Math.max(0, Math.min(GRID - 1, Math.round(z / BLOCK)));
  if (!nodeExists(i, j)) { if (x > i * BLOCK) i++; else i--; }
  return { i, j };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function exitsOf(i, j) {
  const out = [];
  for (const [di, dj] of DIRS) if (roadBetween(i, j, di, dj)) out.push({ di, dj });
  return out;
}

/** Breadth-first route over intersections; returns [{i, j}, ...] from start to goal inclusive. */
function findRoute(from, to) {
  const key = (n) => n.i * 100 + n.j;
  const prev = new Map([[key(from), null]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift();
    if (n.i === to.i && n.j === to.j) break;
    for (const e of exitsOf(n.i, n.j)) {
      const m = { i: n.i + e.di, j: n.j + e.dj };
      if (!prev.has(key(m))) { prev.set(key(m), n); queue.push(m); }
    }
  }
  const path = [];
  let cur = prev.has(key(to)) ? to : null;
  while (cur) { path.unshift(cur); cur = prev.get(key(cur)); }
  return path;
}

/** Colour of the light facing traffic that travels along axis 'ns' or 'ew' into intersection (i, j). */
function lightState(i, j, axis) {
  if (exitsOf(i, j).length < 3) return 'green';
  let t = (lightClock + ((i * 3 + j * 5) % 4) * 4.5) % LIGHT_PERIOD;
  if (axis === 'ew') t = (t + LIGHT_PERIOD / 2) % LIGHT_PERIOD;
  if (t < 6.5) return 'green';
  if (t < 8.2) return 'yellow';
  return 'red';
}

const BULB_ON = [new THREE.Color(0xff2a1a), new THREE.Color(0xffc21a), new THREE.Color(0x2bff5a)];
const BULB_OFF = [new THREE.Color(0x3a0a06), new THREE.Color(0x3a2c06), new THREE.Color(0x063a12)];
const STATE_LAMP = { red: 0, yellow: 1, green: 2 };

function updateTrafficLights(dt) {
  const before = Math.floor(lightClock * 4);
  lightClock += dt;
  if (!bulbMesh || Math.floor(lightClock * 4) === before) return;
  for (const s of bulbSlots) {
    const on = STATE_LAMP[lightState(s.i, s.j, s.axis)] === s.lamp;
    bulbMesh.setColorAt(s.index, on ? BULB_ON[s.lamp] : BULB_OFF[s.lamp]);
  }
  bulbMesh.instanceColor.needsUpdate = true;
}

/** A random point in a driving lane: { x, z, heading, i, j, di, dj } heading from node (i,j) toward (i+di,j+dj). */
function randomLanePoint(rnd, nearX, nearZ, minDist, maxDist) {
  for (let tries = 0; tries < 30; tries++) {
    const i = rnd.int(0, GRID - 1), j = rnd.int(0, GRID - 1);
    const exits = exitsOf(i, j);
    if (!exits.length) continue;
    const e = rnd.pick(exits);
    const t = rnd.range(0.25, 0.75);
    const lane = rnd.chance(0.5) ? 0 : 1;
    const p = lanePoint(i, j, e.di, e.dj, t * BLOCK, lane);
    const d = Math.hypot(p.x - nearX, p.z - nearZ);
    if (d < minDist || d > maxDist) continue;
    return { ...p, heading: Math.atan2(e.di, e.dj), i, j, di: e.di, dj: e.dj, lane };
  }
  return null;
}

/** The point `along` metres down the lane from node (i,j) toward (i+di,j+dj); lane 0 is inner, 1 is kerbside. */
function lanePoint(i, j, di, dj, along, lane = 0) {
  const off = LANE * (lane + 0.5);
  return { x: i * BLOCK + di * along - dj * off, z: j * BLOCK + dj * along + di * off };
}

const WHITE = 0xf4f4f0, YELLOW = 0xf2c230, POLE = 0x4a4f55;

/** Paints lane lines, stop lines and zebra crossings, and stands up the traffic lights and street lamps. */
function buildRoads(scene) {
  const marks = new MeshBatch();
  const poles = new MeshBatch();
  const Y = 0.035;
  const stripe = (x0, z0, x1, z1, color) => marks.plane(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), Y, color);
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      if (!roadBetween(i, j, di, dj)) continue;
      const ax = i * BLOCK, az = j * BLOCK;
      const start = ROAD_HALF + 5, end = BLOCK - ROAD_HALF - 5;
      // along(a) and across(c) to world
      const P = (a, c) => [ax + di * a - dj * c, az + dj * a + di * c];
      const line = (a0, a1, c0, c1, color) => { const p = P(a0, c0), q = P(a1, c1); stripe(p[0], p[1], q[0], q[1], color); };
      line(start, end, -0.32, -0.12, YELLOW);
      line(start, end, 0.12, 0.32, YELLOW);
      for (let a = start + 1; a < end - 3; a += 7.5) {
        line(a, a + 3, -LANE - 0.07, -LANE + 0.07, WHITE);
        line(a, a + 3, LANE - 0.07, LANE + 0.07, WHITE);
      }
      line(start - 0.6, start, -ROAD_HALF + 0.3, -0.3, WHITE); // stop lines, right-hand traffic
      line(end, end + 0.6, 0.3, ROAD_HALF - 0.3, WHITE);
      for (let c = -ROAD_HALF + 0.7; c < ROAD_HALF - 0.6; c += 1.3) { // zebra crossings at both ends
        line(ROAD_HALF + 0.8, ROAD_HALF + 3.8, c, c + 0.65, WHITE);
        line(BLOCK - ROAD_HALF - 3.8, BLOCK - ROAD_HALF - 0.8, c, c + 0.65, WHITE);
      }
      // street lamps down both kerbs
      for (let a = 22; a < BLOCK - 14; a += 24) {
        for (const side of [-1, 1]) {
          const [lx, lz] = P(a + (side > 0 ? 6 : 0), side * (ROAD_HALF + 0.7));
          const [hx, hz] = P(a + (side > 0 ? 6 : 0), side * (ROAD_HALF - 1.6));
          poles.at(0, 0, 0, 0);
          poles.cylinder(lx, 0, lz, 0.13, 7.2, 0.09, 5, POLE);
          poles.box((lx + hx) / 2, 7.1, (lz + hz) / 2, Math.abs(hx - lx) + 0.16, 0.12, Math.abs(hz - lz) + 0.16, POLE);
          poles.box(hx, 6.92, hz, 0.5, 0.16, 0.5, 0xfff3c4);
          lampPosts.push(hx, 6.85, hz);
        }
      }
    }
  }
  // traffic lights: one mast per approach, its head hanging over the incoming lanes
  const heads = [];
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const exits = exitsOf(i, j);
    if (exits.length < 3) continue;
    for (const e of exits) {
      // traffic arriving from this exit travels in direction (-di, -dj)
      const tx = -e.di, tz = -e.dj, rx = -tz, rz = tx;
      const bx = i * BLOCK - tx * (ROAD_HALF + 1.2), bz = j * BLOCK - tz * (ROAD_HALF + 1.2);
      const px = bx + rx * (ROAD_HALF + 0.9), pz = bz + rz * (ROAD_HALF + 0.9);
      const hx = bx + rx * LANE, hz = bz + rz * LANE;
      poles.at(0, 0, 0, 0);
      poles.cylinder(px, 0, pz, 0.16, 6.3, 0.11, 6, POLE);
      poles.box((px + hx) / 2, 6.1, (pz + hz) / 2, Math.abs(hx - px) + 0.14, 0.14, Math.abs(hz - pz) + 0.14, POLE);
      poles.box(hx, 5.0, hz, tx ? 0.34 : 0.5, 1.25, tx ? 0.5 : 0.34, 0x16181b);
      heads.push({ i, j, axis: e.di ? 'ew' : 'ns', x: hx - tx * 0.2, z: hz - tz * 0.2 });
    }
  }
  const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const markMesh = marks.mesh(roadMat, false);
  scene.add(markMesh);
  scene.add(poles.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })));

  bulbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ toneMapped: false }), heads.length * 3);
  const m = new THREE.Matrix4();
  heads.forEach((h, n) => {
    for (let lamp = 0; lamp < 3; lamp++) {
      const index = n * 3 + lamp;
      m.makeTranslation(h.x, 5.98 - lamp * 0.37, h.z);
      bulbMesh.setMatrixAt(index, m);
      bulbMesh.setColorAt(index, BULB_OFF[lamp]);
      bulbSlots.push({ index, i: h.i, j: h.j, axis: h.axis, lamp });
    }
  });
  bulbMesh.frustumCulled = false;
  scene.add(bulbMesh);
  updateTrafficLights(0.3);
  return { CITY };
}
