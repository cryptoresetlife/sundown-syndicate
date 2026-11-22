// A police chase down Tidewater Drive, driven with the real keys: logs how the pursuit develops
// (units, distance of the nearest cruiser, car health) and saves a frame every couple of seconds.
//   node tools/play.mjs tools/scenarios/chase.mjs [stars=3] [clock=14]
export default async function (b, t) {
  const stars = Number(t.args.stars || 3);
  await t.newGame('&clock=' + (t.args.clock || 14));
  await t.js(`s.warp(798.2, 40, 0); s.drive('marlin', 0xe63946); s.wanted(${stars});`);
  const report = () => t.js(`const cops = g.vehicles.filter((v) => v.type.police && v.driver && v.driver !== 'player');
    const d = cops.map((v) => Math.round(Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z))).sort((a, b) => a - b);
    return { t: +g.time.toFixed(1), z: Math.round(p.pos.z), kmh: Math.round(p.vehicle ? p.vehicle.kmh : 0), carHp: p.vehicle ? Math.round(p.vehicle.health) : 0, hp: Math.round(p.health), stars: document.querySelectorAll('#h-stars .lit').length, copCars: d, officers: g.npcs.filter((n) => n.role === 'cop' && !n.dead).length };`);
  for (let i = 0; i < 9; i++) {
    await b.hold(['KeyW'], 1800);
    console.log(JSON.stringify(await report()));
    await t.shot('chase-' + i);
    if (i === 4) {
      // look back over the shoulder with a right-button drag
      await b.mouse('mouseMoved', 400, 360);
      await b.mouse('mousePressed', 400, 360, 'right', 2);
      for (let k = 1; k <= 10; k++) await b.mouse('mouseMoved', 400 + k * 100, 360 + k * 3, 'right', 2);
      await b.mouse('mouseReleased', 1400, 390, 'right', 0);
      await t.sleep(120);
      await t.shot('chase-lookback');
    }
  }
  // stop and see whether they box the player in and make the arrest
  await b.hold(['KeyS'], 1500);
  await t.gameSeconds(7);
  console.log('stopped', JSON.stringify(await report()), (await t.facts()).mode);
  await t.shot('chase-stopped');
}
