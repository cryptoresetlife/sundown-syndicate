// Soak test: several minutes of game time at four times speed, with the player driving around
// under a five-star response, through a full day and night, to shake out exceptions and leaks.
export default async function (b, t) {
  await t.newGame();
  await t.js('s.god(true); g.debug.fastForward = 4; s.arm(); s.warp(400, 324, Math.PI / 2); s.drive("rancho")');
  const keys = [['KeyW'], ['KeyW', 'KeyA'], ['KeyW'], ['KeyW', 'KeyD'], ['KeyS'], ['KeyW', 'Space', 'KeyA']];
  for (let i = 0; i < 24; i++) {
    if (i === 2) await t.js('s.wanted(5)');
    if (i === 12) await t.js('s.wanted(0); s.clock(22, false)');
    if (i === 14) { await t.js('s.onFoot(); p.selectWeapon("rifle"); s.wanted(4)'); }
    if (i === 20) await t.js('s.drive("vanta"); s.wanted(2)');
    await b.hold(keys[i % keys.length], 1500);
    if (i % 4 === 3) {
      const f = await t.facts();
      const extra = await t.js('return { police: g.vehicles.filter((v) => v.type.police).length, particles: g.scene.children.length, pickups: g.pickups.length, clock: g.clock.toFixed(1), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0 }');
      console.log(JSON.stringify({ t: f.t, pos: f.pos, car: f.car, vehicles: f.vehicles, npcs: f.npcs, cops: f.cops, ...extra }));
    }
  }
  await t.shot('soak-night');
}
