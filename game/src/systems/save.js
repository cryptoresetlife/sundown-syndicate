// Saving and loading: story progress, money, weapons, stats, collectibles and settings are kept in
// the browser's localStorage, so a game saved at a safehouse is there on the next visit.
import { game } from '../core/state.js';
import { LANDMARKS } from '../world/layout.js';

const SAVE_KEY = 'sundown-syndicate.save.v1';
const SETTINGS_KEY = 'sundown-syndicate.settings.v1';

function storage() {
  try { return window.localStorage; } catch (err) { return null; }
}

export function hasSavedGame() {
  const s = storage();
  return !!(s && s.getItem(SAVE_KEY));
}

/** Writes the current game. `at` is the landmark id the player wakes up at after loading. */
export function saveGame(at = null) {
  const s = storage(), p = game.player;
  if (!s || !p) return false;
  const data = {
    version: 1, savedAt: Date.now(), at: at || game.flags.home || 'safehouse',
    money: game.money, storyIndex: game.storyIndex, flags: game.flags, stats: game.stats, clock: game.clock, day: game.day,
    health: p.health, armor: p.armor, weapons: p.weapons, current: p.current,
  };
  try { s.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (err) { return false; }
}

export function readSavedGame() {
  const s = storage();
  if (!s) return null;
  try { const d = JSON.parse(s.getItem(SAVE_KEY) || 'null'); return d && d.version === 1 ? d : null; } catch (err) { return null; }
}

/** Applies a saved game to the live state; the player must already exist. */
export function loadGame(data) {
  const p = game.player;
  game.money = data.money; game.storyIndex = data.storyIndex; game.clock = data.clock; game.day = data.day || 1;
  game.flags = { ...data.flags, wantedLocked: false, freezeDriving: false, policeBlind: false };
  Object.assign(game.stats, data.stats);
  p.weapons = data.weapons && data.weapons.fists ? data.weapons : { fists: { clip: 0, ammo: 0 } };
  p.current = p.weapons[data.current] ? data.current : 'fists';
  p.armor = data.armor || 0;
  const lm = LANDMARKS[data.at] || LANDMARKS.safehouse;
  p.revive(lm.x - 4, lm.z, lm.facing);
  p.health = Math.max(40, data.health || 100);
}

export function deleteSavedGame() {
  const s = storage();
  if (s) s.removeItem(SAVE_KEY);
}

export function saveSettings() {
  const s = storage();
  if (s) try { s.setItem(SETTINGS_KEY, JSON.stringify(game.settings)); } catch (err) { /* storage full or blocked */ }
}

export function loadSettings() {
  const s = storage();
  if (!s) return;
  try { Object.assign(game.settings, JSON.parse(s.getItem(SETTINGS_KEY) || '{}')); } catch (err) { /* keep defaults */ }
}
