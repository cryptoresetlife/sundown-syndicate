// AI drivers. LaneDriver keeps to its lane, obeys traffic lights and brakes for whatever is ahead;
// ChaseDriver hunts a target through the street grid; RouteDriver races through checkpoints.
import { game } from '../core/state.js';
import { clamp, wrapAngle, headingTo, rand } from '../core/mathutil.js';
import { sightBlocked } from '../core/collision.js';
import { BLOCK, ROAD_HALF } from '../world/layout.js';
import { exitsOf, lanePoint, lightState, nearestNode, findRoute, nodePos } from '../world/roads.js';

/** Sets the vehicle's controls to head for (tx, tz) at the wanted speed. Returns the heading error. */
export function steerToward(vehicle, tx, tz, wantSpeed, dt, state) {
  const want = headingTo(tx - vehicle.pos.x, tz - vehicle.pos.z);
  const err = wrapAngle(want - vehicle.heading);
  const inp = vehicle.input;
  // stuck against something: back out with the wheel turned the other way
  if (state) {
    if (state.reverse > 0) {
      state.reverse -= dt;
      inp.throttle = -1; inp.brake = 0; inp.handbrake = false;
      inp.steer = -Math.sign(err || 1);
      return err;
    }
    if (wantSpeed > 2 && Math.abs(vehicle.speed) < 0.8) state.stuck = (state.stuck || 0) + dt; else state.stuck = 0;
    if (state.stuck > 1.4) { state.stuck = 0; state.reverse = 1.3; }
  }
  inp.steer = clamp(err * 2.2, -1, 1);
  const cornering = Math.abs(err) > 0.5 ? 0.55 : 1;
  const target = wantSpeed * cornering;
  if (vehicle.speed < target - 0.5) { inp.throttle = clamp((target - vehicle.speed) / 4, 0.25, 1); inp.brake = 0; }
  else if (vehicle.speed > target + 2) { inp.throttle = 0; inp.brake = clamp((vehicle.speed - target) / 6, 0.2, 1); }
  else { inp.throttle = 0.12; inp.brake = 0; }
  inp.handbrake = false;
  return err;
}

/** Distance to the nearest thing in the lane ahead of a vehicle: cars, people, the player. */
export function obstacleAhead(vehicle, range) {
  let best = range;
  const fx = vehicle.forwardX, fz = vehicle.forwardZ;
  const test = (x, z, extra) => {
    const dx = x - vehicle.pos.x, dz = z - vehicle.pos.z;
    const along = dx * fx + dz * fz;
    if (along < 1 || along > best + extra) return;
    const side = Math.abs(dx * fz - dz * fx);
    if (side < vehicle.type.wid / 2 + 0.9 + (extra > 0 ? 0.3 : 0)) best = Math.max(0, along - extra);
  };
  for (const v of game.vehicles) if (v !== vehicle) test(v.pos.x, v.pos.z, v.type.len / 2);
  for (const n of game.npcs) if (!n.dead && !n.inVehicle) test(n.pos.x, n.pos.z, 0);
  const p = game.player;
  if (p && !p.vehicle) test(p.pos.x, p.pos.z, 0);
  return best;
}

export class LaneDriver {
  /** Starts on the road from node (i, j) toward (i+di, j+dj). */
  constructor(vehicle, i, j, di, dj, lane = 0) {
    this.kind = 'traffic';
    this.vehicle = vehicle;
    this.i = i; this.j = j; this.di = di; this.dj = dj; this.lane = lane;
    this.cruise = rand.range(8.5, 13);
    this.panic = 0;
    this.obeyLights = true;
    this.next = null;
    this.state = {};
    this.honk = 0;
    this.plan = null; // optional fixed list of nodes to follow
  }

  chooseNext() {
    const ni = this.i + this.di, nj = this.j + this.dj;
    if (this.plan && this.plan.length) {
      const n = this.plan[0];
      if (n.i === ni && n.j === nj) this.plan.shift();
      const m = this.plan[0];
      if (m && Math.abs(m.i - ni) + Math.abs(m.j - nj) === 1) return { di: m.i - ni, dj: m.j - nj };
    }
    const exits = exitsOf(ni, nj).filter((e) => !(e.di === -this.di && e.dj === -this.dj));
    if (!exits.length) return { di: -this.di, dj: -this.dj };
    const straight = exits.find((e) => e.di === this.di && e.dj === this.dj);
    if (straight && rand.chance(0.6)) return straight;
    return rand.pick(exits);
  }

  update(dt) {
    const v = this.vehicle;
    const ex = (this.i + this.di) * BLOCK, ez = (this.j + this.dj) * BLOCK;
    // progress along this block, measured from the node we left
    const along = (v.pos.x - this.i * BLOCK) * this.di + (v.pos.z - this.j * BLOCK) * this.dj;
    if (!this.next) this.next = this.chooseNext();
    const stopAt = BLOCK - ROAD_HALF - 6.5;
    let speed = this.panic > 0 ? this.cruise * 2.1 : this.cruise;
    if (this.panic > 0) this.panic -= dt;
    let tx, tz;
    if (along > BLOCK - ROAD_HALF - 1) {
      // in the junction: aim into the next road's lane
      const p = lanePoint(this.i + this.di, this.j + this.dj, this.next.di, this.next.dj, ROAD_HALF + 5, this.lane);
      tx = p.x; tz = p.z;
      speed = Math.min(speed, this.next.di === this.di && this.next.dj === this.dj ? speed : 6.5);
      const into = (v.pos.x - ex) * this.next.di + (v.pos.z - ez) * this.next.dj;
      if (into > ROAD_HALF - 1) {
        this.i += this.di; this.j += this.dj;
        this.di = this.next.di; this.dj = this.next.dj;
        this.next = null;
      }
    } else {
      const look = clamp(6 + Math.abs(v.speed) * 0.7, 6, 16);
      const p = lanePoint(this.i, this.j, this.di, this.dj, Math.min(along + look, BLOCK - ROAD_HALF + 2), this.lane);
      tx = p.x; tz = p.z;
      const light = lightState(this.i + this.di, this.j + this.dj, this.di ? 'ew' : 'ns');
      const mustStop = this.obeyLights && this.panic <= 0 && (light === 'red' || (light === 'yellow' && along < stopAt - 8));
      if (mustStop && along < stopAt + 1.5) {
        const room = stopAt - along;
        speed = Math.min(speed, room < 1 ? 0 : Math.sqrt(2 * 5 * room));
      }
      if (!(this.next.di === this.di && this.next.dj === this.dj) && along > stopAt - 12) speed = Math.min(speed, 7);
    }
    const gap = obstacleAhead(v, 7 + Math.abs(v.speed) * 1.3);
    if (this.panic <= 0 || gap < 4) {
      const limit = gap < 3.5 ? 0 : Math.sqrt(2 * 6 * (gap - 3.5));
      if (limit < speed) { speed = limit; this.honk += dt; } else this.honk = 0;
    }
    steerToward(v, tx, tz, speed, dt, speed > 2 && gap > 5 ? this.state : null);
    if (speed <= 0.01) { v.input.throttle = 0; v.input.brake = 1; }
  }
}

export class ChaseDriver {
  /** getTarget() returns { x, z, vx, vz } of whatever is being hunted. */
  constructor(vehicle, getTarget, options = {}) {
    this.kind = options.kind || 'chase';
    this.vehicle = vehicle;
    this.getTarget = getTarget;
    this.topSpeed = options.topSpeed || vehicle.type.topSpeed;
    this.stopDistance = options.stopDistance || 0;
    this.ram = options.ram ?? true;
    this.state = {};
    this.think = 0;
    this.direct = false;
    this.waypoint = null;
    this.arrived = false;
  }

  update(dt) {
    const v = this.vehicle, t = this.getTarget();
    if (!t) { v.input.throttle = 0; v.input.brake = 1; return; }
    const dist = Math.hypot(t.x - v.pos.x, t.z - v.pos.z);
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.4 + Math.random() * 0.2;
      this.direct = dist < 130 && !sightBlocked(v.pos.x, v.pos.z, t.x, t.z, 1);
      if (!this.direct) {
        const from = nearestNode(v.pos.x, v.pos.z), to = nearestNode(t.x, t.z);
        const route = findRoute(from, to);
        let n = route[0] || to;
        const np = nodePos(n.i, n.j);
        if (route.length > 1 && Math.hypot(np.x - v.pos.x, np.z - v.pos.z) < 16) n = route[1];
        this.waypoint = nodePos(n.i, n.j);
      }
    }
    this.arrived = this.direct && dist < this.stopDistance;
    if (this.arrived) { v.input.throttle = 0; v.input.brake = 1; v.input.steer = 0; return; }
    let tx, tz, speed = this.topSpeed;
    if (this.direct) {
      const lead = clamp(dist / 30, 0, 1.2);
      tx = t.x + (t.vx || 0) * lead; tz = t.z + (t.vz || 0) * lead;
      if (this.stopDistance) speed = Math.min(speed, 4 + (dist - this.stopDistance) * 0.9);
      else if (!this.ram) speed = Math.min(speed, Math.hypot(t.vx || 0, t.vz || 0) + (dist - 9) * 0.8);
    } else if (this.waypoint) {
      tx = this.waypoint.x; tz = this.waypoint.z;
      const wd = Math.hypot(tx - v.pos.x, tz - v.pos.z);
      speed = Math.min(speed, 12 + wd * 0.35);
    } else { tx = t.x; tz = t.z; }
    const gap = obstacleAhead(v, 5 + Math.abs(v.speed) * 0.6);
    if (gap < 3 && !(this.direct && dist < 12)) speed = Math.min(speed, 3);
    steerToward(v, tx, tz, Math.max(speed, 0), dt, this.state);
  }
}

export class RouteDriver {
  /** Drives through a list of { x, z } points in order; `done` turns true after the last. */
  constructor(vehicle, points, speed, loop = false) {
    this.kind = 'route';
    this.vehicle = vehicle;
    this.points = points;
    this.index = 0;
    this.speed = speed;
    this.loop = loop;
    this.done = false;
    this.state = {};
    this.reach = 13;
  }

  update(dt) {
    const v = this.vehicle;
    if (this.done) { v.input.throttle = 0; v.input.brake = 1; return; }
    const p = this.points[this.index];
    const d = Math.hypot(p.x - v.pos.x, p.z - v.pos.z);
    if (d < this.reach) {
      this.index++;
      if (this.index >= this.points.length) { if (this.loop) this.index = 0; else { this.done = true; return; } }
    }
    const next = this.points[this.index];
    const nd = Math.hypot(next.x - v.pos.x, next.z - v.pos.z);
    const speed = Math.min(typeof this.speed === 'function' ? this.speed() : this.speed, 9 + nd * 0.55);
    steerToward(v, next.x, next.z, speed, dt, this.state);
  }
}
