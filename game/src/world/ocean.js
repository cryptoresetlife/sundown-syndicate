// The sea around the island: turquoise shallows fading to deep blue, rolling glitter, surf on the sand.
import * as THREE from '../../vendor/three.module.min.js';
import { ISLAND, SEA_LEVEL, CITY } from './layout.js';
import { sun } from './sky.js';

const uniforms = {
  time: { value: 0 },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Color(1, 1, 1) },
  fogColor: { value: new THREE.Color(0x9fdcff) },
  light: { value: 1 },
  islandCenter: { value: new THREE.Vector2((ISLAND.x0 + ISLAND.x1) / 2, (ISLAND.z0 + ISLAND.z1) / 2) },
  islandHalf: { value: new THREE.Vector2((ISLAND.x1 - ISLAND.x0) / 2 - 8, (ISLAND.z1 - ISLAND.z0) / 2 - 8) },
};

const VERT = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = `
uniform float time; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 fogColor; uniform float light;
uniform vec2 islandCenter; uniform vec2 islandHalf;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  vec2 q = abs(p - islandCenter) - islandHalf;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float shallow = smoothstep(90.0, 0.0, d);
  vec3 deep = vec3(0.02, 0.22, 0.52), teal = vec3(0.05, 0.72, 0.78);
  vec3 col = mix(deep, teal, shallow * shallow);
  float w1 = sin(p.x * 0.11 + time * 0.9) + sin(p.y * 0.13 - time * 0.7);
  float w2 = sin((p.x + p.y) * 0.31 + time * 1.7) + sin((p.x - p.y) * 0.27 - time * 1.3);
  vec3 n = normalize(vec3(w1 * 0.05 + w2 * 0.06, 1.0, w1 * 0.04 - w2 * 0.05));
  vec3 view = normalize(cameraPosition - vWorld);
  float spec = pow(max(dot(reflect(-sunDir, n), view), 0.0), 120.0);
  float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
  col = mix(col, fogColor, fres * 0.55);
  col += (w1 + w2) * 0.012;
  col *= light;
  col += sunColor * spec * 1.6 * light;
  float surf = smoothstep(7.0, 0.0, d + sin(time * 0.9 + p.x * 0.07 + p.y * 0.05) * 2.5) * (0.6 + 0.4 * sin(p.x * 0.9 + p.y * 0.8 + time * 2.0));
  col = mix(col, vec3(1.0) * (0.35 + 0.65 * light), clamp(surf, 0.0, 1.0) * 0.8);
  float dist = length(cameraPosition - vWorld);
  col = mix(col, fogColor, smoothstep(400.0, 2600.0, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

let mesh = null;

export function buildOcean(scene) {
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000, 1, 1), new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(CITY / 2, SEA_LEVEL, CITY / 2);
  scene.add(mesh);
}

export function updateOcean(dt, fogColor) {
  uniforms.time.value += dt;
  uniforms.sunDir.value.copy(sun.dir);
  uniforms.sunColor.value.copy(sun.color);
  uniforms.fogColor.value.copy(fogColor);
  uniforms.light.value = 0.16 + 0.84 * sun.day;
}
