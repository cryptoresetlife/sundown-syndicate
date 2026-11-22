// The one shared game state every system reads and writes, plus a tiny event bus between systems.

export const game = {
  mode: 'title', // title | play | paused | cutscene | down | shop | map
  time: 0, // seconds of simulated play
  dt: 0,
  frame: 0,
  clock: 10.5, // in-game hour of day, 0..24
  day: 1,
  scene: null,
  camera: null,
  renderer: null,
  player: null,
  vehicles: [],
  npcs: [],
  pickups: [],
  money: 250,
  stats: { kills: 0, carsStolen: 0, distance: 0, missionsDone: 0, fares: 0, racesWon: 0, flamingos: 0, busted: 0, flatlined: 0, playSeconds: 0 },
  storyIndex: 0,
  flags: {},
  settings: { master: 0.8, music: 0.6, sfx: 0.9, sensitivity: 1, invertY: false, shadows: true, radioOn: true },
  debug: {},
};

const listeners = new Map();

export function onEvent(name, fn) {
  if (!listeners.has(name)) listeners.set(name, []);
  listeners.get(name).push(fn);
}

export function emitEvent(name, payload) {
  const list = listeners.get(name);
  if (list) for (const fn of list) fn(payload);
}

export function addMoney(amount, reason) {
  game.money = Math.max(0, Math.round(game.money + amount));
  emitEvent('money', { amount, reason });
}

export function spendMoney(amount) {
  if (game.money < amount) return false;
  addMoney(-amount, 'spend');
  return true;
}

export function isPlaying() {
  return game.mode === 'play';
}
