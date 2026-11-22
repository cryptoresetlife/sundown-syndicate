// A quick look at the game from several places, for judging the art direction:
//   node tools/play.mjs tools/scenarios/look.mjs [clock=14]
export default async function (b, t) {
  await t.newGame('&clock=' + (t.args.clock || 14));
  await t.js('s.god(true)');
  // seafront drive, at the wheel, with the police in pursuit
  await t.js('s.warp(798.2, 250, 0); s.drive("marlin", 0xe63946); s.wanted(3)');
  await b.hold(['KeyW'], 3500);
  await t.gameSeconds(5);
  await t.shot('look-drive');
  console.log('drive', await t.facts());
  // swing the camera round with a right-button drag to look back at the pursuit
  await b.mouse('mouseMoved', 640, 360);
  await b.mouse('mousePressed', 640, 360, 'right', 2);
  for (let i = 1; i <= 12; i++) await b.mouse('mouseMoved', 640 + i * 90, 360 - i * 2, 'right', 2);
  await b.mouse('mouseReleased', 640 + 1080, 336, 'right', 0);
  await t.sleep(200);
  await t.shot('look-back');
  // downtown on foot
  await b.press('KeyF');
  await t.js('s.wanted(0); s.warp(444, 316, Math.PI)');
  await t.gameSeconds(4);
  await t.shot('look-downtown');
  // the beach and pier
  await t.js('s.warp(860, 380, Math.PI / 2)');
  await t.gameSeconds(3);
  await t.shot('look-beach');
  // the park
  await t.js('s.warp(240, 330, 0)');
  await t.gameSeconds(3);
  await t.shot('look-park');
  // Palm Heights and the docks
  await t.js('s.warp(200, 84, Math.PI / 2)');
  await t.gameSeconds(3);
  await t.shot('look-heights');
  await t.js('s.warp(4, 600, 0)');
  await t.gameSeconds(3);
  await t.shot('look-docks');
}
