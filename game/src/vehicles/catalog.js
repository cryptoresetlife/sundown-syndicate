// The garage of Marisol Bay: every drivable vehicle type, its handling numbers, and the code that
// models its body out of boxes and wedges (all original designs, no image or model files).
import * as THREE from '../../vendor/three.module.min.js';
import { MeshBatch } from '../core/meshbatch.js';

// topSpeed in m/s, accel in m/s^2. `shape` feeds buildBody below.
export const VEHICLE_TYPES = {
  palmetto: { name: 'Palmetto', cls: 'Sedan', topSpeed: 40, accel: 8.5, grip: 1, mass: 1400, health: 100, len: 4.6, wid: 1.86,
    shape: { body: 0.55, hood: 1.25, trunk: 0.95, cabin: 0.56 } },
  brisa: { name: 'Brisa', cls: 'Compact', topSpeed: 36, accel: 8, grip: 1.05, mass: 1050, health: 80, len: 3.7, wid: 1.7,
    shape: { body: 0.55, hood: 0.9, trunk: 0.12, cabin: 0.6 } },
  marlin: { name: 'Marlin GT', cls: 'Sports', topSpeed: 56, accel: 13, grip: 1.15, mass: 1300, health: 90, len: 4.4, wid: 1.92,
    shape: { body: 0.44, hood: 1.5, trunk: 0.7, cabin: 0.46, low: true, spoiler: true } },
  vanta: { name: 'Vanta S', cls: 'Supercar', topSpeed: 66, accel: 16, grip: 1.25, mass: 1250, health: 85, len: 4.55, wid: 2.02,
    shape: { body: 0.38, hood: 1.35, trunk: 1.0, cabin: 0.42, low: true, spoiler: true, wedge: true } },
  caliente: { name: 'Caliente', cls: 'Muscle', topSpeed: 52, accel: 12, grip: 0.92, mass: 1600, health: 110, len: 4.95, wid: 1.96,
    shape: { body: 0.52, hood: 1.85, trunk: 1.0, cabin: 0.47, stripes: true, scoop: true } },
  rancho: { name: 'Rancho', cls: 'SUV', topSpeed: 42, accel: 9, grip: 0.95, mass: 2100, health: 140, len: 4.9, wid: 2.02,
    shape: { body: 0.72, hood: 1.25, trunk: 0.15, cabin: 0.66, lift: 0.14 } },
  dune: { name: 'Dune Hopper', cls: 'Pickup', topSpeed: 40, accel: 8.5, grip: 0.9, mass: 2000, health: 140, len: 5.3, wid: 2.02,
    shape: { body: 0.66, hood: 1.3, trunk: 1.9, cabin: 0.62, lift: 0.18, bed: true } },
  bodega: { name: 'Bodega Hauler', cls: 'Van', topSpeed: 34, accel: 6.5, grip: 0.85, mass: 2300, health: 150, len: 5.1, wid: 2.05,
    shape: { body: 1.55, hood: 0.5, trunk: 0, cabin: 0, van: true } },
  cargo: { name: 'Cargo King', cls: 'Box Truck', topSpeed: 30, accel: 5, grip: 0.8, mass: 4200, health: 220, len: 7.2, wid: 2.4,
    shape: { body: 0.9, hood: 0.4, trunk: 0, cabin: 0.9, lift: 0.2, box: true } },
  solcab: { name: 'Sol Cab', cls: 'Taxi', topSpeed: 42, accel: 9, grip: 1, mass: 1450, health: 110, len: 4.65, wid: 1.86, paint: 0xffc400,
    shape: { body: 0.55, hood: 1.25, trunk: 0.95, cabin: 0.56, taxi: true } },
  cruiser: { name: 'MBPD Interceptor', cls: 'Police', topSpeed: 54, accel: 13, grip: 1.15, mass: 1700, health: 150, len: 4.8, wid: 1.92, paint: 0x14161c, police: true,
    shape: { body: 0.56, hood: 1.3, trunk: 0.95, cabin: 0.56, lightbar: true, doors: 0xf4f6f8, pushbar: true } },
  bulwark: { name: 'Bulwark', cls: 'Tactical', topSpeed: 44, accel: 9.5, grip: 0.95, mass: 5200, health: 380, len: 6.3, wid: 2.5, paint: 0x1c2738, police: true,
    shape: { body: 1.75, hood: 1.2, trunk: 0, cabin: 0, van: true, lift: 0.25, lightbar: true, pushbar: true, armored: true } },
};

export const CIVILIAN_TYPES = ['palmetto', 'palmetto', 'brisa', 'brisa', 'marlin', 'caliente', 'rancho', 'dune', 'bodega', 'cargo', 'solcab', 'solcab', 'vanta'];
export const PAINTS = [0xe63946, 0xf4a261, 0x2a9d8f, 0x264653, 0xffffff, 0x1d3557, 0xe9c46a, 0x8ecae6, 0xff70a6, 0x70d6ff, 0x9b5de5, 0x2b2d42, 0xc0c0c8, 0x06d6a0, 0xf15bb5];

const GLASS = 0x16242e, DARK = 0x15171a, CHROME = 0xc8ccd2, LAMP = 0xfff3c0, TAIL = 0xd81a1a;
const geoCache = new Map();
const detailMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
const glowRed = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
const glowBlue = new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false });
const glowOff = new THREE.MeshBasicMaterial({ color: 0x30343a });
let wheelGeo = null, hubGeo = null, tireMat = null, hubMat = null;

/** Models one vehicle type: returns paint and detail geometries plus where the wheels go. */
function buildBody(type) {
  const s = type.shape, L = type.len, W = type.wid, hw = W / 2, hl = L / 2;
  const paint = new MeshBatch(), detail = new MeshBatch();
  const base = 0.3 + (s.lift || 0), top = base + s.body;
  const WHITE = 0xffffff;
  if (s.wedge) {
    paint.frustum(-hw, hw, -hl, hl, base, -hw + 0.1, hw - 0.1, -hl + 0.05, hl - 0.9, top, WHITE);
    paint.frustum(-hw, hw, hl - 1.2, hl, base, -hw + 0.1, hw - 0.1, hl - 1.0, hl - 0.15, base + s.body * 0.55, WHITE);
  } else paint.frustum(-hw, hw, -hl, hl, base, -hw + 0.07, hw - 0.07, -hl + 0.06, hl - 0.08, top, WHITE);
  if (s.van) {
    // one tall box: windscreen and side glass up front
    detail.quad([-hw + 0.2, base + 0.75, hl - 0.01], [hw - 0.2, base + 0.75, hl - 0.01], [hw - 0.25, top - 0.15, hl - 0.045], [-hw + 0.25, top - 0.15, hl - 0.045], GLASS);
    for (const side of [-1, 1]) {
      const x = side * (hw - 0.015);
      const a = [x, base + 0.8, hl - 1.5], b = [x, base + 0.8, hl - 0.35], c = [x, top - 0.2, hl - 0.45], d = [x, top - 0.2, hl - 1.5];
      if (side > 0) detail.quad(b, a, d, c, GLASS); else detail.quad(a, b, c, d, GLASS);
      if (s.armored) { const e = [x, base + 1.0, -hl + 0.6], f = [x, base + 1.0, hl - 2.2], g = [x, base + 1.35, hl - 2.2], h = [x, base + 1.35, -hl + 0.6]; if (side > 0) detail.quad(f, e, h, g, GLASS); else detail.quad(e, f, g, h, GLASS); }
    }
    if (!s.armored) detail.box(0, top, -0.4, W * 0.7, 0.08, L * 0.5, 0xd9d9d9);
  } else {
    const cz0 = -hl + s.trunk, cz1 = hl - s.hood, ch = s.cabin;
    const slopeF = s.low ? 0.75 : 0.55, slopeR = s.bed || s.box ? 0.05 : s.trunk < 0.3 ? 0.2 : 0.5;
    detail.frustum(-hw + 0.1, hw - 0.1, cz0, cz1, top, -hw + 0.24, hw - 0.24, cz0 + slopeR, cz1 - slopeF, top + ch, GLASS, GLASS);
    paint.frustum(-hw + 0.22, hw - 0.22, cz0 + slopeR - 0.03, cz1 - slopeF + 0.03, top + ch, -hw + 0.27, hw - 0.27, cz0 + slopeR + 0.05, cz1 - slopeF - 0.05, top + ch + 0.06, WHITE);
    const mid = (cz0 + slopeR + cz1 - slopeF) / 2; // door pillars
    for (const side of [-1, 1]) paint.box(side * (hw - 0.16), top, mid, 0.1, ch + 0.02, 0.14, WHITE);
    if (s.bed) {
      paint.box(-hw + 0.08, top, -hl + s.trunk / 2 + 0.05, 0.12, 0.3, s.trunk - 0.2, WHITE).box(hw - 0.08, top, -hl + s.trunk / 2 + 0.05, 0.12, 0.3, s.trunk - 0.2, WHITE).box(0, top, -hl + 0.1, W - 0.1, 0.3, 0.12, WHITE);
      detail.plane(-hw + 0.14, -hl + 0.16, hw - 0.14, -hl + s.trunk - 0.1, top + 0.02, DARK);
    }
    if (s.box) {
      detail.box(0, base + 0.15, -hl + (L - 2.3) / 2 + 0.05, W, 2.75, L - 2.3, 0xf2f2f2);
      detail.box(0, base + 1.2, -hl + (L - 2.3) / 2 + 0.05, W + 0.04, 0.5, L - 2.3 - 0.1, 0x2a9d8f);
    }
  }
  if (s.spoiler) {
    paint.box(-hw + 0.3, top, -hl + 0.2, 0.08, 0.26, 0.2, WHITE).box(hw - 0.3, top, -hl + 0.2, 0.08, 0.26, 0.2, WHITE).box(0, top + 0.26, -hl + 0.18, W - 0.1, 0.05, 0.36, WHITE);
  }
  if (s.stripes) for (const x of [-0.22, 0.22]) {
    detail.plane(x - 0.12, hl - s.hood - 0.1, x + 0.12, hl - 0.1, top + 0.012, 0xf5f5f5);
    detail.plane(x - 0.12, -hl + 0.08, x + 0.12, -hl + s.trunk, top + 0.012, 0xf5f5f5);
  }
  if (s.scoop) detail.box(0, top, hl - s.hood * 0.55, 0.5, 0.12, 0.7, DARK);
  if (s.doors) for (const side of [-1, 1]) detail.box(side * (hw - 0.03), base + 0.08, -0.2, 0.06, s.body - 0.14, L * 0.42, s.doors);
  if (s.taxi) {
    detail.box(0, top + s.cabin + 0.06, -0.1, 0.9, 0.24, 0.34, 0xfff2a0);
    for (const side of [-1, 1]) for (let k = 0; k < 6; k++) detail.box(side * (hw - 0.03), base + 0.3, -1.2 + k * 0.42, 0.05, 0.14, 0.21, k % 2 ? DARK : 0xfafafa);
  }
  if (s.pushbar) detail.box(0, base + 0.02, hl + 0.1, W * 0.7, 0.5, 0.1, DARK).box(-W * 0.3, base, hl + 0.06, 0.08, 0.6, 0.1, DARK).box(W * 0.3, base, hl + 0.06, 0.08, 0.6, 0.1, DARK);
  // bumpers, lights, grille, plates
  detail.box(0, base - 0.04, hl - 0.02, W - 0.06, 0.2, 0.14, DARK).box(0, base - 0.04, -hl + 0.02, W - 0.06, 0.2, 0.14, DARK);
  const ly = base + s.body * (s.van ? 0.25 : 0.52), lh = s.low ? 0.1 : 0.15;
  for (const side of [-1, 1]) {
    detail.box(side * (hw - 0.32), ly, hl - 0.05, 0.42, lh, 0.08, LAMP);
    detail.box(side * (hw - 0.3), ly, -hl + 0.05, 0.44, lh, 0.08, TAIL);
  }
  detail.box(0, ly - 0.02, hl - 0.04, W * 0.42, lh + 0.02, 0.07, s.low ? DARK : CHROME);
  detail.box(0, base + 0.1, -hl + 0.03, 0.5, 0.14, 0.05, 0xf5f5f5);
  detail.plane(-hw + 0.1, -hl + 0.2, hw - 0.1, hl - 0.2, base - 0.02, DARK); // underside shadow plate
  const wr = s.armored || s.box ? 0.46 : s.lift ? 0.4 : s.low ? 0.33 : 0.35;
  const wz = hl - (s.van ? 1.0 : Math.min(s.hood * 0.72, 1.05)), wzr = -hl + (s.bed ? 1.25 : s.box ? 1.6 : Math.max(0.85, s.trunk * 0.9 + 0.2));
  // dark wheel arches
  for (const side of [-1, 1]) for (const z of [wz, wzr]) detail.box(side * (hw - 0.02), base - 0.02, z, 0.05, wr * 0.9, wr * 2.3, DARK);
  return {
    paint: paint.build(), detail: detail.build(), wheelRadius: wr,
    wheels: [[-hw + 0.16, wz], [hw - 0.16, wz], [-hw + 0.16, wzr], [hw - 0.16, wzr]],
    roofY: top + (s.van ? 0 : s.cabin) + 0.08, height: top + (s.van ? 0 : s.cabin),
  };
}

/** Returns { group, wheels, paintMaterial, lightbar } for a new vehicle of the given type and colour. */
export function buildVehicleMesh(typeId, paintColor) {
  const type = VEHICLE_TYPES[typeId];
  if (!geoCache.has(typeId)) geoCache.set(typeId, buildBody(type));
  const body = geoCache.get(typeId);
  if (!wheelGeo) {
    wheelGeo = new THREE.CylinderGeometry(1, 1, 0.26, 14); wheelGeo.rotateZ(Math.PI / 2);
    hubGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.28, 8); hubGeo.rotateZ(Math.PI / 2);
    tireMat = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.9 });
    hubMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.7 });
  }
  const group = new THREE.Group();
  const chassis = new THREE.Group(); // leans and pitches; the wheels stay on the road
  group.add(chassis);
  const paintMaterial = new THREE.MeshStandardMaterial({ color: paintColor, roughness: 0.28, metalness: 0.45 });
  const paintMesh = new THREE.Mesh(body.paint, paintMaterial);
  const detailMesh = new THREE.Mesh(body.detail, detailMaterial);
  paintMesh.castShadow = true; detailMesh.castShadow = true; paintMesh.receiveShadow = true;
  chassis.add(paintMesh, detailMesh);
  const wheels = body.wheels.map(([x, z], n) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, body.wheelRadius, z);
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.scale.set(1, body.wheelRadius, body.wheelRadius);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.scale.set(1, body.wheelRadius, body.wheelRadius);
    tire.castShadow = true;
    pivot.add(tire, hub);
    group.add(pivot);
    return { pivot, tire, hub, front: n < 2 };
  });
  let lightbar = null;
  if (type.shape.lightbar) {
    const y = body.roofY, geo = new THREE.BoxGeometry(type.wid * 0.3, 0.14, 0.3);
    const red = new THREE.Mesh(geo, glowOff), blue = new THREE.Mesh(geo, glowOff);
    const z = type.shape.van ? type.len / 2 - 1.3 : -0.15;
    red.position.set(-type.wid * 0.17, y + 0.07, z); blue.position.set(type.wid * 0.17, y + 0.07, z);
    chassis.add(red, blue);
    lightbar = { red, blue, y: y + 0.2, z };
  }
  return { group, chassis, wheels, paintMaterial, lightbar, height: body.height, wheelRadius: body.wheelRadius };
}

export const LIGHTBAR_MATERIALS = { red: glowRed, blue: glowBlue, off: glowOff };
