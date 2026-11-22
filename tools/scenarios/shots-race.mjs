// Screenshot run 3, a street race at dusk: chapter 6 ("Neon Run") from Juno's Marlin on the start
// line through the first checkpoints, driven with the real keys, frames captured along the way.
//   node tools/play.mjs tools/scenarios/shots-race.mjs [clock=18.3] [frames=14]
export default async function (b, t) {
  const frames = Number(t.args.frames || 14);
  await t.newGame('&clock=' + (t.args.clock || 18.3));
  await t.js('s.god(true); g.debug.trafficDensity = 1.3; g.debug.pedDensity = 1.4; g.money = 18450; s.progress(5); s.arm(); s.warp(712, 150, 0);');
  await t.gameSeconds(10);
  await t.js('s.chapter(6, true)');
  await t.js('const car = s.mission.ctx.vars.car; const d = car.doorPosition(); s.warp(d.x, d.z, 0);');
  await b.press('KeyF');
  await t.gameSeconds(0.4);
  await t.js('p.vehicle.invulnerable = true; s.warp(716.5, 196, 0)');
  await t.gameSeconds(1.5);
  console.log('on the grid:', (await t.facts()).mission);
  for (let i = 0; i < 6; i++) { await t.sleep(700); await t.shot('race-grid-' + i); }
  for (let i = 0; i < frames; i++) {
    await b.hold(['KeyW'], 650);
    await t.shot('race-' + String(i).padStart(2, '0'));
    console.log(i, JSON.stringify(await t.js('return { z: Math.round(p.pos.z), kmh: Math.round(p.vehicle.kmh), info: s.mission.info }')));
  }
}
