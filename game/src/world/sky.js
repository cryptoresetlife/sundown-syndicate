// Sky, sun and the day/night cycle: a shader sky dome with drifting clouds and stars, the sun light
// with its shadow, and the colours of everything as the in-game clock turns.
import { lampPosts } from './roads.js';
import { setBuildingNight } from './buildings.js';
import * as THREE from '../../vendor/three.module.min.js';
import { game } from '../core/state.js';
import { clamp, smoothstep } from '../core/mathutil.js';
import { makeGlowTexture } from './textures.js';

export { updateDayNight, setClock, clockText, initSky };

export const sun = { dir: new THREE.Vector3(0.5, 0.8, 0.3), night: 0, day: 1, color: new THREE.Color(1, 1, 1) };
export const GAME_HOUR_SECONDS = 50; // one in-game hour of real time

let dome, sunLight, hemi, lampGlow;
const skyUniforms = {
  topColor: { value: new THREE.Color(0x1f7ae0) },
  horizonColor: { value: new THREE.Color(0xa8dcff) },
  sunColor: { value: new THREE.Color(0xfff2d0) },
  cloudColor: { value: new THREE.Color(0xffffff) },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  time: { value: 0 },
  night: { value: 0 },
};

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAG = `
uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor; uniform vec3 cloudColor;
uniform vec3 sunDir; uniform float time; uniform float night;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
void main() {
  vec3 dir = normalize(vDir);
  float h = max(dir.y, 0.0);
  vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
  float s = max(dot(dir, sunDir), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
  vec2 uv = dir.xz / (dir.y + 0.16) * 1.1 + vec2(time * 0.006, time * 0.002);
  float c = smoothstep(0.5, 0.78, fbm(uv)) * smoothstep(0.02, 0.2, dir.y);
  vec3 lit = cloudColor * (0.82 + 0.3 * pow(s, 3.0));
  col = mix(col, lit, c * 0.92);
  float star = step(0.9982, hash(floor(dir.xz / (abs(dir.y) + 0.3) * 240.0)));
  col += vec3(star) * night * (1.0 - c) * smoothstep(0.0, 0.2, dir.y);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const DAY_TOP = new THREE.Color(0x1670dc), DAY_HORIZON = new THREE.Color(0x9fdcff);
const DUSK_TOP = new THREE.Color(0x3a3f9a), DUSK_HORIZON = new THREE.Color(0xff9a5a);
const NIGHT_TOP = new THREE.Color(0x050a1c), NIGHT_HORIZON = new THREE.Color(0x1a2a4a);
const SUN_DAY = new THREE.Color(0xfff4dc), SUN_DUSK = new THREE.Color(0xff9a50), MOON = new THREE.Color(0x8fa8ff);
const tmpA = new THREE.Color(), tmpB = new THREE.Color();

function initSky(scene) {
  dome = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 16),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  hemi = new THREE.HemisphereLight(0xcfe8ff, 0x9a8a70, 1.1);
  scene.add(hemi);
  sunLight = new THREE.DirectionalLight(0xfff4dc, 3.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 600;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.06;
  scene.add(sunLight);
  scene.add(sunLight.target);
  scene.fog = new THREE.Fog(0x9fdcff, 260, 1900);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(lampPosts, 3));
  lampGlow = new THREE.Points(g, new THREE.PointsMaterial({
    map: makeGlowTexture('rgba(255,236,170,1)', 'rgba(255,200,90,0)'), size: 7, sizeAttenuation: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xffe2a0,
  }));
  lampGlow.frustumCulled = false;
  scene.add(lampGlow);
  applyClock();
}

function setClock(hour) {
  game.clock = ((hour % 24) + 24) % 24;
  applyClock();
}

function clockText() {
  const h = Math.floor(game.clock), m = Math.floor((game.clock - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function applyClock() {
  const a = ((game.clock - 6) / 12) * Math.PI; // 06:00 sunrise in the east, 18:00 sunset in the west
  const elev = Math.sin(a);
  const day = smoothstep(-0.12, 0.22, elev);
  const dusk = smoothstep(0.45, 0.0, Math.abs(elev)) * smoothstep(-0.35, 0.0, elev);
  sun.day = day; sun.night = 1 - day;
  if (elev > -0.05) sun.dir.set(Math.cos(a) * 0.85, Math.max(elev, 0.06), 0.42).normalize();
  else sun.dir.set(-Math.cos(a) * 0.5, 0.75, -0.42).normalize(); // the moon rides high
  tmpA.copy(NIGHT_TOP).lerp(DAY_TOP, day).lerp(DUSK_TOP, dusk * 0.75);
  skyUniforms.topColor.value.copy(tmpA);
  tmpB.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, day).lerp(DUSK_HORIZON, dusk * 0.85);
  skyUniforms.horizonColor.value.copy(tmpB);
  sun.color.copy(SUN_DAY).lerp(SUN_DUSK, dusk);
  if (elev <= -0.05) sun.color.copy(MOON);
  skyUniforms.sunColor.value.copy(sun.color).multiplyScalar(elev > -0.05 ? 1 : 0.5);
  skyUniforms.cloudColor.value.setScalar(0.12 + 0.88 * day).lerp(DUSK_HORIZON, dusk * 0.45);
  skyUniforms.sunDir.value.copy(sun.dir);
  skyUniforms.night.value = sun.night;
  if (sunLight) {
    sunLight.color.copy(sun.color);
    sunLight.intensity = elev > -0.05 ? 0.5 + 2.9 * day : 0.55;
    hemi.intensity = 0.42 + 0.85 * day;
    hemi.color.copy(tmpB).lerp(new THREE.Color(0xffffff), 0.4);
    game.scene.fog.color.copy(tmpB);
    lampGlow.material.opacity = clamp(sun.night * 1.4, 0, 1) * 0.95;
    lampGlow.visible = sun.night > 0.02;
  }
  setBuildingNight(smoothstep(0.35, 0.95, sun.night));
}

/** Advances the clock and keeps the sky dome and the shadow camera centred on the action. */
function updateDayNight(dt, focus) {
  if (dt > 0 && !game.debug.freezeClock) {
    game.clock += dt / GAME_HOUR_SECONDS;
    if (game.clock >= 24) { game.clock -= 24; game.day++; }
  }
  skyUniforms.time.value += dt;
  applyClock();
  dome.position.copy(game.camera.position);
  sunLight.target.position.set(focus.x, 0, focus.z);
  sunLight.position.set(focus.x + sun.dir.x * 260, sun.dir.y * 260, focus.z + sun.dir.z * 260);
  sunLight.castShadow = game.settings.shadows;
}
