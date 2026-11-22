// The chapter 4 shootout, fought for real: the script only points the camera at the nearest gang
// member (as a player's mouse would) and holds the trigger; hits, deaths and drops are the game's own.
//   node tools/play.mjs tools/scenarios/shootout.mjs [clock=15]
export default async function (b, t) {
  await t.newGame('&clock=' + (t.args.clock || 15));
  await t.js('s.chapter(4, true); s.warp(296, 722, 0); p.armor = 100;');
  await t.gameSeconds(1);
  const aim = () => t.js(`let best = null, bd = 1e9; for (const n of g.npcs) { if (n.dead || !n.hostileToPlayer) continue; const d = n.distanceTo(p.pos.x, p.pos.z); if (d < bd) { bd = d; best = n; } }
    if (!best) return null;
    const c = g.camera.position; const dx = best.pos.x - c.x, dz = best.pos.z - c.z, dy = best.pos.y + 1.1 - c.y;
    s.cam.yaw = Math.atan2(dx, dz); s.cam.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    return { dist: Math.round(bd), left: g.npcs.filter((n) => n.hostileToPlayer && !n.dead).length, hp: Math.round(p.health), armor: Math.round(p.armor), ammo: p.ammoText() };`);
  await b.mouse('mouseMoved', 640, 360);
  await b.mouse('mousePressed', 640, 360, 'right', 2);
  for (let i = 0; i < 70; i++) {
    const a = await aim();
    if (!a) break;
    await b.mouse('mousePressed', 640, 360, 'left', 3);
    await t.sleep(220);
    await b.mouse('mouseReleased', 640, 360, 'left', 2);
    if (i % 8 === 0) { console.log(JSON.stringify(a)); await t.shot('shootout-' + (i / 8)); }
    if (i === 20) await b.hold(['KeyW'], 700);
  }
  await b.mouse('mouseReleased', 640, 360, 'right', 0);
  console.log('end', await t.facts(), await t.js('return { pickups: g.pickups.filter((k) => k.kind === "cash" || k.kind === "weapon").length, kills: g.stats.kills, stars: document.querySelectorAll("#h-stars .lit").length }'));
  await t.shot('shootout-end');
}
