// Npc: the body and reflexes every non-player person shares (walking with collision, taking hits,
// being run over, shooting, dying). Pedestrians, police and gangsters each plug in their own brain.
import * as THREE from '../../vendor/three.module.min.js';
import { game, emitEvent } from '../core/state.js';
import { headingTo, dampAngle, wrapAngle } from '../core/mathutil.js';
import { collideCircle, clampToIsland, sightBlocked } from '../core/collision.js';
import { groundHeight } from '../world/layout.js';
import { createHumanoid, animateHumanoid, showGun } from './humanoid.js';
import { WEAPONS, fireWeapon, meleeAttack } from '../combat/weapons.js';
import { pushOutOfVehicles } from '../vehicles/collisions.js';
import { playSound } from '../audio/sound.js';

export class Npc {
  constructor({ x, z, heading = 0, look, role = 'civilian', health = 60, weapon = null, brain = null, accuracy = 0.06, name = null }) {
    this.role = role; // civilian | cop | gang | guard | ally | target
    this.name = name;
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.heading = heading;
    this.health = health; this.maxHealth = health;
    this.weapon = weapon;
    this.accuracy = accuracy;
    this.brain = brain;
    this.body = createHumanoid(look);
    this.look = look;
    this.anim = 'idle';
    this.moveSpeed = 0;
    this.dead = false; this.deadTime = 0;
    this.knock = null; // { vx, vy, vz, time } while flying or lying stunned
    this.fireCooldown = Math.random();
    this.burst = 0;
    this.punchTime = 0;
    this.inVehicle = null;
    this.mem = {}; // the brain's own notes
    this.hostileToPlayer = false;
    this.persistent = false; // mission characters are never despawned by distance
    this.seesPlayer = false; this.sightClock = Math.random() * 0.5;
    showGun(this.body, weapon ? WEAPONS[weapon].model : null);
    game.scene.add(this.body.root);
    game.npcs.push(this);
    this.sync(0);
  }

  distanceTo(x, z) { return Math.hypot(this.pos.x - x, this.pos.z - z); }

  /** Walks or runs toward a point, sliding along walls. Returns the distance left. */
  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { this.moveSpeed = 0; return d; }
    this.heading = dampAngle(this.heading, headingTo(dx, dz), 10, dt);
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
    this.moveSpeed = speed;
    this.anim = speed > 3.2 ? 'run' : 'walk';
    return d - step;
  }

  faceToward(x, z, dt, rate = 8) {
    this.heading = dampAngle(this.heading, headingTo(x - this.pos.x, z - this.pos.z), rate, dt);
  }

  canSee(target, range) {
    const d = this.distanceTo(target.pos.x, target.pos.z);
    return d < range && !sightBlocked(this.pos.x, this.pos.z, target.pos.x, target.pos.z);
  }

  /** Aims and fires bursts at a target (the player, an Npc or a vehicle). */
  shootAt(target, dt) {
    const w = WEAPONS[this.weapon];
    this.faceToward(target.pos.x, target.pos.z, dt, 12);
    this.anim = 'aim';
    this.moveSpeed = 0;
    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    const aimErr = Math.abs(wrapAngle(headingTo(target.pos.x - this.pos.x, target.pos.z - this.pos.z) - this.heading));
    if (aimErr > 0.3) return;
    if (this.burst <= 0) { this.burst = w.auto ? 3 + Math.floor(Math.random() * 4) : 1; }
    this.burst--;
    this.fireCooldown = this.burst > 0 ? w.rate : w.rate + 0.5 + Math.random() * 0.9;
    const ox = this.pos.x + Math.sin(this.heading) * 0.6, oz = this.pos.z + Math.cos(this.heading) * 0.6, oy = this.pos.y + 1.4;
    const ty = target.pos.y + (target.type ? 0.8 : 1.15);
    let dx = target.pos.x - ox, dy = ty - oy, dz = target.pos.z - oz;
    const len = Math.hypot(dx, dy, dz) || 1;
    // a moving target is harder to hit
    const tv = target.vehicle || target;
    const moving = Math.hypot(tv.vx || 0, tv.vz || 0) * 0.004;
    fireWeapon(this, this.weapon, ox, oy, oz, dx / len, dy / len, dz / len, this.accuracy + moving);
  }

  punch(target, dt) {
    this.faceToward(target.pos.x, target.pos.z, dt, 12);
    this.fireCooldown -= dt;
    this.anim = this.punchTime > 0 ? 'punch' : 'idle';
    if (this.fireCooldown > 0) return;
    this.fireCooldown = 0.9 + Math.random() * 0.5;
    this.punchTime = 0.35;
    meleeAttack(this, this.heading, 1.8, 9);
  }

  takeDamage(amount, attacker = null, info = {}) {
    if (this.dead || this.invulnerable) return;
    if (this.armor) amount *= 0.55;
    this.health -= amount;
    this.lastAttacker = attacker;
    emitEvent('npcHurt', { npc: this, attacker, amount, info });
    if (info.knock) this.knock = { vx: info.knock.x, vy: info.knock.y ?? 2.5, vz: info.knock.z, time: info.stun ?? 1.2 };
    if (this.health <= 0) this.die(attacker);
    else if (!info.knock) playSound('grunt', this.pos.x, this.pos.z);
  }

  die(attacker = null) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.anim = 'down';
    showGun(this.body, null);
    emitEvent('npcKilled', { npc: this, attacker });
  }

  /** Thrown from a moving car's bonnet. */
  hitByVehicle(v) {
    const speed = Math.hypot(v.vx, v.vz);
    const attacker = v.driver === 'player' ? game.player : null;
    this.takeDamage((speed - 2.5) * 6.5, attacker, { knock: { x: v.vx * 0.9, y: 2 + speed * 0.22, z: v.vz * 0.9 }, stun: 2.2, vehicle: v });
    v.vx *= 0.96; v.vz *= 0.96;
    playSound('thud', this.pos.x, this.pos.z);
  }

  update(dt) {
    if (this.inVehicle) { this.body.root.visible = false; if (!this.dead && this.brain) this.brain(this, dt); return; }
    this.body.root.visible = true;
    if (this.punchTime > 0) this.punchTime -= dt;
    if (this.knock) {
      const k = this.knock;
      this.pos.x += k.vx * dt; this.pos.z += k.vz * dt; this.pos.y += k.vy * dt;
      k.vy -= 18 * dt;
      const ground = groundHeight(this.pos.x, this.pos.z);
      if (this.pos.y <= ground) { this.pos.y = ground; k.vy = 0; k.vx *= Math.exp(-6 * dt); k.vz *= Math.exp(-6 * dt); k.time -= dt; }
      collideCircle(this.pos, 0.35);
      this.anim = 'down';
      if (k.time <= 0 && !this.dead) this.knock = null;
      if (this.dead && k.time <= 0) this.knock = null;
    } else if (this.dead) {
      this.deadTime += dt;
      this.anim = 'down';
    } else {
      this.anim = 'idle'; this.moveSpeed = 0;
      this.sightClock -= dt;
      if (this.sightClock <= 0 && game.player) {
        this.sightClock = 0.3 + Math.random() * 0.2;
        this.seesPlayer = this.canSee(game.player, 85);
      }
      if (this.brain) this.brain(this, dt);
      collideCircle(this.pos, 0.35);
      clampToIsland(this.pos, 0.6);
      const near = game.player && this.distanceTo(game.player.pos.x, game.player.pos.z) < 70;
      if (near) pushOutOfVehicles(this.pos, 0.3);
      this.pos.y = groundHeight(this.pos.x, this.pos.z);
      // run over?
      for (const v of game.vehicles) {
        if (Math.abs(v.speed) < 3.2 && Math.abs(v.slip) < 3.2) continue;
        const dx = this.pos.x - v.pos.x, dz = this.pos.z - v.pos.z;
        if (dx * dx + dz * dz > (v.radius + 0.6) * (v.radius + 0.6)) continue;
        const l = v.worldToLocal(this.pos.x, this.pos.z, { x: 0, z: 0 });
        if (Math.abs(l.x) < v.type.wid / 2 + 0.45 && Math.abs(l.z) < v.type.len / 2 + 0.5) { this.hitByVehicle(v); break; }
      }
    }
    this.sync(dt);
  }

  sync(dt) {
    const r = this.body.root;
    r.position.copy(this.pos);
    r.rotation.y = this.heading;
    animateHumanoid(this.body, this.anim, dt, this.moveSpeed, 1 - this.punchTime / 0.35);
  }

  remove() {
    game.scene.remove(this.body.root);
    const i = game.npcs.indexOf(this);
    if (i >= 0) game.npcs.splice(i, 1);
    this.removed = true;
  }
}

/** Removes every Npc for which keep(npc) is false (used when missions end and on respawn). */
export function removeNpcs(shouldRemove) {
  for (const n of [...game.npcs]) if (shouldRemove(n)) n.remove();
}
