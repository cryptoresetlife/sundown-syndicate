// Raises every building in Marisol Bay, district by district: glass towers downtown, pastel hotels on
// the Ocean Strip, bungalows in Palm Heights, warehouses at the Dockyards, and the named landmarks.
import * as THREE from '../../vendor/three.module.min.js';
import { MeshBatch } from '../core/meshbatch.js';
import { addBoxCollider } from '../core/collision.js';
import { GRID, districtOfBlock, lotOfBlock, parcelOf, isLandmarkParcel, VANCE_TOWER_BLOCK } from './layout.js';
import { makeFacadeTexture, makeSignAtlas, FACADE_TILE_W, FACADE_TILE_H, SIGN_COLS, SIGN_ROWS } from './textures.js';

const KINDS = ['glass', 'office', 'deco', 'stucco', 'warehouse', 'shopfront'];
const wallMaterials = {};
let signMaterial = null;
export const parkingSpots = []; // { x, z, heading } where parked cars may stand
export const rooftops = []; // { x, z, y } helipads and vantage points

const PASTELS = [0xffb3cf, 0x9ff0e0, 0xffd9a0, 0xa9d8ff, 0xfff0a6, 0xd8b8ff, 0xffffff, 0xffa48f];
const GLASS_TINTS = [0xffffff, 0xbfe9ff, 0x9fe8d8, 0xffd9a8, 0xd0d8ff, 0xa8c8e8];
const OFFICE_TINTS = [0xffffff, 0xf2e6d0, 0xe0e8f0, 0xf6dcc8, 0xd8e6dc];
const SOUTH_TINTS = [0xff9a56, 0x4fd0c0, 0xffd24f, 0xf06a7a, 0x7ab8ff, 0xb8e070, 0xffffff];
const DOCK_TINTS = [0xc8d0d8, 0x9fb8cc, 0xd8a890, 0xb8c0a8, 0xe0e0e0];
const ROOF_GREY = 0x8d9096;
const GENERIC_SIGNS = [1, 2, 3, 7, 8, 9, 10, 13, 14, 16, 17, 18, 20, 21, 22, 23, 24, 25, 27, 29];

/** Builds all buildings into a handful of merged meshes and registers their collision boxes. */
export function buildBuildings(scene, rnd) {
  const walls = {};
  for (const kind of KINDS) walls[kind] = new MeshBatch();
  const solid = new MeshBatch(); // roofs, parapets, rooftop clutter, houses' roofs
  const signs = new MeshBatch();
  const ctx = { walls, solid, signs, rnd };

  for (let bx = 0; bx < GRID - 1; bx++) for (let bz = 0; bz < GRID - 1; bz++) {
    const district = districtOfBlock(bx, bz);
    if (district === 'park') continue;
    if (bx === VANCE_TOWER_BLOCK[0] && bz === VANCE_TOWER_BLOCK[1]) { raiseVanceTower(ctx, lotOfBlock(bx, bz)); continue; }
    const fullLot = district === 'downtown' && rnd.chance(0.3) && ![0, 1, 2, 3].some((q) => isLandmarkParcel(bx, bz, q));
    if (fullLot) {
      const lot = lotOfBlock(bx, bz), inset = rnd.range(3, 9);
      raiseTower(ctx, lot.x0 + inset, lot.z0 + inset, lot.x1 - inset, lot.z1 - inset, rnd.range(80, 150), true);
      continue;
    }
    for (let q = 0; q < 4; q++) {
      const parcel = parcelOf(bx, bz, q);
      const landmark = isLandmarkParcel(bx, bz, q);
      if (landmark) raiseLandmark(ctx, landmark);
      else raiseParcel(ctx, district, parcel, bx, bz, q);
    }
  }

  for (const kind of KINDS) {
    const tex = makeFacadeTexture(kind, 3);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true,
      roughness: kind === 'glass' ? 0.22 : 0.8, metalness: kind === 'glass' ? 0.25 : 0.02,
    });
    wallMaterials[kind] = mat;
    if (walls[kind].count) scene.add(walls[kind].mesh(mat));
  }
  scene.add(solid.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
  signMaterial = new THREE.MeshBasicMaterial({ map: makeSignAtlas(), toneMapped: false, color: 0xd0d0d0 });
  scene.add(signs.mesh(signMaterial, false));
}

/** night: 0 at noon, 1 at midnight. Lights the windows and brightens the neon. */
export function setBuildingNight(night) {
  for (const kind of KINDS) if (wallMaterials[kind]) wallMaterials[kind].emissiveIntensity = night * (kind === 'shopfront' ? 1.5 : 1.15);
  if (signMaterial) signMaterial.color.setScalar(0.82 + night * 0.6);
}

function wallOpts(rnd, tileH = FACADE_TILE_H) {
  return { tileW: FACADE_TILE_W, tileH, uOffset: rnd.int(0, 7) / 8 * 3, top: false };
}

function addSign(signs, face, x0, z0, x1, z1, y, w, h, index) {
  const col = index % SIGN_COLS, row = Math.floor(index / SIGN_COLS);
  const uv = [col / SIGN_COLS + 0.004, 1 - (row + 1) / SIGN_ROWS + 0.004, (col + 1) / SIGN_COLS - 0.004, 1 - row / SIGN_ROWS - 0.004];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, e = 0.22;
  signs.at(0, 0, 0, 0);
  if (face === 's') signs.quad([cx - w / 2, y, z1 + e], [cx + w / 2, y, z1 + e], [cx + w / 2, y + h, z1 + e], [cx - w / 2, y + h, z1 + e], 0xffffff, uv);
  else if (face === 'n') signs.quad([cx + w / 2, y, z0 - e], [cx - w / 2, y, z0 - e], [cx - w / 2, y + h, z0 - e], [cx + w / 2, y + h, z0 - e], 0xffffff, uv);
  else if (face === 'e') signs.quad([x1 + e, y, cz + w / 2], [x1 + e, y, cz - w / 2], [x1 + e, y + h, cz - w / 2], [x1 + e, y + h, cz + w / 2], 0xffffff, uv);
  else signs.quad([x0 - e, y, cz - w / 2], [x0 - e, y, cz + w / 2], [x0 - e, y + h, cz + w / 2], [x0 - e, y + h, cz - w / 2], 0xffffff, uv);
}

function addRoof(ctx, x0, z0, x1, z1, y, clutter = true) {
  const { solid, rnd } = ctx;
  solid.at(0, 0, 0, 0);
  solid.plane(x0, z0, x1, z1, y, ROOF_GREY);
  const t = 0.35, ph = 0.8, rim = 0xdcd8d0;
  solid.box((x0 + x1) / 2, y, z0 + t / 2, x1 - x0, ph, t, rim);
  solid.box((x0 + x1) / 2, y, z1 - t / 2, x1 - x0, ph, t, rim);
  solid.box(x0 + t / 2, y, (z0 + z1) / 2, t, ph, z1 - z0, rim);
  solid.box(x1 - t / 2, y, (z0 + z1) / 2, t, ph, z1 - z0, rim);
  if (!clutter) return;
  const n = rnd.int(1, 3);
  for (let k = 0; k < n; k++) {
    const cx = rnd.range(x0 + 3, x1 - 3), cz = rnd.range(z0 + 3, z1 - 3);
    if (rnd.chance(0.25)) solid.cylinder(cx, y, cz, 1.3, y + 2.6, 1.3, 8, 0x9a7b5a, cx, cz, 0x7d6347);
    else solid.box(cx, y, cz, rnd.range(1.5, 3.5), rnd.range(0.9, 1.8), rnd.range(1.5, 3), 0xb9bdc2);
  }
}

/** One plain building: optional shop floor, facade above, roof, sign, collision box. */
function raiseBuilding(ctx, x0, z0, x1, z1, height, kind, tint, { shop = false, sign = -1, signFace = 's', signSize = 8 } = {}) {
  const { walls, rnd } = ctx;
  let base = 0;
  if (shop) {
    walls.shopfront.at(0, 0, 0, 0).frustum(x0, x1, z0, z1, 0, x0, x1, z0, z1, 4, tint, tint, { tileW: FACADE_TILE_W, tileH: 4, uOffset: rnd.int(0, 3) * 0.25, top: false });
    base = 4;
  }
  walls[kind].at(0, 0, 0, 0).frustum(x0, x1, z0, z1, base, x0, x1, z0, z1, height, tint, tint, wallOpts(rnd));
  addRoof(ctx, x0, z0, x1, z1, height);
  if (sign >= 0) addSign(ctx.signs, signFace, x0, z0, x1, z1, shop ? 4.1 : Math.min(height - 3.4, 5), signSize, signSize * 0.375, sign);
  addBoxCollider(x0, z0, x1, z1, height + 1);
}

/** A stepped tower: a broad base, a narrower shaft and a crown, with a mast on the tallest. */
function raiseTower(ctx, x0, z0, x1, z1, height, tall) {
  const { walls, solid, rnd } = ctx;
  const kind = rnd.chance(0.65) ? 'glass' : 'office';
  const tint = kind === 'glass' ? rnd.pick(GLASS_TINTS) : rnd.pick(OFFICE_TINTS);
  const opts = wallOpts(rnd);
  const h1 = height * rnd.range(0.5, 0.7), h2 = height * rnd.range(0.82, 0.92);
  const s1 = rnd.range(2, 4), s2 = s1 + rnd.range(2, 4);
  walls.shopfront.at(0, 0, 0, 0).frustum(x0, x1, z0, z1, 0, x0, x1, z0, z1, 4, 0xe8eef2, 0, { tileW: FACADE_TILE_W, tileH: 4, top: false });
  walls[kind].at(0, 0, 0, 0);
  walls[kind].frustum(x0, x1, z0, z1, 4, x0, x1, z0, z1, h1, tint, tint, opts);
  walls[kind].frustum(x0 + s1, x1 - s1, z0 + s1, z1 - s1, h1, x0 + s1, x1 - s1, z0 + s1, z1 - s1, h2, tint, tint, opts);
  walls[kind].frustum(x0 + s2, x1 - s2, z0 + s2, z1 - s2, h2, x0 + s2, x1 - s2, z0 + s2, z1 - s2, height, tint, tint, opts);
  addRoof(ctx, x0, z0, x1, z1, h1, false);
  addRoof(ctx, x0 + s1, z0 + s1, x1 - s1, z1 - s1, h2, false);
  addRoof(ctx, x0 + s2, z0 + s2, x1 - s2, z1 - s2, height, true);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (tall && rnd.chance(0.6)) solid.at(0, 0, 0, 0).cylinder(cx, height, cz, 0.5, height + rnd.range(12, 26), 0.08, 5, 0xd8dde2);
  else rooftops.push({ x: cx, z: cz, y: height });
  if (rnd.chance(0.5)) addSign(ctx.signs, rnd.pick(['n', 's', 'e', 'w']), x0, z0, x1, z1, 4.2, 9, 3.4, rnd.pick(GENERIC_SIGNS));
  addBoxCollider(x0, z0, x1, z1, height + 1);
}

/** Sterling Vance's black-and-gold headquarters, the tallest thing on the skyline. */
function raiseVanceTower(ctx, lot) {
  const { walls, solid } = ctx;
  const x0 = lot.x0 + 8, z0 = lot.z0 + 8, x1 = lot.x1 - 8, z1 = lot.z1 - 8;
  const opts = { tileW: FACADE_TILE_W, tileH: FACADE_TILE_H, top: false };
  walls.shopfront.at(0, 0, 0, 0).frustum(x0, x1, z0, z1, 0, x0, x1, z0, z1, 4, 0xffe2a0, 0, { tileW: FACADE_TILE_W, tileH: 4, top: false });
  walls.glass.at(0, 0, 0, 0);
  walls.glass.frustum(x0, x1, z0, z1, 4, x0, x1, z0, z1, 120, 0xffc978, 0, opts);
  walls.glass.frustum(x0 + 5, x1 - 5, z0 + 5, z1 - 5, 120, x0 + 5, x1 - 5, z0 + 5, z1 - 5, 170, 0xffc978, 0, opts);
  walls.glass.frustum(x0 + 10, x1 - 10, z0 + 10, z1 - 10, 170, x0 + 16, x1 - 16, z0 + 16, z1 - 16, 205, 0xffe6b0, 0, opts);
  addRoof(ctx, x0, z0, x1, z1, 120, false);
  addRoof(ctx, x0 + 5, z0 + 5, x1 - 5, z1 - 5, 170, false);
  solid.at(0, 0, 0, 0).plane(x0 + 16, z0 + 16, x1 - 16, z1 - 16, 205, 0xffd98a);
  solid.cylinder((x0 + x1) / 2, 205, (z0 + z1) / 2, 0.8, 250, 0.1, 6, 0xffe6b0);
  addBoxCollider(x0, z0, x1, z1, 206);
  // a paved plaza with planters around the base
  for (const [px, pz] of [[lot.x0 + 3, lot.z0 + 3], [lot.x1 - 3, lot.z0 + 3], [lot.x0 + 3, lot.z1 - 3], [lot.x1 - 3, lot.z1 - 3]]) {
    solid.box(px, 0.15, pz, 3, 0.7, 3, 0xd9d2c4);
    solid.box(px, 0.85, pz, 2.4, 0.5, 2.4, 0x3f9a4a);
  }
}

function raiseLandmark(ctx, lm) {
  const b = lm.building;
  const heights = { hospital: 26, police: 16, bank: 30, club: 12, penthouse: 58, guns_downtown: 9, guns_docks: 8 };
  const kinds = { hospital: 'office', police: 'office', bank: 'office', penthouse: 'deco', club: 'deco', safehouse: 'warehouse', benny: 'warehouse', stash: 'stucco' };
  const h = heights[lm.id] || 8.5;
  const kind = kinds[lm.id] || 'stucco';
  const face = lm.north ? 'n' : 's';
  const garage = lm.kind === 'paint' || lm.id === 'benny' || lm.id === 'safehouse';
  raiseBuilding(ctx, b.x0, b.z0, b.x1, b.z1, h, kind, lm.color, { shop: !garage, sign: lm.sign, signFace: face, signSize: 11 });
  const { solid } = ctx;
  solid.at(0, 0, 0, 0);
  if (garage) {
    // a roll-up door standing open: a dark mouth in the front wall
    const cx = (b.x0 + b.x1) / 2, fz = lm.north ? b.z0 - 0.06 : b.z1 + 0.06;
    solid.box(cx, 0.16, fz, 9, 3.8, 0.1, 0x14161a);
    solid.box(cx, 3.96, fz, 9.6, 0.3, 0.3, lm.kind === 'paint' ? 0xff7a3d : 0xf2c230);
  }
  if (lm.id === 'hospital') solid.box((b.x0 + b.x1) / 2, h + 0.8, (b.z0 + b.z1) / 2, 6, 0.2, 6, 0xd03030);
  // two parking bays on the forecourt
  parkingSpots.push({ x: lm.parcel.x0 + 3.5, z: lm.z, heading: lm.north ? 0 : Math.PI, lot: lm.id });
  parkingSpots.push({ x: lm.parcel.x1 - 3.5, z: lm.z, heading: lm.north ? 0 : Math.PI, lot: lm.id });
}

function raiseParcel(ctx, district, p, bx, bz, q) {
  const { rnd, solid } = ctx;
  const outerFace = () => rnd.pick([q < 2 ? 'n' : 's', q % 2 === 0 ? 'w' : 'e']); // a side that looks onto a street
  const sign = () => (rnd.chance(0.75) ? rnd.pick(GENERIC_SIGNS) : -1);
  if (district === 'downtown') {
    if (rnd.chance(0.12)) return addParking(ctx, p, q);
    const i = rnd.range(1, 3);
    return raiseTower(ctx, p.x0 + i, p.z0 + i, p.x1 - i, p.z1 - i, rnd.range(45, 125), false);
  }
  if (district === 'midtown') {
    if (rnd.chance(0.16)) return addParking(ctx, p, q);
    const kind = rnd.pick(['office', 'deco', 'stucco', 'glass']);
    const tint = kind === 'glass' ? rnd.pick(GLASS_TINTS) : kind === 'deco' ? rnd.pick(PASTELS) : rnd.pick(OFFICE_TINTS);
    return raiseBuilding(ctx, p.x0 + 1, p.z0 + 1, p.x1 - 1, p.z1 - 1, rnd.range(14, 46), kind, tint, { shop: true, sign: sign(), signFace: outerFace() });
  }
  if (district === 'strip') {
    const h = rnd.range(22, 68);
    raiseBuilding(ctx, p.x0 + 1, p.z0 + 1, p.x1 - 1, p.z1 - 1, h, 'deco', rnd.pick(PASTELS), { shop: true, sign: rnd.pick(GENERIC_SIGNS), signFace: q % 2 === 1 ? 'e' : outerFace(), signSize: 10 });
    // a rooftop fin in a second pastel, the Strip's signature
    solid.at(0, 0, 0, 0).box((p.x0 + p.x1) / 2, h, (p.z0 + p.z1) / 2, 1.2, rnd.range(4, 9), 14, rnd.pick(PASTELS));
    return;
  }
  if (district === 'southside') {
    if (rnd.chance(0.14)) return addParking(ctx, p, q);
    const half = rnd.chance(0.5);
    const tintA = rnd.pick(SOUTH_TINTS), tintB = rnd.pick(SOUTH_TINTS);
    if (half) {
      raiseBuilding(ctx, p.x0 + 0.5, p.z0 + 0.5, p.x0 + 13.5, p.z1 - 0.5, rnd.range(7, 14), 'stucco', tintA, { shop: true, sign: sign(), signFace: q < 2 ? 'n' : 's', signSize: 7 });
      raiseBuilding(ctx, p.x0 + 14.5, p.z0 + 0.5, p.x1 - 0.5, p.z1 - 0.5, rnd.range(7, 14), rnd.pick(['stucco', 'deco']), tintB, { shop: true, sign: sign(), signFace: q < 2 ? 'n' : 's', signSize: 7 });
    } else raiseBuilding(ctx, p.x0 + 1, p.z0 + 1, p.x1 - 1, p.z1 - 1, rnd.range(8, 18), 'stucco', tintA, { shop: true, sign: sign(), signFace: outerFace() });
    return;
  }
  if (district === 'docks') {
    if (rnd.chance(0.3)) return addContainerYard(ctx, p);
    return raiseBuilding(ctx, p.x0 + 1, p.z0 + 1, p.x1 - 1, p.z1 - 1, rnd.range(9, 15), 'warehouse', rnd.pick(DOCK_TINTS), { sign: rnd.chance(0.3) ? rnd.pick(GENERIC_SIGNS) : -1, signFace: outerFace() });
  }
  // Palm Heights: a bungalow with a hipped terracotta roof, sometimes a pool, and a driveway
  const two = rnd.chance(0.35), h = two ? 6.6 : 3.6;
  const w = rnd.range(13, 17), d = rnd.range(10, 13);
  const hx0 = p.x0 + (28 - w) / 2, hz0 = q < 2 ? p.z1 - d - 2 : p.z0 + 2;
  ctx.walls.stucco.at(0, 0, 0, 0).frustum(hx0, hx0 + w, hz0, hz0 + d, 0, hx0, hx0 + w, hz0, hz0 + d, h, rnd.pick(PASTELS), 0, { tileW: FACADE_TILE_W, tileH: FACADE_TILE_H, uOffset: rnd.int(0, 7) * 0.375, top: false });
  solid.at(0, 0, 0, 0).frustum(hx0 - 0.7, hx0 + w + 0.7, hz0 - 0.7, hz0 + d + 0.7, h, hx0 + w * 0.3, hx0 + w * 0.7, hz0 + d * 0.45, hz0 + d * 0.55, h + 2.6, rnd.pick([0xc8553a, 0xb8482f, 0xd0704a, 0x8a5a44]));
  addBoxCollider(hx0, hz0, hx0 + w, hz0 + d, h + 2);
  const driveZ = q < 2 ? p.z0 + 5 : p.z1 - 5;
  solid.plane(p.x0 + 2, driveZ - 3.5, p.x0 + 9, driveZ + 3.5, 0.18, 0xcfc8ba);
  parkingSpots.push({ x: p.x0 + 5.5, z: driveZ, heading: q < 2 ? 0 : Math.PI, lot: 'home' });
  if (rnd.chance(0.45)) {
    const px = p.x1 - 8, pz = q < 2 ? p.z0 + 7 : p.z1 - 7;
    solid.plane(px - 4.4, pz - 3.4, px + 4.4, pz + 3.4, 0.19, 0xe8e2d2);
    solid.plane(px - 3.6, pz - 2.6, px + 3.6, pz + 2.6, 0.21, 0x35c8e8);
  }
}

function addParking(ctx, p, q) {
  const { solid, rnd } = ctx;
  solid.at(0, 0, 0, 0).plane(p.x0, p.z0, p.x1, p.z1, 0.17, 0x4b4f56);
  for (let k = 0; k <= 6; k++) {
    const x = p.x0 + 2 + k * 4;
    solid.plane(x - 0.07, p.z0 + 1, x + 0.07, p.z0 + 7, 0.19, 0xf2f2ee);
    solid.plane(x - 0.07, p.z1 - 7, x + 0.07, p.z1 - 1, 0.19, 0xf2f2ee);
    if (k < 6) {
      if (rnd.chance(0.55)) parkingSpots.push({ x: x + 2, z: p.z0 + 4, heading: rnd.chance(0.5) ? 0 : Math.PI, lot: 'parking' });
      if (rnd.chance(0.55)) parkingSpots.push({ x: x + 2, z: p.z1 - 4, heading: rnd.chance(0.5) ? 0 : Math.PI, lot: 'parking' });
    }
  }
}

function addContainerYard(ctx, p) {
  const { solid, rnd } = ctx;
  const colors = [0xc0392b, 0x2e86c1, 0x27ae60, 0xe67e22, 0xf1c40f, 0x7f8c8d, 0x16a085];
  solid.at(0, 0, 0, 0).plane(p.x0, p.z0, p.x1, p.z1, 0.17, 0x6a6e74);
  for (let row = 0; row < 3; row++) {
    const z = p.z0 + 5 + row * 9;
    for (let col = 0; col < 2; col++) {
      if (rnd.chance(0.25)) continue;
      const x = p.x0 + 7.5 + col * 13, stack = rnd.int(1, 3);
      for (let s = 0; s < stack; s++) solid.box(x, 0.17 + s * 2.6, z, 12, 2.55, 2.5, rnd.pick(colors));
      addBoxCollider(x - 6, z - 1.25, x + 6, z + 1.25, stack * 2.6);
    }
  }
}
