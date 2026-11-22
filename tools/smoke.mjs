// Smoke test: loads the game in headless Chrome, starts a new game, walks and drives with real
// key presses, and reports console errors, frame rate and a few facts about the running world.
//   node serve.ts --port 8123   (in another terminal)
//   node tools/smoke.mjs [swiftshader]
import { mkdirSync } from 'node:fs';
import { Browser, sleep } from './browser.mjs';

const URL = process.env.GAME_URL || 'http://localhost:8123/';
const out = 'tools/out';
mkdirSync(out, { recursive: true });

const b = await Browser.launch({ gl: process.argv[2] || 'angle' });
const facts = () => b.eval(`(() => { const g = window.sundown && window.sundown.game; if (!g) return null; return {
  mode: g.mode, frame: g.frame, time: +g.time.toFixed(1), vehicles: g.vehicles.length, npcs: g.npcs.length,
  player: [Math.round(g.player.pos.x), Math.round(g.player.pos.z)], inCar: !!g.player.vehicle, money: g.money }; })()`);
try {
  await b.open(URL + '?debug');
  await b.waitFor('window.sundown && window.sundown.game.frame > 5', 30000);
  await sleep(1500);
  console.log('title', await facts(), 'renderer', await b.eval('(() => { const gl = document.getElementById("world").getContext("webgl2"); const e = gl && gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })()'));
  await b.screenshot(`${out}/smoke-title.jpg`);
  await b.press('Enter');
  await sleep(2500);
  const f0 = await facts();
  await b.screenshot(`${out}/smoke-start.jpg`);
  await b.hold(['KeyW'], 1500);
  await b.eval('(window.sundown.drive("marlin"), 1)');
  await b.hold(['KeyW'], 3000);
  await b.hold(['KeyW', 'KeyA'], 1200);
  const f1 = await facts();
  await b.screenshot(`${out}/smoke-drive.jpg`);
  console.log('start', f0);
  console.log('drive', f1, 'fps', ((f1.frame - f0.frame) / Math.max(0.1, (f1.time - f0.time))).toFixed(1), '(sim frames per sim second)');
} catch (err) {
  console.log('FAILED:', err.message);
  await b.screenshot(`${out}/smoke-failed.jpg`).catch(() => {});
} finally {
  console.log('console errors:', b.errors.length ? b.errors.slice(0, 12) : 'none');
  await b.close();
}
