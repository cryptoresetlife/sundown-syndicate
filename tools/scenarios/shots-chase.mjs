// Screenshot run 1, the police chase: chapter 2 ("Borrowed Time") is played to the point where the
// stolen Marlin GT is on the seafront with the police after it, then the car is driven down
// Tidewater Drive with the real keys while frames are captured from the chase camera at several
// orbit angles. Pick the best frame by eye afterwards.
//   node tools/play.mjs tools/scenarios/shots-chase.mjs [clock=9.6] [stars=3] [z=120] [frames=14]
export default async function (b, t) {
  const stars = Number(t.args.stars || 3), frames = Number(t.args.frames || 14);
  await t.newGame('&clock=' + (t.args.clock || 9.6));
  await t.js('s.god(true); g.debug.trafficDensity = 1.5; g.debug.pedDensity = 1.5; g.money = 4820; s.progress(1);');
  // let the Ocean Strip fill with traffic and people before the job starts
  await t.js(`s.warp(808, ${Number(t.args.z || 120) + 40}, 0)`);
  await t.gameSeconds(14);
  await t.js('s.chapter(2, true)');
  await t.js('const car = s.mission.ctx.vars.car; const d = car.doorPosition(); s.warp(d.x, d.z, 0); p.giveWeapon("pistol", 48);');
  await b.press('KeyF');
  await t.gameSeconds(0.4);
  console.log('stolen:', (await t.facts()).mission);
  await t.js(`const v = p.vehicle; v.invulnerable = true; s.warp(798.2, ${Number(t.args.z || 120)}, 0); s.wanted(${stars});`);
  const status = () => t.js(`const cops = g.vehicles.filter((v) => v.type.police && v.driver && v.driver !== 'player').map((v) => Math.round(Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z))).sort((a, b) => a - b);
    return { z: Math.round(p.pos.z), kmh: Math.round(p.vehicle.kmh), cops, officers: g.npcs.filter((n) => n.role === 'cop' && !n.dead).length, seen: document.getElementById('h-siren').className, objective: s.mission.objective };`);
  const angles = [[0, 0.2], [0.55, 0.17], [-0.6, 0.17], [2.5, 0.12], [-2.55, 0.12], [1.2, 0.14]];
  let n = 0;
  for (let i = 0; i < frames; i++) {
    // feather the throttle so the cruisers can keep up: roughly 70 to 100 km/h
    const st = await status();
    await b.hold(st.kmh > 95 ? [] : ['KeyW'], 700);
    if (st.cops.length && st.cops[0] < 60) {
      for (const [yaw, pitch] of angles) {
        await t.js(`s.cam.yaw = p.vehicle.heading + ${yaw}; s.cam.pitch = ${pitch}; s.cam.orbitHold = 0;`);
        await t.sleep(90);
        await t.shot(`chase-${String(n).padStart(2, '0')}-a${angles.findIndex((a) => a[0] === yaw)}`);
      }
      n++;
    }
    console.log(i, JSON.stringify(st));
    if (st.z > 730) await t.js(`s.warp(798.2, 60, 0)`);
  }
}
