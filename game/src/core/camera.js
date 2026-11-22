// The third-person chase camera: orbits the player on foot, trails the car when driving, pulls in
// for aiming, widens with speed, never clips through buildings, and shakes with explosions.
import * as THREE from '../../vendor/three.module.min.js';
import { game } from './state.js';
import { mouse } from './input.js';
import { clamp, damp, dampAngle, wrapAngle } from './mathutil.js';
import { raycastWorld } from './collision.js';
import { shake } from '../fx/effects.js';

export const cam = {
  yaw: 0, // heading the camera looks along
  pitch: 0.18, // radians above the horizon it looks down from
  distance: 6,
  fov: 62,
  aiming: false,
  orbitHold: 0, // seconds since the mouse last steered the camera in a vehicle
  cinematic: null, // { x, y, z, lookX, lookY, lookZ } overrides everything (cutscenes, the title screen)
  forward: new THREE.Vector3(0, 0, 1),
};

const target = new THREE.Vector3(), desired = new THREE.Vector3(), look = new THREE.Vector3();

export function snapCameraBehind(heading) {
  cam.yaw = heading;
  cam.pitch = 0.2;
  cam.orbitHold = 99;
}

export function updateChaseCamera(dt) {
  const camera = game.camera, p = game.player;
  if (cam.cinematic) {
    const c = cam.cinematic;
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.lookX, c.lookY, c.lookZ);
    setFov(c.fov || 55, dt, true);
    return;
  }
  if (!p) return;
  const sens = 0.0026 * game.settings.sensitivity;
  if (game.mode === 'play' && (mouse.dx || mouse.dy)) {
    cam.yaw = wrapAngle(cam.yaw - mouse.dx * sens);
    cam.pitch = clamp(cam.pitch + mouse.dy * sens * (game.settings.invertY ? -1 : 1), -0.45, 1.25);
    cam.orbitHold = 0;
  }
  cam.orbitHold += dt;
  const v = p.vehicle;
  let dist, height, side = 0, wantFov = 62;
  if (v) {
    const speed = Math.abs(v.speed);
    // after a moment without mouse input the camera swings back behind the car
    if (cam.orbitHold > 1.4 && speed > 2) {
      const behind = v.speed < -2 ? v.heading + Math.PI : v.heading;
      cam.yaw = dampAngle(cam.yaw, behind, 2.6, dt);
      cam.pitch = damp(cam.pitch, 0.2, 2, dt);
    }
    dist = 7.2 + v.type.len * 0.55 + speed * 0.05;
    height = 1.5 + v.height * 0.45;
    wantFov = 62 + clamp(speed / v.type.topSpeed, 0, 1) * 16;
    target.set(v.pos.x, v.pos.y + height, v.pos.z);
  } else {
    cam.aiming = p.aiming;
    dist = cam.aiming ? 3.6 : 5.6;
    side = cam.aiming ? 1.05 : 0.5;
    wantFov = cam.aiming ? 50 : 62;
    target.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
  }
  cam.distance = damp(cam.distance, dist, 7, dt);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const fx = Math.sin(cam.yaw) * cp, fz = Math.cos(cam.yaw) * cp, fy = -sp;
  cam.forward.set(fx, fy, fz);
  const rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
  target.x += rx * side; target.z += rz * side;
  // keep the camera out of walls: cast back from the target
  let d = cam.distance;
  const hit = raycastWorld(target.x, target.y, target.z, -fx, -fy, -fz, d + 0.4);
  if (hit < d + 0.4) d = Math.max(0.6, hit - 0.4);
  desired.set(target.x - fx * d, Math.max(target.y - fy * d, 0.35), target.z - fz * d);
  camera.position.copy(desired);
  if (shake.amount > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake.amount * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake.amount * 0.5;
    camera.position.z += (Math.random() - 0.5) * shake.amount * 0.5;
  }
  look.set(target.x + fx * 20, target.y + fy * 20 + (v ? 1.2 : 0.2), target.z + fz * 20);
  camera.lookAt(look);
  setFov(wantFov, dt);
}

function setFov(fov, dt, snap = false) {
  const camera = game.camera;
  cam.fov = snap ? fov : damp(cam.fov, fov, 5, dt);
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
}
