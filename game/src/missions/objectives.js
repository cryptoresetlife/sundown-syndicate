// Objective builders: the kinds of step a mission is assembled from. story.js and activities.js
// string these together; the mission engine in missions.js enters, updates and exits each in turn.
import { game } from '../core/state.js';
import { BLOCK } from '../world/layout.js';
import { addMarker, removeMarker, playerInMarker } from '../world/markers.js';
import { RouteDriver } from '../vehicles/driver.js';
import { wanted } from '../police/wanted.js';
import { say, isTalking } from './dialogue.js';
import { playSound } from '../audio/sound.js';
import { mission, failMission } from './missions.js';

export { goTo, getIn, eliminate, wreck, pickUp, loseCops, race, talk, custom };

const at = (getPos, ctx) => (typeof getPos === 'function' ? getPos(ctx) : getPos);

/** Reach a place. opts: { vehicle: ctx => Vehicle (must be driving it), anyVehicle, onFoot, stop, radius, label, color } */
function goTo(getPos, text, opts = {}) {
  const step = {
    text,
    enter(ctx) {
      const pos = at(getPos, ctx);
      step.marker = addMarker({ x: pos.x, z: pos.z, color: opts.color ?? 0xffe14a, radius: opts.radius ?? 3.2, label: opts.label || '', kind: 'objective' });
    },
    update(ctx) {
      const p = game.player;
      if (!playerInMarker(step.marker)) return false;
      if (opts.vehicle && p.vehicle !== opts.vehicle(ctx)) return false;
      if (opts.anyVehicle && !p.vehicle) return false;
      if (opts.onFoot && p.vehicle) return false;
      if (opts.stop && p.vehicle && Math.abs(p.vehicle.speed) > 2.5) return false;
      return true;
    },
  };
  return step;
}

/** Get behind the wheel of a particular vehicle. */
function getIn(getVehicle, text) {
  const step = {
    text,
    enter(ctx) { step.marker = addMarker({ follow: getVehicle(ctx), color: 0x4db8ff, ring: false, label: '▼', kind: 'objective' }); },
    update(ctx) { return game.player.vehicle === getVehicle(ctx); },
  };
  return step;
}

/** Kill every listed enemy; each gets a red blip. */
function eliminate(getTargets, text) {
  const step = {
    text,
    enter(ctx) {
      step.targets = getTargets(ctx);
      step.blips = step.targets.map((n) => ctx.marker({ follow: n, color: 0xff3a3a, ring: false, beam: false, label: '▼', kind: 'enemy' }));
    },
    update() {
      let left = 0;
      step.targets.forEach((n, i) => { if (n.dead || n.removed) { removeMarker(step.blips[i]); } else left++; });
      mission.info = left ? 'Targets left: ' + left : '';
      return left === 0;
    },
    exit() { mission.info = ''; },
  };
  return step;
}

/** Destroy a vehicle. */
function wreck(getVehicle, text) {
  const step = {
    text,
    enter(ctx) { step.marker = addMarker({ follow: getVehicle(ctx), color: 0xff3a3a, ring: false, label: '▼', kind: 'enemy' }); },
    update(ctx) {
      const v = getVehicle(ctx);
      mission.meter = { label: 'TARGET', value: v.health / v.type.health, color: '#ff4a4a' };
      return v.destroyed;
    },
    exit() { mission.meter = null; },
  };
  return step;
}

/** Pick up a mission item (a pickup created by the mission, found through getPickup). */
function pickUp(getPickup, text) {
  const step = {
    text,
    enter(ctx) { const p = getPickup(ctx); step.pickup = p; step.marker = addMarker({ x: p.x, z: p.z, color: 0x4dff9a, radius: 1.6, label: '$', kind: 'objective' }); },
    update() { return !game.pickups.includes(step.pickup); },
  };
  return step;
}

/** Shake the wanted level. */
function loseCops(text = 'Lose the cops') {
  return {
    text,
    enter() { game.flags.wantedLocked = false; },
    update() { mission.info = wanted.stars > 0 ? (wanted.seen ? 'They can see you' : 'Stay out of sight…') : ''; return wanted.stars === 0; },
    exit() { mission.info = ''; },
  };
}

/** Wait for the current dialogue to finish (optionally speaking first). */
function talk(lines) {
  return { enter(ctx) { if (lines) say(typeof lines === 'function' ? lines(ctx) : lines); }, update() { return !isTalking(); } };
}

/** A one-off step written out by the mission itself: { text, enter, update, exit }. */
function custom(def) { return def; }

/**
 * A street race through intersections. opts: { nodes: [[i, j], ...], rivals: [{ type, paint, pace }], text }
 * The player must already be in a vehicle at the first node; rivals line up alongside.
 */
function race(opts) {
  const step = {
    text: opts.text || 'Win the race',
    enter(ctx) {
      const p = game.player, v = p.vehicle;
      const cps = opts.nodes.map(([i, j]) => ({ x: i * BLOCK, z: j * BLOCK }));
      const r = { cps, index: 0, rivals: [], countdown: 3.99, finished: 0, place: 0, time: 0 };
      step.race = r;
      opts.rivals.forEach((spec, k) => {
        const side = k % 2 ? -1 : 1, row = Math.floor(k / 2);
        const w = v.localToWorld(side * 3.6 * (row + 1), row * -1.5 + 1, { x: 0, z: 0 });
        const car = ctx.vehicle(spec.type, w.x, w.z, v.heading, spec.paint);
        const drv = new RouteDriver(car, cps, () => {
          // rubber band: ease off when far ahead, push when behind
          const gap = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
          const ahead = drv.index > r.index || (drv.index === r.index && gap > 30);
          return car.type.topSpeed * spec.pace * (ahead ? 0.86 : 1.04);
        });
        car.driver = { kind: 'racer', update(dt) { if (r.countdown > 0) { car.input.throttle = 0; car.input.brake = 1; } else drv.update(dt); } };
        r.rivals.push({ car, drv, place: 0 });
      });
      game.flags.freezeDriving = true;
      step.marker = addMarker({ x: cps[0].x, z: cps[0].z, color: 0x4dff9a, radius: 6, label: '1', kind: 'race' });
      step.nextMarker = cps[1] ? addMarker({ x: cps[1].x, z: cps[1].z, color: 0x2a8f58, radius: 4, beam: false, kind: 'race', hideOnMap: true }) : null;
    },
    update(ctx, dt) {
      const r = step.race, p = game.player;
      if (!p.vehicle) { failMission('You left your car'); return false; }
      if (r.countdown > 0) {
        const before = Math.floor(r.countdown);
        r.countdown -= dt;
        const now = Math.floor(r.countdown);
        if (now !== before || !mission.banner) {
          mission.banner = { kind: 'count', title: r.countdown > 0 ? String(Math.ceil(r.countdown)) : 'GO!', sub: '', time: 1.05 };
          playSound(r.countdown > 0 ? 'ui' : 'checkpoint');
        }
        if (r.countdown <= 0) game.flags.freezeDriving = false;
        return false;
      }
      r.time += dt;
      for (const rv of r.rivals) if (rv.drv.done && !rv.place) rv.place = ++r.finished;
      const cp = r.cps[r.index];
      if (Math.hypot(p.pos.x - cp.x, p.pos.z - cp.z) < 15) {
        r.index++;
        playSound('checkpoint');
        if (r.index >= r.cps.length) {
          r.place = ++r.finished;
          if (r.place > 1) { failMission('You finished ' + ['', '1st', '2nd', '3rd', '4th', '5th'][r.place] + ' — only first place pays'); return false; }
          game.stats.racesWon++;
          return true;
        }
        removeMarker(step.marker); if (step.nextMarker) removeMarker(step.nextMarker);
        const a = r.cps[r.index], b = r.cps[r.index + 1];
        step.marker = addMarker({ x: a.x, z: a.z, color: 0x4dff9a, radius: 6, label: r.index === r.cps.length - 1 ? '⚑' : String(r.index + 1), kind: 'race' });
        step.nextMarker = b ? addMarker({ x: b.x, z: b.z, color: 0x2a8f58, radius: 4, beam: false, kind: 'race', hideOnMap: true }) : null;
      }
      // position: count rivals further along the route
      let rank = 1;
      const myLeft = Math.hypot(p.pos.x - r.cps[r.index].x, p.pos.z - r.cps[r.index].z);
      for (const rv of r.rivals) {
        if (rv.place) { rank++; continue; }
        const c = r.cps[Math.min(rv.drv.index, r.cps.length - 1)];
        const left = Math.hypot(rv.car.pos.x - c.x, rv.car.pos.z - c.z);
        if (rv.drv.index > r.index || (rv.drv.index === r.index && left < myLeft)) rank++;
      }
      mission.info = 'POSITION ' + rank + ' / ' + (r.rivals.length + 1) + '   ·   CHECKPOINT ' + r.index + ' / ' + r.cps.length;
      return false;
    },
    exit() { if (step.nextMarker) removeMarker(step.nextMarker); mission.info = ''; game.flags.freezeDriving = false; },
  };
  return step;
}
