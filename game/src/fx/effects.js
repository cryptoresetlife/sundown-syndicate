// Visual effects: smoke, fire, sparks and blood as pooled point particles, bullet tracers, muzzle
// flashes, explosions with a flash of light, and the camera shake they cause.
import * as THREE from '../../vendor/three.module.min.js';
import { game, emitEvent } from '../core/state.js';
import { makeSmokeTexture, makeGlowTexture } from '../world/textures.js';

const MAX = 700;
const layers = {}; // 'smoke' (alpha blended) and 'fire' (additive)
const tracers = [];
const flashLights = [];
export const shake = { amount: 0 };

const POINT_VERT = `
attribute float size; attribute vec4 tint;
varying vec4 vTint;
void main() {
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * 700.0 / max(1.0, -mv.z);
}`;
const POINT_FRAG = `
uniform sampler2D map; varying vec4 vTint;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vTint.rgb, vTint.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

function makeLayer(scene, texture, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3), size = new Float32Array(MAX), tint = new Float32Array(MAX * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('tint', new THREE.BufferAttribute(tint, 4).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } }, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 6 : 5;
  scene.add(points);
  return { points, pos, size, tint, items: [] };
}

export function initEffects(scene) {
  layers.smoke = makeLayer(scene, makeSmokeTexture(), false);
  layers.fire = makeLayer(scene, makeGlowTexture(), true);
  const tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  for (let i = 0; i < 2; i++) {
    const l = new THREE.PointLight(0xffc070, 0, 40, 1.6);
    scene.add(l);
    flashLights.push({ light: l, life: 0, max: 1, peak: 0 });
  }
}

function emit(layer, p) {
  const L = layers[layer];
  if (!L) return;
  if (L.items.length >= MAX) L.items.shift();
  L.items.push(p);
}

/** One generic particle: position, velocity, life, start/end size, colour, start alpha. */
export function spawnParticle(layer, x, y, z, vx, vy, vz, life, size0, size1, r, g, b, alpha = 1, gravity = 0) {
  emit(layer, { x, y, z, vx, vy, vz, life, max: life, size0, size1, r, g, b, alpha, gravity });
}

export function spawnSmoke(x, y, z, dark = 0.25, size = 1.2, count = 1) {
  for (let i = 0; i < count; i++) {
    spawnParticle('smoke', x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, 1.2 + Math.random(), (Math.random() - 0.5) * 0.8,
      1.6 + Math.random(), size * 0.5, size * 2.4, dark, dark, dark, 0.55);
  }
}

export function spawnDust(x, y, z, count = 3) {
  for (let i = 0; i < count; i++) {
    spawnParticle('smoke', x, y, z, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 2, 0.7 + Math.random() * 0.5, 0.4, 1.6, 0.8, 0.75, 0.62, 0.35);
  }
}

export function spawnSparks(x, y, z, count = 8, r = 1, g = 0.8, b = 0.3) {
  for (let i = 0; i < count; i++) {
    spawnParticle('fire', x, y, z, (Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9, 0.25 + Math.random() * 0.3, 0.22, 0.05, r, g, b, 1, 14);
  }
}

export function spawnBlood(x, y, z, count = 7) {
  for (let i = 0; i < count; i++) {
    spawnParticle('smoke', x, y, z, (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, 0.4 + Math.random() * 0.3, 0.25, 0.5, 0.65, 0.03, 0.03, 0.9, 9);
  }
}

export function spawnFire(x, y, z, size = 1) {
  spawnParticle('fire', x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, 1.8 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6,
    0.5 + Math.random() * 0.3, size * 1.5, size * 0.3, 1, 0.5 + Math.random() * 0.3, 0.1, 0.9);
}

export function flashLight(x, y, z, color, intensity, life) {
  let slot = flashLights[0];
  for (const f of flashLights) if (f.life < slot.life) slot = f;
  slot.light.position.set(x, y, z);
  slot.light.color.set(color);
  slot.life = life; slot.max = life; slot.peak = intensity;
}

export function spawnMuzzleFlash(x, y, z, dx, dy, dz) {
  spawnParticle('fire', x + dx * 0.3, y + dy * 0.3, z + dz * 0.3, dx * 2, dy * 2, dz * 2, 0.07, 1.3, 0.5, 1, 0.85, 0.4, 1);
  flashLight(x, y + 0.2, z, 0xffc060, 60, 0.07);
}

export function spawnTracer(ax, ay, az, bx, by, bz, color = 0xfff0a0) {
  let t = tracers[0];
  for (const c of tracers) if (c.life < t.life) t = c;
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  t.mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  t.mesh.lookAt(bx, by, bz);
  t.mesh.scale.set(1, 1, Math.max(0.5, len));
  t.mesh.material.color.set(color);
  t.mesh.visible = true;
  t.life = 0.09;
}

export function addCameraShake(amount) {
  shake.amount = Math.min(1.6, shake.amount + amount);
}

/** A fireball, smoke column, sparks, a flash of light and a shake that fades with distance. */
export function spawnExplosion(x, y, z, scale = 1) {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.28, s = Math.random() * 7 * scale;
    spawnParticle('fire', x, y + 0.6, z, Math.cos(a) * s, 2 + Math.random() * 7, Math.sin(a) * s, 0.5 + Math.random() * 0.5, 2.6 * scale, 5.5 * scale, 1, 0.55 + Math.random() * 0.3, 0.12, 1);
  }
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * 6.28, s = Math.random() * 4 * scale;
    spawnParticle('smoke', x, y + 1, z, Math.cos(a) * s, 3 + Math.random() * 4, Math.sin(a) * s, 2.2 + Math.random() * 1.5, 2.5 * scale, 8 * scale, 0.12, 0.11, 0.1, 0.8);
  }
  spawnSparks(x, y + 1, z, 30);
  flashLight(x, y + 3, z, 0xff9040, 900, 0.5);
  const d = game.camera ? game.camera.position.distanceTo(new THREE.Vector3(x, y, z)) : 50;
  addCameraShake(Math.max(0, 1.3 - d / 60));
  emitEvent('explosion', { x, y, z, scale });
}

export function updateEffects(dt) {
  for (const key of ['smoke', 'fire']) {
    const L = layers[key];
    let n = 0;
    for (let i = 0; i < L.items.length; i++) {
      const p = L.items[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.gravity) { p.y = 0.05; p.vy *= -0.3; }
      const t = 1 - p.life / p.max;
      L.pos[n * 3] = p.x; L.pos[n * 3 + 1] = p.y; L.pos[n * 3 + 2] = p.z;
      L.size[n] = p.size0 + (p.size1 - p.size0) * t;
      L.tint[n * 4] = p.r; L.tint[n * 4 + 1] = p.g; L.tint[n * 4 + 2] = p.b;
      L.tint[n * 4 + 3] = p.alpha * (1 - t) * Math.min(1, t * 12 + 0.3);
      L.items[n++] = p;
    }
    L.items.length = n;
    L.points.geometry.setDrawRange(0, n);
    L.points.geometry.attributes.position.needsUpdate = true;
    L.points.geometry.attributes.size.needsUpdate = true;
    L.points.geometry.attributes.tint.needsUpdate = true;
  }
  for (const t of tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    t.mesh.material.opacity = Math.max(0, t.life / 0.09);
    if (t.life <= 0) t.mesh.visible = false;
  }
  for (const f of flashLights) {
    if (f.life > 0) { f.life -= dt; f.light.intensity = f.peak * Math.max(0, f.life / f.max); } else f.light.intensity = 0;
  }
  shake.amount = Math.max(0, shake.amount - dt * 2.2);
}
