// Screenshot run 1, the police chase: chapter 2 ("Borrowed Time") is played to the point where the
// stolen Marlin GT is on the seafront with the police after it, then the car is driven down
// Tidewater Drive with the real keys (W to accelerate, A and D to hold the lane) while frames are
// captured from the chase camera at several orbit angles. Pick the best frame by eye afterwards.
//   node tools/play.mjs tools/scenarios/shots-chase.mjs [clock=9.6] [stars=3] [z=90] [frames=30] [lane=798.2] [lo=58] [hi=68] [near=22]
export default async function (b, t) {
  const stars = Number(t.args.stars || 3), frames = Number(t.args.frames || 30), lane = Number(t.args.lane || 798.2);
  const startZ = Number(t.args.z || 90), lo = Number(t.args.lo || 58), hi = Number(t.args.hi || 68);
  await t.newGame('&clock=' + (t.args.clock || 9.6));
  await t.js('s.god(true); g.debug.trafficDensity = 1.5; g.debug.pedDensity = 1.5; g.money = 4820; s.progress(1); p.giveWeapon("pistol", 48); p.selectWeapon("pistol");');
  // let the Ocean Strip fill with traffic and people before the job starts
  await t.js(`s.warp(808, ${startZ + 60}, 0)`);
  await t.gameSeconds(26);
  // chapter 2: reach the club, take the car (the mission sets the alarm off), then out onto the seafront
  await t.js('s.chapter(2, true)');
  await t.js('const m = s.mission.active.steps[0].marker; s.warp(m.x, m.z, 0)');
  await t.gameSeconds(0.3);
  await t.js('const car = s.mission.ctx.vars.car; const d = car.doorPosition(); s.warp(d.x, d.z, 0);');
  await b.press('KeyF');
  await t.gameSeconds(0.4);
  console.log('stolen:', (await t.facts()).mission);
  await t.js(`const v = p.vehicle; v.invulnerable = true; s.warp(${lane}, ${startZ}, 0); s.wanted(${stars});`);
  const status = () => t.js(`const cops = g.vehicles.filter((v) => v.type.police && v.driver && v.driver !== 'player').map((v) => Math.round(Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z))).sort((a, b) => a - b);
    const v = p.vehicle;
    return { x: +v.pos.x.toFixed(1), z: Math.round(p.pos.z), drift: +(v.pos.x - ${lane} + Math.sin(v.heading) * 7).toFixed(2), kmh: Math.round(v.kmh), cops, officers: g.npcs.filter((n) => n.role === 'cop' && !n.dead).length, objective: s.mission.objective };`);
  // camera orbits to try, as [yaw offset from behind the car, pitch]: behind, both rear quarters, both look-backs
  const angles = [[0, 0.2], [0.6, 0.16], [-0.6, 0.16], [2.45, 0.11], [-2.5, 0.11], [1.05, 0.13], [2.8, 0.13], [-2.85, 0.13], [2.1, 0.1]];
  let n = 0, throttle = false;
  for (let i = 0; i < frames; i++) {
    const st = await status();
    // feather the throttle between lo and hi km/h, slow enough that the cruisers can close right up
    if (st.kmh < lo && !throttle) { await b.keyDown('KeyW'); throttle = true; }
    if (st.kmh > hi && throttle) { await b.keyUp('KeyW'); throttle = false; }
    // hold the lane: heading 0 is south, so drifting east (+x) is drifting left and needs D
    if (Math.abs(st.drift) > 0.4) await b.press(st.drift > 0 ? 'KeyD' : 'KeyA', Math.abs(st.drift) > 2.5 ? 220 : 90);
    else await t.sleep(90);
    // knocked off the road by a ramming cruiser: put the car back in its lane and carry on
    if (Math.abs(st.x - lane) > 5.5) { await t.js(`const v = p.vehicle; s.warp(${lane}, v.pos.z, 0); v.vz = 16;`); continue; }
    const near = Number(t.args.near || 22);
    if (st.cops.length && st.cops[0] > 5 && st.cops[0] < near && Math.abs(st.x - lane) < 2.6 && st.kmh > 40) {
      for (let k = 0; k < angles.length; k++) {
        if (t.args.only && !t.args.only.includes(String(k))) continue;
        await t.js(`s.cam.yaw = p.vehicle.heading + ${angles[k][0]}; s.cam.pitch = ${angles[k][1]}; s.cam.orbitHold = 0;`);
        await t.sleep(45);
        await t.shot(`chase-${String(n).padStart(2, '0')}-a${k}`);
      }
      // and looking back over the car at the nearest cruiser, as a player swinging the mouse round would
      for (const off of [0.3, -0.3, 0.6]) {
        await t.js(`let c = null, cd = 1e9; for (const v of g.vehicles) { if (!v.type.police || !v.siren) continue; const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z); if (d < cd) { cd = d; c = v; } }
          if (c) { s.cam.yaw = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z) + ${off}; s.cam.pitch = 0.12; s.cam.orbitHold = 0; }`);
        await t.sleep(45);
        await t.shot(`chase-${String(n).padStart(2, '0')}-cop${off}`);
      }
      n++;
    }
    console.log(i, JSON.stringify(st));
    if (st.z > 735) await t.js(`s.warp(${lane}, 70, 0)`);
  }
  if (throttle) await b.keyUp('KeyW');
}
