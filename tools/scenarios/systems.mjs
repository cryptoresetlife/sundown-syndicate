// Exercises the main systems in one run: the first mission's cutscene and van, a carjacking, the
// wanted level and police response, gunfire, the pause menu and the city map.
export default async function (b, t) {
  await t.newGame();
  console.log('new game', await t.facts());

  // walk into Lupe's marker: the intro cutscene should start, then the van objective
  await t.js('const m = s.mission.startMarkers[0]; s.warp(m.x - 5, m.z, Math.PI / 2)');
  await b.hold(['KeyW'], 1500);
  console.log('after walking', await t.facts());
  await t.shot('sys-cutscene');
  for (let i = 0; i < 8; i++) { await b.press('Enter'); await t.sleep(250); }
  await t.sleep(600);
  console.log('after intro', await t.facts());
  await t.shot('sys-mission1');

  // get in the van with F
  await t.js('const v = s.mission.ctx.vars.van; const d = v.doorPosition(); s.warp(d.x, d.z, 0)');
  await b.press('KeyF');
  await t.sleep(500);
  console.log('in van', await t.facts());
  await b.hold(['KeyW'], 2500);
  await t.shot('sys-van');
  console.log('driving van', await t.facts());

  // abandon it, hijack a moving car
  await b.press('KeyF');
  await t.sleep(300);
  const victim = await t.js(`let best = null, bd = 1e9; for (const v of g.vehicles) { if (!v.driver || v.driver === 'player' || v.driver.kind !== 'traffic') continue; const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z); if (d < bd) { bd = d; best = v; } }
    if (!best) return null; const door = best.doorPosition(); best.vx = 0; best.vz = 0; s.warp(door.x, door.z, 0); return best.type.name;`);
  await b.press('KeyF');
  await t.sleep(600);
  console.log('hijacked', victim, await t.facts(), 'wanted', await t.js('return { stars: s.game.debug && 0 }'));

  // crimes: three stars and wait for the response
  await t.js('s.wanted(3)');
  await b.hold(['KeyW'], 4000);
  await t.gameSeconds(6);
  console.log('3 stars', await t.facts(), await t.js('return { policeCars: g.vehicles.filter((v) => v.type.police).length }'));
  await t.shot('sys-wanted');

  // on foot with guns
  await b.press('KeyF');
  await t.js('s.arm(); p.selectWeapon("smg"); s.god(true)');
  await b.mouse('mouseMoved', 640, 360);
  await b.mouse('mousePressed', 640, 360, 'left', 1);
  await t.sleep(1200);
  await b.mouse('mouseReleased', 640, 360, 'left', 0);
  console.log('after shooting', await t.facts(), await t.js('return { ammo: p.ammoText(), weapon: p.current }'));
  await t.shot('sys-combat');

  await b.press('KeyM');
  await t.sleep(400);
  await t.shot('sys-map');
  console.log('map', await t.facts());
  await b.press('KeyM');
  await b.press('Escape');
  await t.sleep(300);
  await t.shot('sys-pause');
  console.log('paused', await t.facts());
}
