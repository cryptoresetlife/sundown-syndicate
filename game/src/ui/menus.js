// Menus: the title screen, pause menu with stats, settings, controls, the full-screen city map,
// the gun shop counter and the safehouse (save, sleep, buy property).
import { game, onEvent, emitEvent } from '../core/state.js';
import { wasKeyPressed, releaseMouseLook, requestMouseLook } from '../core/input.js';
import { formatMoney } from '../core/mathutil.js';
import { WEAPONS, WEAPON_ORDER } from '../combat/weapons.js';
import { buyWeapon, buyArmor, buySafehouse, weaponAvailable, ARMOR_PRICE, WEAPON_UNLOCKS } from '../economy/shops.js';
import { storyMissions } from '../missions/missions.js';
import { FLAMINGO_TOTAL } from '../world/pickups.js';
import { hasSavedGame, saveGame, saveSettings } from '../systems/save.js';
import { initAudio, applyVolumes, playSound, silenceLoops } from '../audio/sound.js';
import { setClock } from '../world/sky.js';
import { drawCityMap, mapLegend } from './minimap.js';

const screens = {};
let actions = null, open = null, shopContext = null, returnTo = null;

const CONTROLS = [
  ['W A S D / Arrows', 'Walk · steer, accelerate, brake'], ['Mouse', 'Look around · aim'], ['Left mouse', 'Punch · fire (also from the car)'],
  ['Right mouse', 'Aim down the sights'], ['Shift', 'Sprint'], ['Space', 'Jump · handbrake'], ['F', 'Enter, steal or leave a vehicle'],
  ['Q / E / wheel / 1-6', 'Change weapon'], ['R', 'Reload · next radio station'], ['H', 'Horn'], ['T', 'Start / stop taxi fares (in a Sol Cab)'],
  ['M', 'City map'], ['Enter', 'Skip a line of dialogue'], ['Esc / P', 'Pause'],
];

function screen(id, html, cls = 'screen') {
  const d = document.createElement('div');
  d.id = 'm-' + id; d.className = cls; d.innerHTML = html;
  document.getElementById('menus').appendChild(d);
  screens[id] = d;
  return d;
}

function button(label, onClick, note = '') {
  const b = document.createElement('button');
  b.className = 'menu-button';
  b.innerHTML = label + (note ? '<small>' + note + '</small>' : '');
  b.addEventListener('click', () => { initAudio(); playSound('ui'); onClick(); });
  return b;
}

function showScreen(id) {
  for (const k in screens) screens[k].classList.toggle('on', k === id);
  open = id;
  if (id) { releaseMouseLook(); silenceLoops(); }
}

/** Builds every menu. `gameActions` supplies newGame() and continueGame() from main.js. */
export function initMenus(gameActions) {
  actions = gameActions;
  screen('title', '<div class="logo">SUNDOWN<br>SYNDICATE</div><div class="tagline">A MARISOL BAY CRIME STORY</div><div id="m-title-buttons"></div><div class="menu-note">An original open-world crime game: one sun-soaked island, eight story chapters, street races, taxi fares, a five-star police response and twenty Golden Flamingos. Everything you see and hear is generated in code.</div>');
  screen('pause', '<div class="menu-title">PAUSED</div><div id="m-pause-stats" class="stats-grid"></div><div id="m-pause-buttons"></div>');
  screen('settings', '<div class="panel"><div class="menu-title">SETTINGS</div><div id="m-settings-rows"></div></div>', 'screen center');
  screen('controls', '<div class="panel"><div class="menu-title">CONTROLS</div><div class="controls-grid">' + CONTROLS.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('') + '</div><div id="m-controls-back"></div></div>', 'screen center');
  screen('shop', '<div class="panel"><div class="menu-title" id="m-shop-title"></div><div class="menu-row"><span>Cash</span><span id="m-shop-cash" style="color:#5dff8a"></span></div><div id="m-shop-items"></div></div>', 'screen center');
  screen('map', '<canvas id="m-map-canvas" width="1204" height="1000"></canvas><div class="legend"><h3>MARISOL BAY</h3><div id="m-map-legend"></div><div class="menu-note">M or Esc to close</div></div>', '');
  screens.controls.querySelector('#m-controls-back').appendChild(button('Back', () => showScreen(returnTo)));
  document.getElementById('m-map-legend').innerHTML = mapLegend().map(([c, l, t]) => `<div><i style="background:${c}">${l}</i>${t}</div>`).join('');
  buildSettings();
}

function buildSettings() {
  const rows = document.getElementById('m-settings-rows');
  const s = game.settings;
  const slider = (label, key, min, max, step) => {
    const row = document.createElement('label');
    row.className = 'menu-row';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}">`;
    row.querySelector('input').addEventListener('input', (e) => { s[key] = Number(e.target.value); applyVolumes(); saveSettings(); });
    rows.appendChild(row);
  };
  const toggle = (label, key) => {
    const b = button(label + ': ' + (s[key] ? 'ON' : 'OFF'), () => { s[key] = !s[key]; b.firstChild.textContent = label + ': ' + (s[key] ? 'ON' : 'OFF'); saveSettings(); });
    rows.appendChild(b);
  };
  slider('Master volume', 'master', 0, 1, 0.05);
  slider('Radio volume', 'music', 0, 1, 0.05);
  slider('Effects volume', 'sfx', 0, 1, 0.05);
  slider('Mouse sensitivity', 'sensitivity', 0.3, 2.5, 0.1);
  toggle('Invert look', 'invertY');
  toggle('Shadows', 'shadows');
  toggle('Car radio', 'radioOn');
  rows.appendChild(button('Back', () => showScreen(returnTo)));
}

export function showTitle() {
  game.mode = 'title';
  const box = document.getElementById('m-title-buttons');
  box.innerHTML = '';
  if (hasSavedGame()) box.appendChild(button('Continue', () => { closeMenus(); actions.continueGame(); }));
  box.appendChild(button('New Game', () => { closeMenus(); actions.newGame(); }));
  box.appendChild(button('Settings', () => { returnTo = 'title'; showScreen('settings'); }));
  box.appendChild(button('Controls', () => { returnTo = 'title'; showScreen('controls'); }));
  showScreen('title');
}

export function openPause() {
  if (game.mode !== 'play') return;
  game.mode = 'paused';
  const st = game.stats, total = storyMissions().length;
  const rows = [['Story', game.storyIndex + ' / ' + total + ' chapters'], ['Cash', formatMoney(game.money)], ['Cars taken', st.carsStolen], ['Distance driven', (st.distance / 1000).toFixed(1) + ' km'],
    ['Fares delivered', st.fares], ['Races won', st.racesWon], ['Golden Flamingos', st.flamingos + ' / ' + FLAMINGO_TOTAL], ['Takedowns', st.kills], ['Booked / flatlined', st.busted + ' / ' + st.flatlined]];
  document.getElementById('m-pause-stats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
  const box = document.getElementById('m-pause-buttons');
  box.innerHTML = '';
  box.appendChild(button('Resume', closeMenus));
  box.appendChild(button('City map', () => { showScreen(null); game.mode = 'play'; toggleMap(); }));
  box.appendChild(button('Settings', () => { returnTo = 'pause'; showScreen('settings'); }));
  box.appendChild(button('Controls', () => { returnTo = 'pause'; showScreen('controls'); }));
  box.appendChild(button('Quit to title', () => { showScreen(null); actions.quitToTitle(); }));
  showScreen('pause');
}

export function closeMenus() {
  showScreen(null);
  shopContext = null;
  if (game.mode === 'paused' || game.mode === 'shop' || game.mode === 'map') {
    game.mode = 'play';
    requestMouseLook(document.getElementById('world'));
  }
}

export function toggleMap() {
  if (game.mode === 'map') { closeMenus(); return; }
  if (game.mode !== 'play') return;
  game.mode = 'map';
  drawCityMap(document.getElementById('m-map-canvas'));
  showScreen('map');
}

function renderShop() {
  const { kind, landmark } = shopContext;
  const items = document.getElementById('m-shop-items');
  const p = game.player;
  items.innerHTML = '';
  document.getElementById('m-shop-cash').textContent = formatMoney(game.money);
  document.getElementById('m-shop-title').textContent = landmark.name.toUpperCase();
  const add = (label, note, fn, disabled = false) => { const b = button(label, () => { fn(); if (shopContext) renderShop(); }, note); b.disabled = disabled; items.appendChild(b); };
  if (kind === 'guns') {
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      if (w.melee) continue;
      if (!weaponAvailable(id)) add(w.name, 'after chapter ' + WEAPON_UNLOCKS[id], () => {}, true);
      else if (p.weapons[id]) add(w.name + ' ammo ×' + w.ammoPack, formatMoney(w.ammoPrice), () => buyWeapon(id), game.money < w.ammoPrice);
      else add(w.name, formatMoney(w.price), () => buyWeapon(id), game.money < w.price);
    }
    add('Body armour', formatMoney(ARMOR_PRICE), buyArmor, game.money < ARMOR_PRICE || p.armor >= 100);
  } else if (kind === 'realty') {
    add('Buy ' + landmark.name, formatMoney(landmark.price), () => { if (buySafehouse(landmark)) { shopContext.kind = 'safehouse'; } }, game.money < landmark.price);
  } else {
    add('Save game', '', () => { game.flags.home = landmark.id; const ok = saveGame(landmark.id); emitEvent('hint', { text: ok ? 'Game saved at ' + landmark.name : 'Could not save: storage is unavailable' }); closeMenus(); });
    add('Sleep until morning', 'heals', () => { p.heal(100); setClock(8); game.day++; saveGame(landmark.id); emitEvent('hint', { text: 'Rested. Game saved.' }); closeMenus(); });
    add('Sleep until evening', 'heals', () => { p.heal(100); setClock(19.2); saveGame(landmark.id); emitEvent('hint', { text: 'Rested. Game saved.' }); closeMenus(); });
  }
  items.appendChild(button('Leave', closeMenus));
}

/** Run every frame: the keys that open and close menus. */
export function updateMenus() {
  const esc = wasKeyPressed('Escape');
  if (game.pendingPause) { game.pendingPause = false; if (game.mode === 'play' && !esc) openPause(); }
  if (game.mode === 'play') {
    if (esc || wasKeyPressed('KeyP')) openPause();
    else if (wasKeyPressed('KeyM')) toggleMap();
  } else if (game.mode === 'map') {
    if (esc || wasKeyPressed('KeyM')) closeMenus();
  } else if (game.mode === 'paused' || game.mode === 'shop') {
    if (esc || (game.mode === 'paused' && wasKeyPressed('KeyP'))) {
      if (open === 'settings' || open === 'controls') showScreen(returnTo); else closeMenus();
    }
  } else if (game.mode === 'title') {
    if (esc && (open === 'settings' || open === 'controls')) showScreen('title');
    else if (wasKeyPressed('Enter') && open === 'title') { initAudio(); closeMenus(); if (hasSavedGame()) actions.continueGame(); else actions.newGame(); }
  }
}

export function menuOpen() { return open; }

onEvent('openShop', (ctx) => {
  if (game.mode !== 'play') return;
  game.mode = 'shop';
  shopContext = { ...ctx };
  renderShop();
  showScreen('shop');
});
