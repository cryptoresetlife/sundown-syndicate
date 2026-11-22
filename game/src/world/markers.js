// Markers: the glowing rings and light beams that show where to go (mission starts, objectives,
// checkpoints, shops), each also a blip on the minimap. Blips can follow moving targets too.
import * as THREE from '../../vendor/three.module.min.js';
import { game } from '../core/state.js';
import { groundHeight } from './layout.js';
import { makeTextTexture } from './textures.js';

export const markers = [];
let ringGeo = null, beamGeo = null;
const labelTextures = new Map();

/**
 * opts: { x, z, color, radius, label (a letter or symbol over the ring and on the map), kind
 * ('mission' | 'objective' | 'shop' | 'race' | 'enemy' | 'activity'), beam, ring, follow (an object with .pos), name }
 */
export function addMarker(opts) {
  if (!ringGeo) {
    ringGeo = new THREE.CylinderGeometry(1, 1, 0.5, 28, 1, true);
    beamGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 12, 1, true);
  }
  const m = { x: opts.x ?? 0, z: opts.z ?? 0, color: opts.color ?? 0xffe14a, radius: opts.radius ?? 2.4, label: opts.label || '', kind: opts.kind || 'objective', follow: opts.follow || null, name: opts.name || '', group: new THREE.Group(), age: 0, hideOnMap: !!opts.hideOnMap, mapOnly: !!opts.mapOnly };
  const mat = new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  if (opts.ring !== false && !m.mapOnly) {
    m.ring = new THREE.Mesh(ringGeo, mat);
    m.ring.scale.set(m.radius, 1, m.radius);
    m.ring.position.y = 0.3;
    m.group.add(m.ring);
  }
  if (opts.beam !== false && !m.mapOnly) {
    m.beam = new THREE.Mesh(beamGeo, mat.clone());
    m.beam.material.opacity = 0.3;
    m.beam.scale.set(m.follow ? 0.6 : 1, 60, m.follow ? 0.6 : 1);
    m.beam.position.y = 30 + (m.follow ? 3 : 0);
    m.group.add(m.beam);
  }
  if (m.label && !m.mapOnly) {
    if (!labelTextures.has(m.label)) labelTextures.set(m.label, makeTextTexture(m.label, { size: 92 }));
    m.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTextures.get(m.label), color: m.color, depthTest: false, transparent: true, toneMapped: false }));
    m.sprite.scale.setScalar(2.2);
    m.sprite.position.y = m.follow ? 4.2 : 3.4;
    m.sprite.renderOrder = 20;
    m.group.add(m.sprite);
  }
  game.scene.add(m.group);
  markers.push(m);
  placeMarker(m);
  return m;
}

function placeMarker(m) {
  if (m.follow && m.follow.pos) { m.x = m.follow.pos.x; m.z = m.follow.pos.z; }
  m.group.position.set(m.x, groundHeight(m.x, m.z), m.z);
}

export function removeMarker(m) {
  if (!m || m.removed) return;
  m.removed = true;
  game.scene.remove(m.group);
  const i = markers.indexOf(m);
  if (i >= 0) markers.splice(i, 1);
}

export function updateMarkers(dt) {
  for (const m of markers) {
    m.age += dt;
    placeMarker(m);
    const pulse = 1 + Math.sin(m.age * 4) * 0.06;
    if (m.ring) { m.ring.scale.set(m.radius * pulse, 1 + Math.sin(m.age * 3) * 0.3, m.radius * pulse); m.ring.rotation.y += dt; }
    if (m.sprite) m.sprite.position.y = (m.follow ? 4.2 : 3.4) + Math.sin(m.age * 2.5) * 0.2;
  }
}

/** True when the player (on foot or in a car) stands inside the marker's ring. */
export function playerInMarker(m, extra = 0) {
  const p = game.player;
  return Math.hypot(p.pos.x - m.x, p.pos.z - m.z) < m.radius + extra + (p.vehicle ? 1.2 : 0);
}
