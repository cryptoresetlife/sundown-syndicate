// Screenshot run 2, on foot with a gun: chapter 4 ("Reef Cleanup") at the Coral Kings stash house.
// The script aims the camera at the nearest gunman, as a mouse would, holds the trigger with the
// real mouse button, and captures frames while the fight is on.
//   node tools/play.mjs tools/scenarios/shots-shootout.mjs [clock=15.5] [frames=16]
export default async function (b, t) {
  const frames = Number(t.args.frames || 16);
  await t.newGame('&clock=' + (t.args.clock || 15.5));
  await t.js('s.god(true); g.debug.pedDensity = 1.4; g.money = 6240; s.progress(3); s.warp(300, 716, 0);');
  await t.gameSeconds(8);
  await t.js('s.chapter(4, true); s.warp(297, 723.5, 0); p.armor = 80;');
  await t.gameSeconds(1.2);
  const aim = () => t.js(`let best = null, bd = 1e9; for (const n of g.npcs) { if (n.dead || !n.hostileToPlayer || !n.seesPlayer) continue; const d = n.distanceTo(p.pos.x, p.pos.z); if (d < bd) { bd = d; best = n; } }
    if (!best) return null;
    const c = g.camera.position; const dx = best.pos.x - c.x, dz = best.pos.z - c.z, dy = best.pos.y + 1.15 - c.y;
    s.cam.yaw = Math.atan2(dx, dz); s.cam.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    return { dist: Math.round(bd), left: g.npcs.filter((n) => n.hostileToPlayer && !n.dead).length, hp: Math.round(p.health), stars: document.querySelectorAll('#h-stars .lit').length };`);
  await b.mouse('mouseMoved', 640, 360);
  await b.mouse('mousePressed', 640, 360, 'right', 2);
  for (let i = 0; i < frames; i++) {
    const a = await aim();
    if (!a) { await t.sleep(300); continue; }
    await b.mouse('mousePressed', 640, 360, 'left', 3);
    await t.sleep(140);
    await t.shot('shootout-' + String(i).padStart(2, '0'));
    await t.sleep(160);
    await b.mouse('mouseReleased', 640, 360, 'left', 2);
    console.log(i, JSON.stringify(a));
    await t.sleep(350);
  }
  await b.mouse('mouseReleased', 640, 360, 'right', 0);
}
