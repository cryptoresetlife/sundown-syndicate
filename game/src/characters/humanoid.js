// Blocky people: one jointed body shared by the player, pedestrians, police and gangsters, with
// walk, run, aim, punch, cower, hands-up and knocked-down poses animated in code.
import * as THREE from '../../vendor/three.module.min.js';
import { damp } from '../core/mathutil.js';

const materials = new Map();
let geo = null;

function mat(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
  return materials.get(color);
}

function geometries() {
  if (geo) return geo;
  const box = (w, h, d, ty) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, ty, 0); return g; };
  geo = {
    leg: box(0.2, 0.86, 0.22, -0.43),
    shoe: box(0.21, 0.1, 0.32, -0.83),
    torso: box(0.5, 0.62, 0.27, 0.31),
    arm: box(0.15, 0.62, 0.16, -0.27),
    hand: box(0.13, 0.13, 0.14, -0.62),
    head: box(0.26, 0.28, 0.27, 0.14),
    hair: box(0.28, 0.1, 0.29, 0.31),
    cap: box(0.3, 0.09, 0.42, 0.31),
    helmet: box(0.32, 0.2, 0.33, 0.27),
    shades: box(0.27, 0.06, 0.04, 0.17),
    gun: box(0.06, 0.14, 0.3, 0),
    longGun: box(0.07, 0.13, 0.78, 0),
    vest: box(0.54, 0.4, 0.31, 0.38),
    skirt: box(0.46, 0.34, 0.3, -0.12),
  };
  return geo;
}

export const SKINS = [0xf2c9a0, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
export const SHIRTS = [0xff5a5a, 0x35c8e8, 0xffd23f, 0xffffff, 0x7be07b, 0xff8ad0, 0xff8a2b, 0x9b5de5, 0x2b2d42, 0x4ea8de, 0xf15bb5, 0x00bbf9];
export const PANTS = [0x2a3a5a, 0x1b1b1f, 0xd8c8a8, 0xf5f5f5, 0x4a6fa5, 0x7a5c3a, 0xff8ad0, 0x35858a];
export const HAIRS = [0x1a1208, 0x3b2412, 0x8a5a2a, 0xd9b36a, 0x111111, 0xb0b0b0, 0xc0392b];

/** look: { skin, shirt, pants, hair, hat: 'cap'|'helmet'|null, hatColor, shades, vest, skirt, shorts } */
export function createHumanoid(look) {
  const g = geometries();
  const root = new THREE.Group(); // stands on the ground at its origin, faces +z
  const hips = new THREE.Group();
  hips.position.y = 0.88;
  root.add(hips);
  const part = (geometry, color, parent, x, y, z) => {
    const m = new THREE.Mesh(geometry, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const legColor = look.shorts ? look.skin : look.pants;
  const legL = part(g.leg, legColor, hips, 0.13, 0, 0), legR = part(g.leg, legColor, hips, -0.13, 0, 0);
  part(g.shoe, look.shoes || 0x222222, legL, 0, 0, 0.05); part(g.shoe, look.shoes || 0x222222, legR, 0, 0, 0.05);
  if (look.shorts || look.skirt) part(g.skirt, look.pants, hips, 0, 0, 0);
  const torso = part(g.torso, look.shirt, hips, 0, 0, 0);
  if (look.vest) part(g.vest, look.vest, torso, 0, 0, 0);
  const sleeve = look.sleeveless ? look.skin : look.shirt;
  const armL = part(g.arm, sleeve, torso, 0.33, 0.58, 0), armR = part(g.arm, sleeve, torso, -0.33, 0.58, 0);
  part(g.hand, look.skin, armL, 0, 0, 0); part(g.hand, look.skin, armR, 0, 0, 0);
  const head = part(g.head, look.skin, torso, 0, 0.64, 0);
  if (look.hat === 'cap') part(g.cap, look.hatColor || 0x1d3557, head, 0, 0, 0.05);
  else if (look.hat === 'helmet') part(g.helmet, look.hatColor || 0x1a1f2a, head, 0, 0, 0);
  else part(g.hair, look.hair, head, 0, 0, -0.01);
  if (look.shades) part(g.shades, 0x0a0a0a, head, 0, 0, 0.13);
  const gun = part(g.gun, 0x1a1a1c, armR, 0, -0.68, 0.14);
  const longGun = part(g.longGun, 0x1a1a1c, armR, 0, -0.66, 0.3);
  gun.visible = false; longGun.visible = false;
  return { root, hips, torso, head, armL, armR, legL, legR, gun, longGun, phase: Math.random() * 6, lie: 0, crouch: 0 };
}

/** Poses the body. state: idle | walk | run | aim | punch | cower | handsup | down | sit. */
export function animateHumanoid(h, state, dt, moveSpeed = 0, punchTime = 0) {
  const k = 14;
  let legA = 0, armLx = 0, armRx = 0, armLz = 0.06, armRz = -0.06, lean = 0, bob = 0, lie = 0, crouch = 0;
  if (state === 'walk' || state === 'run') {
    h.phase += dt * (state === 'run' ? 11.5 : 7.5) * Math.max(0.6, Math.min(1.4, moveSpeed / (state === 'run' ? 6.5 : 2.2)));
    const amp = state === 'run' ? 0.95 : 0.55;
    legA = Math.sin(h.phase) * amp;
    armLx = -legA * 0.8; armRx = legA * 0.8;
    lean = state === 'run' ? 0.16 : 0.03;
    bob = Math.abs(Math.cos(h.phase)) * (state === 'run' ? 0.07 : 0.03);
  } else if (state === 'aim') {
    armRx = -1.52; armLx = -1.4; armLz = -0.42; armRz = 0.1;
  } else if (state === 'punch') {
    const t = Math.sin(Math.min(1, punchTime) * Math.PI);
    armRx = -1.5 * t; armLx = -0.7; armLz = -0.2; lean = 0.12 * t;
  } else if (state === 'cower') {
    crouch = 0.42; armLx = -2.6; armRx = -2.6; armLz = -0.35; armRz = 0.35; lean = 0.5;
  } else if (state === 'handsup') {
    armLx = -3.0; armRx = -3.0; armLz = 0.25; armRz = -0.25;
  } else if (state === 'down') {
    lie = 1; armLz = 0.9; armRz = -0.9;
  } else if (state === 'sit') {
    crouch = 0.3; legA = 0; armLx = -1.1; armRx = -1.1;
  } else {
    h.phase += dt * 1.5;
    armLx = Math.sin(h.phase) * 0.04; armRx = -armLx;
  }
  h.legL.rotation.x = damp(h.legL.rotation.x, state === 'sit' ? -1.4 : legA, k, dt);
  h.legR.rotation.x = damp(h.legR.rotation.x, state === 'sit' ? -1.4 : -legA, k, dt);
  h.armL.rotation.x = damp(h.armL.rotation.x, armLx, k, dt);
  h.armR.rotation.x = damp(h.armR.rotation.x, armRx, k, dt);
  h.armL.rotation.z = damp(h.armL.rotation.z, armLz, k, dt);
  h.armR.rotation.z = damp(h.armR.rotation.z, armRz, k, dt);
  h.torso.rotation.x = damp(h.torso.rotation.x, lean, k, dt);
  h.lie = damp(h.lie, lie, 9, dt);
  h.crouch = damp(h.crouch, crouch, 9, dt);
  h.root.rotation.x = -h.lie * Math.PI / 2;
  h.hips.position.y = 0.88 + bob - h.crouch;
  h.root.position.y += h.lie * 0.16;
}

export function showGun(h, kind) {
  h.gun.visible = kind === 'pistol';
  h.longGun.visible = kind === 'long';
}

export function randomLook(rnd, style = 'street') {
  const look = { skin: rnd.pick(SKINS), shirt: rnd.pick(SHIRTS), pants: rnd.pick(PANTS), hair: rnd.pick(HAIRS) };
  if (style === 'beach') { look.shorts = true; look.sleeveless = rnd.chance(0.6); look.shades = rnd.chance(0.5); }
  else {
    if (rnd.chance(0.25)) look.shorts = true;
    if (rnd.chance(0.2)) { look.hat = 'cap'; look.hatColor = rnd.pick(SHIRTS); }
    if (rnd.chance(0.25)) look.shades = true;
    if (rnd.chance(0.2)) look.skirt = true;
  }
  return look;
}
