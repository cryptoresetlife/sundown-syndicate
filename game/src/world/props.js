// Scenery that makes the island feel like a holiday postcard: palm trees, Flamingo Park, the beach
// with its umbrellas and lifeguard towers, the pier and its big wheel, cranes and a freighter at the docks.
import * as THREE from '../../vendor/three.module.min.js';
import { MeshBatch } from '../core/meshbatch.js';
import { addBoxCollider } from '../core/collision.js';
import { GRID, BLOCK, ROAD_HALF, CITY, ISLAND, PIER, SEA_LEVEL, districtOfBlock, parcelOf, isLandmarkParcel } from './layout.js';

const TRUNK = 0x9c7a52, LEAF_A = 0x2f9e44, LEAF_B = 0x47b85a, LEAF_C = 0x1f7f3a;
let wheel = null;
const gondolas = [];
const boats = [];

export function addPalmTree(solid, leaves, x, z, rnd, collide = true) {
  const h = rnd.range(7, 11), lean = rnd.range(0, 1.6), la = rnd.range(0, Math.PI * 2);
  const steps = 5;
  let px = x, pz = z, py = 0;
  solid.at(0, 0, 0, 0);
  for (let s = 0; s < steps; s++) {
    const t = (s + 1) / steps;
    const nx = x + Math.cos(la) * lean * t * t, nz = z + Math.sin(la) * lean * t * t, ny = h * t;
    solid.cylinder(px, py, pz, 0.32 - s * 0.035, ny, 0.32 - (s + 1) * 0.035, 6, s % 2 ? TRUNK : 0x8a6a45, nx, nz);
    px = nx; pz = nz; py = ny;
  }
  const fronds = 9;
  leaves.at(0, 0, 0, 0);
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rnd.range(-0.2, 0.2);
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const len = rnd.range(3.2, 4.4), droop = rnd.range(0.6, 1.8);
    const mx = px + dx * len * 0.5, mz = pz + dz * len * 0.5, my = py + 0.7;
    const ex = px + dx * len, ez = pz + dz * len, ey = py - droop;
    const color = f % 3 === 0 ? LEAF_A : f % 3 === 1 ? LEAF_B : LEAF_C;
    leaves.quad([px - sx * 0.25, py, pz - sz * 0.25], [px + sx * 0.25, py, pz + sz * 0.25], [mx + sx * 0.7, my, mz + sz * 0.7], [mx - sx * 0.7, my, mz - sz * 0.7], color);
    leaves.quad([mx - sx * 0.7, my, mz - sz * 0.7], [mx + sx * 0.7, my, mz + sz * 0.7], [ex + sx * 0.12, ey, ez + sz * 0.12], [ex - sx * 0.12, ey, ez - sz * 0.12], color);
  }
  solid.box(px, py - 0.5, pz, 0.6, 0.5, 0.6, 0x6b4a2a);
  if (collide) addBoxCollider(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 5);
}

function addRoundTree(solid, x, z, rnd) {
  const h = rnd.range(3, 4.5), r = rnd.range(2.2, 3.4);
  const green = rnd.pick([0x2e8b3c, 0x3fa04a, 0x278a45, 0x58a83a]);
  solid.at(0, 0, 0, 0);
  solid.cylinder(x, 0, z, 0.35, h, 0.25, 6, 0x6b4a2a);
  solid.cylinder(x, h - 0.4, z, r * 0.75, h + r * 0.7, r, 8, green);
  solid.cylinder(x, h + r * 0.7, z, r, h + r * 1.6, r * 0.55, 8, green, x, z, green);
  solid.cylinder(x, h + r * 1.6, z, r * 0.55, h + r * 2.0, 0.02, 8, green);
  addBoxCollider(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 4);
}

/** A flamingo standing on one leg: the park's giant statue, and the small golden collectibles. */
export function addFlamingo(batch, x, y, z, s, color, rot = 0) {
  batch.at(x, y, z, rot);
  batch.cylinder(0, 0, 0, 0.05 * s, 1.1 * s, 0.04 * s, 5, color);
  batch.cylinder(0, 1.1 * s, 0, 0.3 * s, 1.35 * s, 0.42 * s, 7, color);
  batch.cylinder(0, 1.35 * s, 0, 0.42 * s, 1.75 * s, 0.2 * s, 7, color);
  batch.cylinder(0, 1.6 * s, 0.3 * s, 0.09 * s, 2.2 * s, 0.07 * s, 5, color, 0, 0.55 * s);
  batch.cylinder(0, 2.2 * s, 0.55 * s, 0.07 * s, 2.55 * s, 0.07 * s, 5, color, 0, 0.42 * s);
  batch.box(0, 2.5 * s, 0.5 * s, 0.2 * s, 0.2 * s, 0.3 * s, color);
  batch.box(0, 2.46 * s, 0.72 * s, 0.1 * s, 0.1 * s, 0.22 * s, 0x1a1a1a);
  batch.at(0, 0, 0, 0);
}

/** Plants and places everything; returns the per-frame animator for the wheel and the boats. */
export function buildProps(scene, rnd) {
  const solid = new MeshBatch();
  const leaves = new MeshBatch();

  // palms along the seafront drive, the central boulevard and the south shore
  for (let z = 14; z < CITY - 10; z += 16) {
    if (Math.abs(z - Math.round(z / BLOCK) * BLOCK) < 13) continue;
    addPalmTree(solid, leaves, CITY + ROAD_HALF + 1.1, z, rnd);
    addPalmTree(solid, leaves, CITY - ROAD_HALF - 1.1, z + 8, rnd);
    addPalmTree(solid, leaves, 5 * BLOCK + ROAD_HALF + 1.1, z + 4, rnd);
    addPalmTree(solid, leaves, 5 * BLOCK - ROAD_HALF - 1.1, z - 4, rnd);
  }
  for (let x = 14; x < CITY - 10; x += 20) {
    if (Math.abs(x - Math.round(x / BLOCK) * BLOCK) < 13) continue;
    addPalmTree(solid, leaves, x, CITY + ROAD_HALF + 1.1, rnd);
    addPalmTree(solid, leaves, x + 6, 6 * BLOCK + ROAD_HALF + 1.1, rnd);
  }

  // Sunset Beach: boardwalk, palms, umbrellas, towels, lifeguard towers
  const bx0 = CITY + ROAD_HALF + 3;
  solid.at(0, 0, 0, 0).plane(bx0, -20, bx0 + 7, CITY + 30, 0.12, 0xb98a5a, 2);
  for (let z = -16; z < CITY + 30; z += 6) solid.plane(bx0, z, bx0 + 7, z + 0.12, 0.13, 0x8f6a44);
  const umbrellaColors = [0xff5a5a, 0xffd23f, 0x35c8e8, 0xff8ad0, 0x7be07b, 0xffffff, 0xff8a2b];
  for (let n = 0; n < 230; n++) {
    const x = rnd.range(bx0 + 12, ISLAND.x1 - 40), z = rnd.range(-10, CITY + 20);
    if (z > PIER.z0 - 6 && z < PIER.z1 + 6) continue;
    if (n % 5 === 0) { addPalmTree(solid, leaves, x, z, rnd); continue; }
    const c = rnd.pick(umbrellaColors);
    solid.at(0, 0, 0, 0);
    solid.cylinder(x, 0, z, 0.05, 2.3, 0.05, 4, 0xe8e8e8);
    solid.cylinder(x, 2.1, z, 1.7, 2.75, 0.05, 8, c);
    solid.at(x, 0, z, rnd.range(0, 3));
    solid.box(1.4, 0.1, 0.4, 0.9, 0.04, 2, rnd.pick(umbrellaColors));
    solid.box(-1.3, 0.1, -0.3, 0.9, 0.04, 2, rnd.pick(umbrellaColors));
  }
  for (const z of [120, 300, 520, 700]) {
    const x = ISLAND.x1 - 52;
    solid.at(x, 0, z, 0);
    for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) solid.cylinder(px, 0, pz, 0.1, 2.4, 0.1, 4, 0xf0f0f0);
    solid.box(0, 2.4, 0, 3.2, 0.2, 3.2, 0xf0f0f0);
    solid.box(0, 2.6, 0, 2.6, 2.0, 2.6, n4(z));
    solid.frustum(-1.7, 1.7, -1.7, 1.7, 4.6, -1.3, 1.3, -0.2, 0.2, 5.3, 0xffffff);
    solid.at(0, 0, 0, 0);
    addBoxCollider(x - 1.4, z - 1.4, x + 1.4, z + 1.4, 5);
  }

  // the pier and the Marisol Wheel
  const D = PIER.deck;
  solid.at(0, 0, 0, 0);
  solid.box((PIER.x0 + PIER.x1) / 2, D - 0.4, (PIER.z0 + PIER.z1) / 2, PIER.x1 - PIER.x0, 0.4, PIER.z1 - PIER.z0, 0xa87c50);
  solid.box((PIER.headX0 + PIER.x1) / 2, D - 0.4, (PIER.headZ0 + PIER.headZ1) / 2, PIER.x1 - PIER.headX0, 0.4, PIER.headZ1 - PIER.headZ0, 0xa87c50);
  for (let x = PIER.x0 + 4; x < PIER.x1; x += 2.4) solid.plane(x, PIER.z0, x + 0.1, PIER.z1, D + 0.01, 0x7d5a38);
  for (let x = ISLAND.x1 - 30; x < PIER.x1; x += 12) for (const z of [PIER.z0 + 1, PIER.z1 - 1]) solid.cylinder(x, -4, z, 0.4, D - 0.4, 0.4, 6, 0x5d4630);
  for (let x = PIER.x0 + 6; x < PIER.headX0; x += 12) for (const z of [PIER.z0 + 0.4, PIER.z1 - 0.4]) {
    solid.cylinder(x, D, z, 0.07, D + 3.6, 0.07, 4, 0x2f3338);
    solid.box(x, D + 3.6, z, 0.4, 0.3, 0.4, 0xfff3c4);
  }
  // pier-head stalls
  const stallColors = [0xff5a8a, 0x35c8e8, 0xffd23f];
  [[PIER.headX0 + 8, PIER.headZ0 + 5], [PIER.headX0 + 22, PIER.headZ0 + 5], [PIER.headX0 + 8, PIER.headZ1 - 5]].forEach(([x, z], k) => {
    solid.box(x, D, z, 8, 3, 5, 0xf5efe2);
    solid.frustum(x - 4.6, x + 4.6, z - 3.1, z + 3.1, D + 3, x - 4, x + 4, z - 0.3, z + 0.3, D + 4.4, stallColors[k]);
    addBoxCollider(x - 4, z - 2.5, x + 4, z + 2.5, 5);
  });
  const wheelX = PIER.x1 - 22, wheelZ = 400, wheelR = 21, hubY = D + wheelR + 4;
  for (const dx of [-3, 3]) {
    solid.cylinder(wheelX + dx, D, wheelZ - 9, 0.5, hubY, 0.3, 6, 0xf0f4f8, wheelX + dx, wheelZ);
    solid.cylinder(wheelX + dx, D, wheelZ + 9, 0.5, hubY, 0.3, 6, 0xf0f4f8, wheelX + dx, wheelZ);
  }
  addBoxCollider(wheelX - 3.6, wheelZ - 10, wheelX + 3.6, wheelZ + 10, 3);
  wheel = new THREE.Group();
  wheel.position.set(wheelX, hubY, wheelZ);
  wheel.rotation.y = Math.PI / 2; // face the beach
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.5 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.5, emissive: 0xff2a8a, emissiveIntensity: 0.25 });
  for (const dz of [-2.4, 2.4]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.28, 6, 40), pink);
    rim.position.z = dz; wheel.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(wheelR * 0.55, 0.16, 5, 30), white);
    inner.position.z = dz; wheel.add(inner);
  }
  const spokeGeo = new THREE.CylinderGeometry(0.1, 0.1, wheelR * 2, 4);
  const gondolaGeo = new THREE.BoxGeometry(2.2, 2.4, 2.6);
  const gondolaColors = [0xff5a5a, 0xffd23f, 0x35c8e8, 0x7be07b, 0xff8ad0, 0xff8a2b];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    if (k < 6) for (const dz of [-2.4, 2.4]) {
      const spoke = new THREE.Mesh(spokeGeo, white);
      spoke.rotation.z = a; spoke.position.z = dz; wheel.add(spoke);
    }
    const g = new THREE.Mesh(gondolaGeo, new THREE.MeshStandardMaterial({ color: gondolaColors[k % 6], roughness: 0.6 }));
    g.position.set(Math.cos(a) * wheelR, Math.sin(a) * wheelR - 1.6, 0);
    g.castShadow = true;
    wheel.add(g); gondolas.push({ mesh: g, angle: a, r: wheelR });
  }
  scene.add(wheel);

  // Flamingo Park: lawns, paths, a pond, trees and the big pink bird
  const pk = { x0: 2 * BLOCK + ROAD_HALF + 3, z0: 4 * BLOCK + ROAD_HALF + 3, x1: 4 * BLOCK - ROAD_HALF - 3, z1: 6 * BLOCK - ROAD_HALF - 3 };
  const pcx = (pk.x0 + pk.x1) / 2, pcz = (pk.z0 + pk.z1) / 2;
  solid.at(0, 0, 0, 0);
  solid.plane(pk.x0, pcz - 2.5, pk.x1, pcz + 2.5, 0.19, 0xe2d6b8);
  solid.plane(pcx - 2.5, pk.z0, pcx + 2.5, pk.z1, 0.19, 0xe2d6b8);
  solid.cylinder(pcx, 0.17, pcz, 11, 0.2, 11, 20, 0xe2d6b8);
  solid.cylinder(pcx, 0.17, pcz, 3.2, 0.9, 3.2, 12, 0xd9d2c4);
  addFlamingo(solid, pcx, 0.9, pcz, 3.2, 0xff5fa8, 0.6);
  addBoxCollider(pcx - 3, pcz - 3, pcx + 3, pcz + 3, 9);
  solid.cylinder(pk.x0 + 38, 0.17, pk.z1 - 36, 20, 0.22, 20, 24, 0x2fa8d8); // the pond
  solid.cylinder(pk.x0 + 38, 0.15, pk.z1 - 36, 21.5, 0.2, 21.5, 24, 0xcdbd95);
  for (let n = 0; n < 60; n++) {
    const x = rnd.range(pk.x0 + 4, pk.x1 - 4), z = rnd.range(pk.z0 + 4, pk.z1 - 4);
    if (Math.abs(x - pcx) < 6 || Math.abs(z - pcz) < 6) continue;
    if (Math.hypot(x - pcx, z - pcz) < 14 || Math.hypot(x - pk.x0 - 38, z - pk.z1 + 36) < 24) continue;
    if (n % 4 === 0) addPalmTree(solid, leaves, x, z, rnd); else addRoundTree(solid, x, z, rnd);
  }
  for (const [x, z, r] of [[pcx - 9, pcz - 6, 0], [pcx + 9, pcz + 6, 0], [pcx + 6, pcz - 9, 1.57], [pcx - 6, pcz + 9, 1.57]]) {
    solid.at(x, 0.17, z, r).box(0, 0.35, 0, 2.2, 0.12, 0.6, 0x8a5a34).box(0, 0.47, -0.27, 2.2, 0.5, 0.08, 0x8a5a34).box(-0.9, 0, 0, 0.1, 0.35, 0.5, 0x333).box(0.9, 0, 0, 0.1, 0.35, 0.5, 0x333);
  }
  solid.at(0, 0, 0, 0);

  // Palm Heights gardens and a few street trees elsewhere
  for (let bx = 0; bx < GRID - 1; bx++) for (let bz = 0; bz < GRID - 1; bz++) {
    const d = districtOfBlock(bx, bz);
    if (d !== 'heights') continue;
    for (let q = 0; q < 4; q++) {
      if (isLandmarkParcel(bx, bz, q)) continue;
      const p = parcelOf(bx, bz, q);
      const z = q < 2 ? p.z0 + 2 : p.z1 - 2;
      addPalmTree(solid, leaves, p.x0 + 13 + rnd.range(-1, 1), z, rnd);
      if (rnd.chance(0.6)) addRoundTree(solid, p.x1 - 2.5, q < 2 ? p.z1 - 4 : p.z0 + 4, rnd);
    }
  }

  // Dockyards: gantry cranes on the quay and a freighter lying offshore
  for (const z of [520, 610, 700]) {
    const x = -34;
    solid.at(x, 0, z, 0);
    for (const [px, pz] of [[-5, -6], [5, -6], [-5, 6], [5, 6]]) solid.box(px, 0, pz, 0.9, 26, 0.9, 0xe8a020);
    solid.box(0, 26, 0, 12, 1.4, 14, 0xe8a020);
    solid.box(-16, 27.4, 0, 46, 1.6, 2.2, 0xd03a2a);
    solid.box(-2, 27.4, 0, 4, 3.2, 4, 0xf0f0f0);
    solid.box(-26, 14, 0, 0.3, 13.4, 0.3, 0x333333);
    solid.box(-26, 11.4, 0, 6, 2.6, 2.5, 0x2e86c1);
    solid.at(0, 0, 0, 0);
    for (const [px, pz] of [[-5, -6], [5, -6], [-5, 6], [5, 6]]) addBoxCollider(x + px - 0.5, z + pz - 0.5, x + px + 0.5, z + pz + 0.5, 26);
  }
  const shipX = -118, shipZ = 610;
  solid.at(shipX, SEA_LEVEL - 1, shipZ, 0);
  solid.frustum(-11, 11, -70, 62, 0, -14, 14, -76, 76, 9, 0x8a2a22, 0x4a4e55);
  solid.box(0, 9, -58, 22, 12, 14, 0xf2f2f2);
  solid.box(0, 21, -58, 26, 2.4, 9, 0xf2f2f2);
  solid.cylinder(0, 23, -62, 2.2, 31, 1.9, 8, 0xd03a2a);
  const cc = [0xc0392b, 0x2e86c1, 0x27ae60, 0xe67e22, 0xf1c40f, 0x16a085];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) {
    const stack = rnd.int(1, 3);
    for (let s = 0; s < stack; s++) solid.box(-9 + c * 6, 9 + s * 2.6, -40 + r * 13.5, 5.6, 2.55, 12.4, rnd.pick(cc));
  }
  solid.at(0, 0, 0, 0);

  scene.add(solid.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  const leafMesh = leaves.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  scene.add(leafMesh);

  // little boats riding at anchor off the beach
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  for (let n = 0; n < 9; n++) {
    const b = new MeshBatch();
    const sail = n % 2 === 0;
    b.frustum(-1.1, 1.1, -3.6, 3.2, 0, -1.6, 1.6, -4, 4.6, 1.2, 0xf8f8f8, 0xd9c8a8);
    b.box(0, 1.2, -0.8, 2, 1, 2.6, rnd.pick([0x2e86c1, 0xff5a5a, 0xf8f8f8, 0xffd23f]));
    if (sail) {
      b.cylinder(0, 1.2, 0.8, 0.07, 9, 0.05, 4, 0xdddddd);
      b.quad([0, 2, 0.9], [0, 2, 4.4], [0, 8.6, 0.9], [0, 2, 0.9], 0xffffff);
      b.quad([0, 2, 0.9], [0, 8.6, 0.9], [0, 2, 4.4], [0, 2, 0.9], 0xffffff);
    }
    const m = b.mesh(hullMat);
    const x = ISLAND.x1 + rnd.range(30, 150), z = n < 5 ? rnd.range(20, 360) : rnd.range(440, 800);
    m.position.set(x, SEA_LEVEL - 0.3, z);
    m.rotation.y = rnd.range(0, 6.28);
    scene.add(m);
    boats.push({ mesh: m, phase: rnd.range(0, 6), y: SEA_LEVEL - 0.3 });
  }

  return function animateProps(dt, time) {
    wheel.rotation.z += dt * 0.12;
    for (const g of gondolas) g.mesh.rotation.z = -wheel.rotation.z;
    for (const b of boats) {
      b.mesh.position.y = b.y + Math.sin(time * 1.1 + b.phase) * 0.14;
      b.mesh.rotation.z = Math.sin(time * 0.8 + b.phase) * 0.05;
    }
  };
}

function n4(z) {
  return [0xff5a5a, 0xffd23f, 0x35c8e8, 0xff8ad0][Math.floor(z / 100) % 4];
}
