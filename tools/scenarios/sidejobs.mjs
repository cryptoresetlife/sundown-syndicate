// Side systems: a taxi fare from pickup to payout, a street race against the AI, a respray at
// Fresh Coat with stars on, the gun shop, and saving at the safehouse then loading the save.
export default async function (b, t) {
  await t.newGame();
  await t.js('s.god(true); s.progress(3); g.money = 6000; s.arm()');
  const info = () => t.js('return { objective: s.mission.objective, timer: s.mission.timer && Math.round(s.mission.timer.left), info: s.mission.info, taxi: s.taxi.state, money: g.money }');

  // --- taxi: pull up beside the fare, wait for them to board, deliver, get paid
  await t.js('s.warp(400, 404, Math.PI / 2); s.drive("solcab")');
  await b.press('KeyT');
  await t.sleep(300);
  console.log('taxi on', await info());
  await t.js('const m = s.taxi.marker; s.warp(m.x, m.z, p.heading)');
  await b.waitFor('window.sundown.taxi.state === "dropoff"', 15000);
  console.log('fare aboard', await info());
  await t.shot('side-taxi');
  await t.js('const m = s.taxi.marker; s.warp(m.x, m.z, p.heading)');
  await t.gameSeconds(0.6);
  console.log('fare paid', await info());
  await b.press('KeyT');
  await t.sleep(200);
  console.log('taxi off', await info());

  // --- street race (Tidewater Sprint): drive into the marker, race the first leg for real
  await t.js('s.onFoot(); s.warp(790, 170, 0); s.drive("marlin", 0x35c8e8); s.warp(798, 195, 0)');
  await t.gameSeconds(5.5);
  console.log('race started', (await t.facts()).mission, await info());
  const rivals = () => t.js('const st = s.mission.active && s.mission.active.steps[s.mission.stepIndex]; return st && st.race ? { me: [st.race.index, Math.round(p.vehicle.kmh)], rivals: st.race.rivals.map((r) => [r.drv.index, Math.round(r.car.kmh), Math.round(r.car.health)]), info: s.mission.info } : null');
  await b.hold(['KeyW'], 5000);
  console.log('race +5s', JSON.stringify(await rivals()));
  await t.shot('side-race');
  await b.hold(['KeyW'], 6000);
  console.log('race +11s', JSON.stringify(await rivals()));
  // skip to the last checkpoint: finishing first should pay out
  await t.js('const r = s.mission.active.steps[s.mission.stepIndex].race; r.index = r.cps.length - 1; const cp = r.cps[r.index]; s.warp(cp.x, cp.z, 0)');
  await t.gameSeconds(0.5);
  console.log('after race', await t.facts());

  // --- respray with two stars and nobody watching
  await t.js('s.wanted(2); g.flags.policeBlind = true; s.warp(424, 644, Math.PI)');
  await b.hold(['KeyW'], 1700);
  await t.gameSeconds(1);
  console.log('respray', await t.js('return { stars: document.querySelectorAll("#h-stars .lit").length, hint: document.getElementById("h-hint").textContent, money: g.money, pos: [Math.round(p.pos.x), Math.round(p.pos.z)] }'));
  await t.shot('side-respray');

  // --- gun shop on foot
  await t.js('g.flags.policeBlind = false; s.wanted(0); s.onFoot(); s.warp(536, 379, 0)');
  await b.hold(['KeyW'], 900);
  await t.sleep(400);
  console.log('shop', (await t.facts()).mode);
  await t.shot('side-shop');
  await b.press('Escape');

  // --- safehouse: save, then reload the page and continue
  await t.js('s.warp(128, 652, 0)');
  await b.hold(['KeyW'], 900);
  await t.sleep(400);
  console.log('safehouse', (await t.facts()).mode);
  await t.shot('side-safehouse');
  const first = await b.eval('(() => { const r = document.querySelector("#m-shop-items .menu-button").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()');
  await b.click(first[0], first[1]);
  await t.sleep(300);
  console.log('saved?', await b.eval('!!localStorage.getItem("sundown-syndicate.save.v1")'), (await t.facts()).mode);
  await t.title();
  await t.sleep(800);
  await t.shot('side-title-continue');
  await b.press('Enter');
  await t.sleep(1500);
  console.log('continued', await t.facts());
  await t.shot('side-continued');
}
