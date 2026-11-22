// Location scouting: parks the player's car at a list of spots and looks around from each with the
// chase camera, to find where the island shows best. Output: tools/out/scout-<n>.jpg
//   node tools/play.mjs tools/scenarios/scout.mjs [clock=14]
const SPOTS = [
  // [x, z, car heading, camera yaw offset from behind the car, camera pitch, note]
  [300, 801.7, Math.PI / 2, 0.9, 0.16, 'Southshore Rd east, looking north-east at the skyline'],
  [520, 801.7, Math.PI / 2, 1.3, 0.12, 'Southshore Rd, looking north up Sterling Ave'],
  [798.2, 620, Math.PI, 0.5, 0.14, 'Tidewater Drive north, looking north-west'],
  [798.2, 300, 0, -0.6, 0.14, 'Tidewater Drive south, looking south-west'],
  [401.7, 620, Math.PI, 0, 0.1, 'Marisol Blvd north toward Vance Tower'],
  [401.7, 700, Math.PI, 0.35, 0.06, 'Marisol Blvd north, lower camera'],
  [880, 300, Math.PI * 0.75, 0.9, 0.1, 'on the beach looking back at the strip and downtown'],
  [640, 478.2, -Math.PI / 2, 0, 0.12, 'Calle Sol west toward downtown'],
  [561.7, 250, Math.PI, -0.4, 0.1, 'Mango Ave north through downtown'],
];

export default async function (b, t) {
  await t.newGame('&clock=' + (t.args.clock || 14));
  await t.js('s.god(true); s.warp(300, 801.7, Math.PI / 2); s.drive("marlin", 0xe63946)');
  for (let i = 0; i < SPOTS.length; i++) {
    const [x, z, h, yaw, pitch, note] = SPOTS[i];
    await t.js(`s.warp(${x}, ${z}, ${h}); g.debug.spawnInView = true;`);
    await t.gameSeconds(5);
    await t.js(`s.warp(${x}, ${z}, ${h}); s.cam.yaw = ${h + yaw}; s.cam.pitch = ${pitch}; s.cam.orbitHold = 0;`);
    await t.sleep(250);
    await t.shot('scout-' + i);
    console.log(i, note);
  }
}
