// Screenshot run 4, the screens around the game: the city map (M) opened over a taxi shift, the
// pause menu with its stats, the gun shop counter, and the title screen.
//   node tools/play.mjs tools/scenarios/shots-menus.mjs [clock=11]
export default async function (b, t) {
  await t.newGame('&clock=' + (t.args.clock || 11));
  await t.js('s.god(true); s.progress(4); s.arm();');
  await t.js('s.warp(561.7, 500, Math.PI); s.drive("solcab")');
  await b.press('KeyT');
  await t.gameSeconds(6);
  await b.press('KeyM');
  await t.sleep(500);
  await t.shot('menu-map');
  await b.press('KeyM');
  await t.sleep(200);
  await b.press('Escape');
  await t.sleep(400);
  await t.shot('menu-pause');
  await b.press('Escape');
  // the gun shop, on foot
  await b.press('KeyT');
  await t.js('s.onFoot(); s.warp(536, 379, 0)');
  await b.hold(['KeyW'], 900);
  await t.sleep(400);
  await t.shot('menu-shop');
  await b.press('Escape');
  await t.title();
  await t.sleep(2500);
  await t.shot('menu-title');
}
