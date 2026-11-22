// Vehicle: arcade car physics (engine, brakes, grip, handbrake drifts), collisions with buildings,
// other vehicles and people, damage that smokes, burns and finally explodes.
import '../combat/weapons.js'; // load order: vehicles, then weapons, then the player who uses both
import * as THREE from '../../vendor/three.module.min.js';
import { game, emitEvent } from '../core/state.js';
import { clamp, damp } from '../core/mathutil.js';
import { collideCircle, clampToIsland } from '../core/collision.js';
import { groundHeight } from '../world/layout.js';
import { VEHICLE_TYPES, PAINTS, buildVehicleMesh, LIGHTBAR_MATERIALS } from './catalog.js';
import { spawnSmoke, spawnFire, spawnSparks, spawnExplosion, spawnDust } from '../fx/effects.js';
import { makeGlowTexture } from '../world/textures.js';

export class Vehicle {
  constructor(typeId, x, z, heading = 0, paint = null) {
    this.typeId = typeId;
    this.type = VEHICLE_TYPES[typeId];
    this.paint = this.type.paint ?? paint ?? PAINTS[Math.floor(Math.random() * PAINTS.length)];
    const built = buildVehicleMesh(typeId, this.paint);
    Object.assign(this, { mesh: built.group, chassis: built.chassis, wheels: built.wheels, paintMaterial: built.paintMaterial, lightbar: built.lightbar, height: built.height });
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.speed = 0; // signed forward speed, m/s
    this.slip = 0; // sideways speed, m/s
    this.steerAngle = 0;
    this.input = { throttle: 0, steer: 0, brake: 0, handbrake: false };
    this.health = this.type.health;
    this.driver = null; // null | 'player' | an AI driver object
    this.destroyed = false;
    this.burnTimer = 0;
    this.siren = false;
    this.wheelSpin = 0;
    this.roll = 0; this.pitch = 0;
    this.lastHitBy = null;
    this.radius = Math.hypot(this.type.len, this.type.wid) / 2;
    this.smokeClock = 0;
    this.age = 0;
    this.locked = false;
    if (this.lightbar) this.addLightbarGlow();
    this.syncMesh();
    game.scene.add(this.mesh);
    game.vehicles.push(this);
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return Math.cos(this.heading); }
  get kmh() { return Math.abs(this.speed) * 3.6; }

  /** World position of a point given in the car's own frame (x to its left... right is negative x). */
  localToWorld(lx, lz, out = tmp) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    out.x = this.pos.x + lx * c + lz * s;
    out.z = this.pos.z - lx * s + lz * c;
    return out;
  }

  worldToLocal(x, z, out = tmp) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const dx = x - this.pos.x, dz = z - this.pos.z;
    out.x = dx * c - dz * s;
    out.z = dx * s + dz * c;
    return out;
  }

  /** Where a person stands after climbing out of the driver's door. */
  doorPosition(out = { x: 0, z: 0 }) {
    this.localToWorld(this.type.wid / 2 + 0.75, 0.1, out);
    return out;
  }

  repair() {
    this.health = this.type.health;
    this.destroyed = false;
    this.burnTimer = 0;
    this.paintMaterial.color.set(this.paint);
  }

  repaint(color) {
    this.paint = color;
    this.paintMaterial.color.set(color);
  }

  damage(amount, by = null) {
    if (this.destroyed || this.invulnerable) return;
    this.health -= amount;
    if (by) this.lastHitBy = by;
    if (this.health <= 0) { this.health = 0; if (this.burnTimer <= 0) this.burnTimer = 2.6; }
  }

  explode() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.health = 0;
    this.siren = false;
    this.paintMaterial.color.set(0x1a1a1a);
    this.vx *= 0.3; this.vz *= 0.3;
    spawnExplosion(this.pos.x, this.pos.y + 0.6, this.pos.z, 1.1);
    emitEvent('vehicleDestroyed', { vehicle: this, by: this.lastHitBy });
  }

  update(dt) {
    this.age += dt;
    const t = this.type, inp = this.input;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const powered = !this.destroyed && this.driver && this.health > 0;
    const throttle = powered ? clamp(inp.throttle, -1, 1) : 0;
    const brake = this.driver ? clamp(inp.brake, 0, 1) : 0.35;
    const healthFactor = this.health < t.health * 0.3 ? 0.7 : 1;

    if (throttle > 0) {
      if (vf < -0.5) vf += 22 * dt; // braking out of reverse
      else vf += t.accel * 0.82 * throttle * healthFactor * Math.max(0, 1 - Math.pow(Math.max(vf, 0) / (t.topSpeed * 0.9), 2.2)) * dt;
    } else if (throttle < 0) {
      if (vf > 0.6) vf -= 24 * -throttle * dt; // brakes
      else vf += t.accel * 0.7 * throttle * Math.max(0, 1 - Math.abs(vf) / (t.topSpeed * 0.32)) * dt;
    }
    if (brake > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 26 * brake * dt);
    if (inp.handbrake && this.driver) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 9 * dt);
    vf -= vf * 0.012 * dt * (1 + Math.abs(vf) * 0.05);
    if (throttle === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 1.6 * dt);

    // tyres: sideways speed bleeds off fast unless the handbrake is on or the car is sliding hard
    const sliding = Math.abs(vl) > 5.5;
    const gripRate = (inp.handbrake && this.driver ? 1.6 : sliding ? 4.2 : 9.5) * t.grip;
    vl *= Math.exp(-gripRate * dt);
    this.slip = vl;

    // steering: a tighter lock at parking speed, a gentle one flat out
    const speedRatio = clamp(Math.abs(vf) / t.topSpeed, 0, 1);
    const maxSteer = 0.62 - 0.47 * Math.pow(speedRatio, 0.7);
    this.steerAngle = damp(this.steerAngle, (powered || this.driver ? clamp(inp.steer, -1, 1) : 0) * maxSteer, 9, dt);
    const wheelbase = t.len * 0.62;
    let yawRate = (vf / wheelbase) * Math.tan(this.steerAngle);
    if (inp.handbrake && this.driver) yawRate *= 1.35;
    this.heading += yawRate * dt;

    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    this.speed = vf;
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;

    if (Math.abs(vf) > 0.05 || Math.abs(vl) > 0.05 || this.age < 0.5) this.collideWorld();

    this.wheelSpin += (vf / 0.35) * dt;
    const accelLean = clamp((inp.throttle > 0 ? -1 : 0) * 0.02 + (brake > 0 || throttle < 0 ? 0.03 : 0), -0.05, 0.05) * Math.min(1, Math.abs(vf) / 4);
    this.pitch = damp(this.pitch, accelLean, 6, dt);
    this.roll = damp(this.roll, clamp(yawRate * vf * 0.004, -0.09, 0.09), 6, dt);
    this.updateDamageEffects(dt);
    if (this.lightbar) this.updateLightbar();
    this.syncMesh();
  }

  collideWorld() {
    const t = this.type, r = t.wid / 2 + 0.05, reach = t.len / 2 - t.wid / 2;
    for (const off of [reach, 0, -reach]) {
      const c = this.localToWorld(0, off);
      const before = { x: c.x, z: c.z };
      const hit = collideCircle(c, r, 0.8);
      if (!hit) continue;
      this.pos.x += c.x - before.x; this.pos.z += c.z - before.z;
      this.bounce(hit.nx, hit.nz, off);
    }
    const p = { x: this.pos.x, z: this.pos.z };
    if (clampToIsland(p, 2.2)) {
      const nx = p.x - this.pos.x, nz = p.z - this.pos.z, len = Math.hypot(nx, nz) || 1;
      this.pos.x = p.x; this.pos.z = p.z;
      this.bounce(nx / len, nz / len, 0, true);
    }
  }

  /** Reflects velocity off a surface with normal (nx, nz); hard hits hurt the car. */
  bounce(nx, nz, offset, soft = false) {
    const vn = this.vx * nx + this.vz * nz;
    if (vn >= 0) return;
    const impact = -vn;
    this.vx -= (1 + (soft ? 0 : 0.22)) * vn * nx;
    this.vz -= (1 + (soft ? 0 : 0.22)) * vn * nz;
    this.vx *= 0.985; this.vz *= 0.985;
    if (offset !== 0) {
      // a glancing blow on the nose or tail swings the car round
      const side = nx * -Math.cos(this.heading) + nz * Math.sin(this.heading);
      this.heading -= clamp(side * Math.sign(offset) * impact * 0.012, -0.12, 0.12);
    }
    if (impact > 5 && !soft) {
      this.damage((impact - 5) * 1.15);
      spawnSparks(this.pos.x - nx * 1.5, 0.6, this.pos.z - nz * 1.5, 6);
      emitEvent('crash', { vehicle: this, impact });
    }
  }

  updateDamageEffects(dt) {
    if (this.destroyed) {
      this.smokeClock += dt;
      if (this.smokeClock > 0.16 && this.age < 9999) {
        this.smokeClock = 0;
        const e = this.localToWorld(0, this.type.len * 0.3);
        spawnSmoke(e.x, 1, e.z, 0.08, 1.6);
        if (Math.random() < 0.5) spawnFire(e.x, 0.9, e.z, 1.1);
      }
      return;
    }
    const ratio = this.health / this.type.health;
    if (ratio < 0.5) {
      this.smokeClock += dt;
      if (this.smokeClock > (ratio < 0.25 ? 0.07 : 0.18)) {
        this.smokeClock = 0;
        const e = this.localToWorld(0, this.type.len * 0.36);
        spawnSmoke(e.x, 1, e.z, ratio < 0.25 ? 0.1 : 0.55, 0.9);
        if (this.burnTimer > 0) spawnFire(e.x, 1, e.z, 0.9);
      }
    }
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      if (this.burnTimer <= 0) this.explode();
    }
    if (Math.abs(this.slip) > 4 && Math.abs(this.speed) > 6 && Math.random() < 0.5) {
      const e = this.localToWorld(0, -this.type.len * 0.35);
      spawnDust(e.x, 0.2, e.z, 1);
    }
  }

  /** The red and blue flare sprites over a police lightbar. */
  addLightbarGlow() {
    if (!glowTexture) glowTexture = makeGlowTexture();
    const make = (color, x) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.scale.setScalar(4.2);
      s.position.set(x, this.lightbar.y + 0.1, this.lightbar.z);
      s.visible = false;
      this.chassis.add(s);
      return s;
    };
    this.lightbar.glowRed = make(0xff2a2a, -this.type.wid * 0.2);
    this.lightbar.glowBlue = make(0x3a7bff, this.type.wid * 0.2);
  }

  updateLightbar() {
    const lb = this.lightbar;
    const on = this.siren && !this.destroyed;
    const phase = on ? Math.floor(game.time * 6 + this.type.len) % 2 : -1;
    lb.red.material = phase === 0 ? LIGHTBAR_MATERIALS.red : LIGHTBAR_MATERIALS.off;
    lb.blue.material = phase === 1 ? LIGHTBAR_MATERIALS.blue : LIGHTBAR_MATERIALS.off;
    lb.glowRed.visible = phase === 0;
    lb.glowBlue.visible = phase === 1;
  }

  syncMesh() {
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.chassis.rotation.x = this.pitch;
    this.chassis.rotation.z = this.roll;
    for (const w of this.wheels) {
      w.tire.rotation.x = this.wheelSpin;
      w.hub.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steerAngle;
    }
  }

  remove() {
    game.scene.remove(this.mesh);
    this.paintMaterial.dispose();
    const i = game.vehicles.indexOf(this);
    if (i >= 0) game.vehicles.splice(i, 1);
    this.removed = true;
  }
}

let glowTexture = null;
const tmp = { x: 0, z: 0 };

// Car-against-car and people-against-car collisions live in collisions.js.
