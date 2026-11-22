// Screenshot run 4, a night on the Ocean Strip: on foot under the neon with three stars, the
// cruisers pull up, officers pile out, and the script aims at the nearest one with the real mouse
// while frames are captured over the shoulder.
//   node tools/play.mjs tools/scenarios/shots-night.mjs [clock=21.5] [stars=3] [x=812] [z=330] [frames=24]
export default async function (b, t) {
  const frames = Number(t.args.frames || 24), stars = Number(t.args.stars || 3);
  await t.newGame('&clock=' + (t.args.clock || 21.5));
  await t.js(`s.god(true); g.debug.trafficDensity = 1.4; g.debug.pedDensity = 1.5; g.money = 9310; s.progress(4); p.giveWeapon("smg", 160); p.selectWeapon("smg"); p.armor = 60; s.warp(${t.args.x || 812}, ${t.args.z || 330}, 0);`);
  await t.gameSeconds(10);
  await t.js(`s.wanted(${stars})`);
  const aim = () => t.js(`let best = null, bd = 1e9; for (const n of g.npcs) { if (n.dead || n.role !== 'cop') continue; const d = n.distanceTo(p.pos.x, p.pos.z); if (d < bd) { bd = d; best = n; } }
    if (!best) return { cops: 0, stars: document.querySelectorAll('#h-stars .lit').length, cruisers: g.vehicles.filter((v) => v.siren).map((v) => Math.round(Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z)) + ':' + Math.round(v.kmh)) };
    const c = g.camera.position; const dx = best.pos.x - c.x, dz = best.pos.z - c.z, dy = best.pos.y + 1.15 - c.y;
    s.cam.yaw = Math.atan2(dx, dz) + ${Number(t.args.off || 0.12)}; s.cam.pitch = -Math.atan2(dy, Math.hypot(dx, dz)) + 0.03;
    return { cops: g.npcs.filter((n) => n.role === 'cop' && !n.dead).length, dist: Math.round(bd), cruisers: g.vehicles.filter((v) => v.siren).map((v) => Math.round(Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z))) };`);
  await b.mouse('mouseMoved', 640, 360);
  let n = 0;
  for (let i = 0; i < 90 && n < frames; i++) {
    const a = await aim();
    console.log(i, JSON.stringify(a));
    if (!a.cops || a.dist > 26) { await t.gameSeconds(0.5); continue; }
    await b.mouse('mousePressed', 640, 360, 'right', 2);
    await t.sleep(250);
    await aim();
    if (n % 2) await b.mouse('mousePressed', 640, 360, 'left', 3);
    await t.sleep(120);
    await t.shot('night-' + String(n++).padStart(2, '0'));
    await b.mouse('mouseReleased', 640, 360, 'left', 2);
    await b.mouse('mouseReleased', 640, 360, 'right', 0);
    await t.sleep(300);
  }
}
