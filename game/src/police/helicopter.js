// The police helicopter: arrives at three stars, circles above the player with a searchlight,
// keeps them in sight unless a tower blocks its view, and opens fire at four stars and up.
import * as THREE from '../../vendor/three.module.min.js';
import { game } from '../core/state.js';
import { damp, dampAngle, headingTo } from '../core/mathutil.js';
import { raycastWorld } from '../core/collision.js';
import { MeshBatch } from '../core/meshbatch.js';
import { fireWeapon } from '../combat/weapons.js';
import { sun } from '../world/sky.js';
import { wanted, registerSpotter } from './wanted.js';

let heli = null;

function buildHelicopter() {
  const b = new MeshBatch();
  const NAVY = 0x16233c, WHITE = 0xf2f4f6, GLASS = 0x18303f;
  b.frustum(-1.0, 1.0, -2.2, 1.6, 0, -0.9, 0.9, -1.9, 1.2, 1.7, WHITE, NAVY, { bottom: true });
  b.frustum(-0.9, 0.9, 1.6, 2.9, 0.1, -0.6, 0.6, 1.2, 2.0, 1.5, GLASS, GLASS, { bottom: true });
  b.frustum(-0.35, 0.35, -6.4, -2.2, 0.9, -0.2, 0.2, -6.4, -2.2, 1.4, NAVY, NAVY, { bottom: true });
  b.box(0, 1.0, -6.3, 0.12, 1.5, 0.8, NAVY);
  b.box(0, 1.7, -0.2, 0.5, 0.35, 1.2, NAVY);
  for (const side of [-1, 1]) {
    b.box(side * 1.05, -0.75, 0, 0.1, 0.1, 3.4, 0x222222);
    b.box(side * 1.0, -0.7, 1.0, 0.07, 0.75, 0.07, 0x222222);
    b.box(side * 1.0, -0.7, -1.0, 0.07, 0.75, 0.07, 0x222222);
    b.box(side * 1.02, 0.5, -0.4, 0.04, 0.5, 1.6, NAVY);
  }
  const group = new THREE.Group();
  group.add(b.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 })));
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.36), new THREE.MeshStandardMaterial({ color: 0x18181a }));
  rotor.position.set(0, 2.15, -0.2);
  const rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2; rotor.add(rotor2);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.9, 0.2), rotor.material);
  tail.position.set(0.22, 1.5, -6.3);
  group.add(rotor, tail);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 7, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.position.y = -20;
  const beamPivot = new THREE.Group();
  beamPivot.add(beam);
  group.add(beamPivot);
  group.visible = false;
  game.scene.add(group);
  return { group, rotor, tail, beamPivot, beam, active: false, angle: 0, shotClock: 2, pos: group.position, sees: false, leaving: false };
}

/** Flies the helicopter; `wantedHigh` says whether it should be on station. */
export function updateHelicopter(dt, wantedHigh) {
  const p = game.player;
  if (!heli) {
    if (!wantedHigh) return;
    heli = buildHelicopter();
    registerSpotter((range) => heli.active && !heli.leaving && heli.sees);
  }
  if (wantedHigh && !heli.active) {
    heli.active = true; heli.leaving = false;
    heli.group.visible = true;
    heli.group.position.set(p.pos.x - 220, 70, p.pos.z - 160);
  }
  if (!heli.active) return;
  if (!wantedHigh) heli.leaving = true;
  heli.angle += dt * 0.32;
  const g = heli.group;
  let tx, tz, ty;
  if (heli.leaving) { tx = g.position.x + 60; tz = g.position.z - 80; ty = 110; }
  else { tx = p.pos.x + Math.cos(heli.angle) * 30; tz = p.pos.z + Math.sin(heli.angle) * 30; ty = 36; }
  g.position.x = damp(g.position.x, tx, 0.9, dt);
  g.position.z = damp(g.position.z, tz, 0.9, dt);
  g.position.y = damp(g.position.y, ty, 0.8, dt);
  g.rotation.y = dampAngle(g.rotation.y, headingTo(p.pos.x - g.position.x, p.pos.z - g.position.z), 2.5, dt);
  g.rotation.x = 0.14;
  heli.rotor.rotation.y += dt * 30;
  heli.tail.rotation.x += dt * 40;
  if (heli.leaving) {
    heli.sees = false;
    if (Math.hypot(g.position.x - p.pos.x, g.position.z - p.pos.z) > 380) { heli.active = false; g.visible = false; }
    return;
  }
  // line of sight from the air: towers hide the player
  const dx = p.pos.x - g.position.x, dy = p.pos.y + 1 - g.position.y, dz = p.pos.z - g.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  heli.sees = len < 130 && raycastWorld(g.position.x, g.position.y, g.position.z, dx / len, dy / len, dz / len, len) >= len - 0.6;
  heli.beamPivot.lookAt(p.pos.x, p.pos.y, p.pos.z);
  heli.beamPivot.rotateX(-Math.PI / 2);
  heli.beam.visible = sun.night > 0.3; // the searchlight only shows after dark
  heli.beam.material.opacity = 0.22 * sun.night;
  heli.shotClock -= dt;
  if (wanted.stars >= 4 && heli.sees && heli.shotClock <= 0 && !p.dead) {
    heli.burst = (heli.burst || 0) + 1;
    heli.shotClock = heli.burst % 5 === 0 ? 2.4 : 0.13;
    fireWeapon(heli, 'rifle', g.position.x, g.position.y - 0.9, g.position.z, dx / len, dy / len, dz / len, 0.045);
  }
}

export function dismissHelicopter() {
  if (heli) { heli.active = false; heli.group.visible = false; }
}

export function helicopterPosition() {
  return heli && heli.active ? heli.group.position : null;
}
