// The player, Dez Calloway: running, sprinting and jumping on foot, driving, punching, aiming and
// shooting (also from the driver's seat), health, armour, stamina and the weapon wheel.
import { cam } from '../core/camera.js';
import { WEAPONS, WEAPON_ORDER, fireWeapon, hitscan, meleeAttack } from '../combat/weapons.js';
import * as THREE from '../../vendor/three.module.min.js';
import { game, emitEvent } from '../core/state.js';
import { isKeyDown, wasKeyPressed, axis, mouse } from '../core/input.js';
import { dampAngle, headingTo } from '../core/mathutil.js';
import { collideCircle, clampToIsland } from '../core/collision.js';
import { groundHeight } from '../world/layout.js';
import { createHumanoid, animateHumanoid, showGun } from './humanoid.js';
import { pushOutOfVehicles } from '../vehicles/collisions.js';
import { nearestEnterableVehicle, enterVehicle, exitVehicle } from '../vehicles/carjack.js';
import { playSound } from '../audio/sound.js';
import { spawnDust } from '../fx/effects.js';

export class Player {
  constructor(x, z, heading = 0) {
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.heading = heading;
    this.vy = 0;
    this.grounded = true;
    this.health = 100; this.maxHealth = 100;
    this.armor = 0;
    this.stamina = 1;
    this.vehicle = null;
    this.dead = false;
    this.weapons = { fists: { clip: 0, ammo: 0 } };
    this.current = 'fists';
    this.fireCooldown = 0;
    this.reloadTime = 0;
    this.punchTime = 0;
    this.aiming = false;
    this.aimHold = 0;
    this.anim = 'idle';
    this.moveSpeed = 0;
    this.vx = 0; this.vz = 0;
    this.stepClock = 0;
    this.hurtFlash = 0;
    this.body = createHumanoid(DEZ_LOOK);
    game.scene.add(this.body.root);
    game.player = this;
  }

  giveWeapon(id, ammo = 0) {
    const w = WEAPONS[id];
    if (!this.weapons[id]) this.weapons[id] = { clip: w.clip || 0, ammo: 0 };
    this.weapons[id].ammo += ammo;
  }

  selectWeapon(id) {
    if (!this.weapons[id] || this.current === id) return;
    this.current = id;
    this.reloadTime = 0;
    emitEvent('weaponChanged', { id });
    playSound('ui');
  }

  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((id) => this.weapons[id]);
    const i = owned.indexOf(this.current);
    this.selectWeapon(owned[(i + dir + owned.length) % owned.length]);
  }

  takeDamage(amount, attacker = null) {
    if (this.dead || game.debug.godMode || game.mode === 'cutscene') return;
    if (this.armor > 0) {
      const soak = Math.min(this.armor, amount * 0.75);
      this.armor -= soak; amount -= soak;
    }
    this.health -= amount;
    this.hurtFlash = 0.35;
    emitEvent('playerHurt', { amount, attacker });
    if (this.health <= 0) { this.health = 0; this.die('flatlined'); }
  }

  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    if (this.vehicle) exitVehicle(this);
    this.anim = cause === 'booked' ? 'handsup' : 'down';
    emitEvent('playerDown', { cause });
  }

  revive(x, z, heading = 0) {
    this.dead = false;
    this.health = this.maxHealth;
    this.pos.set(x, groundHeight(x, z), z);
    this.heading = heading;
    this.vy = 0;
    this.anim = 'idle';
    this.body.root.visible = true;
  }

  /** The point in the world under the crosshair. */
  aimPoint(range = 200) {
    const c = game.camera.position, f = cam.forward;
    const skip = this.vehicle ? cam.distance : Math.max(0, cam.distance - 0.5);
    const ox = c.x + f.x * skip, oy = c.y + f.y * skip, oz = c.z + f.z * skip;
    return hitscan(ox, oy, oz, f.x, f.y, f.z, range, this.vehicle || this);
  }

  update(dt) {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.punchTime > 0) this.punchTime -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.dead) { this.sync(dt); return; }
    for (let i = 0; i < WEAPON_ORDER.length; i++) if (wasKeyPressed('Digit' + (i + 1))) this.selectWeapon(WEAPON_ORDER[i]);
    if (wasKeyPressed('KeyQ') || mouse.wheel < 0) this.cycleWeapon(-1);
    if (wasKeyPressed('KeyE') || mouse.wheel > 0) this.cycleWeapon(1);
    this.updateReload(dt);
    if (this.vehicle) this.updateDriving(dt); else this.updateOnFoot(dt);
    if (wasKeyPressed('KeyF')) this.useVehicleKey();
    this.sync(dt);
  }

  useVehicleKey() {
    if (this.vehicle) {
      if (Math.abs(this.vehicle.speed) < 9) exitVehicle(this);
      return;
    }
    const v = nearestEnterableVehicle(this);
    if (v) enterVehicle(this, v);
  }

  updateReload(dt) {
    const w = WEAPONS[this.current], slot = this.weapons[this.current];
    if (w.melee) return;
    if (this.reloadTime > 0) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) {
        const take = Math.min(w.clip - slot.clip, slot.ammo);
        slot.clip += take; slot.ammo -= take;
      }
      return;
    }
    const wantReload = (wasKeyPressed('KeyR') && !this.vehicle && slot.clip < w.clip) || slot.clip === 0;
    if (wantReload && slot.ammo > 0) { this.reloadTime = 1.15; playSound('reload'); }
  }

  updateOnFoot(dt) {
    const strafe = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const fwd = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -fz, rz = fx;
    let mx = fx * fwd + rx * strafe, mz = fz * fwd + rz * strafe;
    const len = Math.hypot(mx, mz);
    const armed = !WEAPONS[this.current].melee;
    this.aimHold -= dt;
    this.aiming = (mouse.right || this.aimHold > 0) && armed;
    let speed = 0;
    if (len > 0.01) {
      mx /= len; mz /= len;
      const sprinting = isKeyDown('ShiftLeft') || isKeyDown('ShiftRight');
      speed = this.aiming ? WALK : sprinting && this.stamina > 0.05 ? SPRINT : isKeyDown('AltLeft') ? WALK : JOG;
      if (speed === SPRINT) this.stamina = Math.max(0, this.stamina - dt * 0.11); else this.stamina = Math.min(1, this.stamina + dt * 0.16);
      this.pos.x += mx * speed * dt; this.pos.z += mz * speed * dt;
      if (!this.aiming) this.heading = dampAngle(this.heading, headingTo(mx, mz), 12, dt);
    } else this.stamina = Math.min(1, this.stamina + dt * 0.25);
    if (this.aiming) this.heading = dampAngle(this.heading, cam.yaw, 18, dt);
    this.vx = mx * speed; this.vz = mz * speed;
    this.moveSpeed = speed;

    // jumping
    const ground = groundHeight(this.pos.x, this.pos.z);
    if (this.grounded && wasKeyPressed('Space')) { this.vy = 5.6; this.grounded = false; playSound('step'); }
    if (!this.grounded) {
      this.vy -= 17 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.grounded = true; this.vy = 0; spawnDust(this.pos.x, ground + 0.1, this.pos.z, 2); }
    } else this.pos.y = ground;

    collideCircle(this.pos, 0.36);
    clampToIsland(this.pos, 0.8);
    if (this.grounded) pushOutOfVehicles(this.pos, 0.36);
    this.checkRunOver();

    if (speed > 0 && this.grounded) {
      this.stepClock -= dt * speed;
      if (this.stepClock <= 0) { this.stepClock = 1.9; playSound('step', null, null, speed > 5 ? 1 : 0.6); }
    }

    // fighting
    const w = WEAPONS[this.current];
    const trigger = w.auto || w.melee ? mouse.left : wasKeyPressed('MouseLeft') || (mouse.left && this.fireCooldown <= -0.12);
    if (trigger && this.fireCooldown <= 0 && game.mode === 'play') {
      if (w.melee) {
        this.fireCooldown = w.rate; this.punchTime = 0.3;
        meleeAttack(this, this.heading);
      } else this.fireGun(w);
    }
    this.anim = !this.grounded ? 'run' : this.punchTime > 0 ? 'punch' : this.aiming ? 'aim' : speed > 5 ? 'run' : speed > 0 ? 'walk' : 'idle';
    showGun(this.body, armed ? w.model : null);
  }

  fireGun(w) {
    const slot = this.weapons[this.current];
    if (this.reloadTime > 0) return;
    if (slot.clip <= 0) { this.fireCooldown = 0.3; playSound('empty'); return; }
    slot.clip--;
    this.fireCooldown = w.rate;
    this.aimHold = 1.1;
    const aim = this.aimPoint(w.range + 20);
    let ox, oy, oz;
    if (this.vehicle) {
      const side = this.vehicle.localToWorld(this.vehicle.type.wid / 2 + 0.25, 0.2, { x: 0, z: 0 });
      ox = side.x; oz = side.z; oy = this.vehicle.pos.y + 1.25;
    } else {
      this.heading = cam.yaw;
      ox = this.pos.x + Math.sin(cam.yaw) * 0.55 - Math.cos(cam.yaw) * 0.25;
      oz = this.pos.z + Math.cos(cam.yaw) * 0.55 + Math.sin(cam.yaw) * 0.25;
      oy = this.pos.y + 1.42;
    }
    let dx = aim.x - ox, dy = aim.y - oy, dz = aim.z - oz;
    const len = Math.hypot(dx, dy, dz) || 1;
    fireWeapon(this, this.current, ox, oy, oz, dx / len, dy / len, dz / len, this.aiming ? 0 : 0.012);
    cam.pitch -= 0.004 + Math.random() * 0.004; // recoil
  }

  updateDriving(dt) {
    const v = this.vehicle;
    if (v.destroyed) { exitVehicle(this); this.takeDamage(35); return; }
    v.input.throttle = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    v.input.steer = -axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    v.input.handbrake = isKeyDown('Space');
    v.input.brake = 0;
    if (game.flags.freezeDriving) { v.input.throttle = 0; v.input.brake = 1; } // held on the start line
    if (wasKeyPressed('KeyH')) { playSound('horn', v.pos.x, v.pos.z); emitEvent('horn', { x: v.pos.x, z: v.pos.z, vehicle: v }); }
    this.pos.copy(v.pos);
    this.heading = v.heading;
    this.vx = v.vx; this.vz = v.vz;
    game.stats.distance += Math.abs(v.speed) * dt;
    // drive-by: one-handed guns only
    if (WEAPONS[this.current].melee || this.current === 'shotgun' || this.current === 'rifle' || this.current === 'launcher') {
      if (mouse.left && this.weapons.smg && wasKeyPressed('MouseLeft')) this.selectWeapon('smg');
      else if (mouse.left && this.weapons.pistol && wasKeyPressed('MouseLeft')) this.selectWeapon('pistol');
    }
    const w = WEAPONS[this.current];
    if (!w.melee && (this.current === 'pistol' || this.current === 'smg') && mouse.left && this.fireCooldown <= 0 && game.mode === 'play') this.fireGun(w);
  }

  checkRunOver() {
    for (const v of game.vehicles) {
      const speed = Math.hypot(v.vx, v.vz);
      if (speed < 4 || v.driver === 'player') continue;
      const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
      if (dx * dx + dz * dz > (v.radius + 0.7) * (v.radius + 0.7)) continue;
      const l = v.worldToLocal(this.pos.x, this.pos.z, { x: 0, z: 0 });
      if (Math.abs(l.x) < v.type.wid / 2 + 0.5 && Math.abs(l.z) < v.type.len / 2 + 0.55 && this.hurtFlash <= 0) {
        this.takeDamage((speed - 3) * 4);
        this.pos.x += v.vx * 0.12; this.pos.z += v.vz * 0.12;
        playSound('thud', this.pos.x, this.pos.z);
      }
    }
  }

  sync(dt) {
    const r = this.body.root;
    r.position.copy(this.pos);
    r.rotation.y = this.heading;
    animateHumanoid(this.body, this.anim, dt, this.moveSpeed, 1 - this.punchTime / 0.3);
  }

  ammoText() {
    const w = WEAPONS[this.current];
    if (w.melee) return '';
    const s = this.weapons[this.current];
    return s.clip + ' / ' + s.ammo;
  }
}

const DEZ_LOOK = { skin: 0xc68642, shirt: 0xffb81c, pants: 0x23304d, hair: 0x15100a, shades: true, shoes: 0xf5f5f5 };
const WALK = 2.3, JOG = 4.6, SPRINT = 7.4; // metres per second
