// Runs a play-test scenario against the game in headless Chrome:
//   node tools/play.mjs tools/scenarios/<name>.mjs [key=value ...]
// A scenario exports `default async function (b, t)`: b is the Browser, t the helpers below.
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Browser, sleep } from './browser.mjs';

const [, , file, ...rest] = process.argv;
const args = Object.fromEntries(rest.map((a) => a.split('=')));
const base = process.env.GAME_URL || 'http://localhost:8123/';
const out = args.out || 'tools/out';
mkdirSync(out, { recursive: true });

const b = await Browser.launch({ gl: args.gl || process.env.GAME_GL || 'angle' });
// a watchdog, so a scenario that hangs ends itself (and its Chrome) instead of lingering
const limitMs = Number(args.limit || 105) * 1000;
setTimeout(() => { console.log(`WATCHDOG: scenario still running after ${limitMs / 1000}s, stopping`); b.close().finally(() => process.exit(2)); }, limitMs).unref();
const t = {
  args, out, sleep,
  /** Loads the game straight into a new game with the debug API on. */
  async newGame(query = '') {
    await b.open(base + '?autostart&debug' + query);
    await b.waitFor('window.sundown && window.sundown.game.mode === "play" && window.sundown.game.frame > 20', 30000);
    await sleep(400);
  },
  async title() {
    await b.open(base + '?debug');
    await b.waitFor('window.sundown && window.sundown.game.frame > 20', 30000);
  },
  js: (code) => b.eval(`(() => { const s = window.sundown, g = s.game, p = g.player; ${code} })()`),
  facts: () => b.eval(`(() => { const s = window.sundown, g = s.game, p = g.player, m = s.mission; return {
    mode: g.mode, t: +g.time.toFixed(1), pos: [Math.round(p.pos.x), Math.round(p.pos.z)], hp: Math.round(p.health), car: p.vehicle ? p.vehicle.type.name + ' ' + Math.round(p.vehicle.kmh) + 'kmh hp' + Math.round(p.vehicle.health) : null,
    vehicles: g.vehicles.length, npcs: g.npcs.length, cops: g.npcs.filter((n) => n.role === 'cop' && !n.dead).length, money: g.money, story: g.storyIndex,
    mission: m.active ? m.active.id + ' #' + m.stepIndex + ' ' + m.objective : null, banner: m.banner ? m.banner.title + ' | ' + m.banner.sub : null }; })()`),
  shot: (name, opts) => b.screenshot(`${out}/${name}.jpg`, opts),
  /** Waits in game time, so a slow machine sees the same amount of play. */
  async gameSeconds(n) {
    const start = await b.eval('window.sundown.game.time');
    await b.waitFor(`window.sundown.game.time >= ${start + n}`, n * 4000 + 20000);
  },
};
try {
  const scenario = (await import(pathToFileURL(resolve(file)).href)).default;
  await scenario(b, t);
} catch (err) {
  console.log('FAILED:', err.message);
  await b.screenshot(`${out}/failed.jpg`).catch(() => {});
} finally {
  console.log('console errors:', b.errors.length ? [...new Set(b.errors)].slice(0, 15) : 'none');
  await b.close();
}
