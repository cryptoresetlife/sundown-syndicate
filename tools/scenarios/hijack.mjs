// Checks carjacking: stand at the door of a moving traffic car, press F, and expect to be driving
// it with its former driver on the street and (given witnesses) the police interested.
export default async function (b, t) {
  await t.newGame();
  await t.gameSeconds(3);
  const before = await t.js(`let best = null, bd = 1e9; for (const v of g.vehicles) { if (!v.driver || v.driver === 'player' || v.driver.kind !== 'traffic' || v.type.police) continue; const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z); if (d < bd) { bd = d; best = v; } }
    const door = best.doorPosition(); s.warp(door.x, door.z, best.heading); window.victimCar = best;
    return { type: best.type.name, speed: best.speed.toFixed(1), door: [door.x.toFixed(1), door.z.toFixed(1)], car: [best.pos.x.toFixed(1), best.pos.z.toFixed(1)] };`);
  await b.press('KeyF', 40);
  await t.sleep(400);
  console.log('target', before);
  console.log('after F', await t.facts(), await t.js('return { driving: p.vehicle === window.victimCar, npcsNear: g.npcs.filter((n) => n.distanceTo(p.pos.x, p.pos.z) < 6).map((n) => n.role + ":" + n.mem.state), heat: s.game.vehicles.length }'));
  await t.shot('hijack');
  await b.hold(['KeyW'], 3000);
  await b.hold(['KeyW', 'KeyD'], 900);
  await b.hold(['KeyW'], 2500);
  await t.shot('hijack-drive');
  console.log('drove', await t.facts());
}
