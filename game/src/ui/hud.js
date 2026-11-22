// The heads-up display: wanted stars, money, weapon and ammo, clock, the minimap with health and
// armour, the mission objective with timer and meter, subtitles, speedometer, prompts and banners.
import { game, onEvent } from '../core/state.js';
import { formatMoney, formatTime, clamp } from '../core/mathutil.js';
import { districtAt, streetNameAt, DISTRICTS } from '../world/layout.js';
import { clockText } from '../world/sky.js';
import { WEAPONS } from '../combat/weapons.js';
import { wanted } from '../police/wanted.js';
import { arrestProgress } from '../police/police.js';
import { mission } from '../missions/missions.js';
import { dialogue, SPEAKERS } from '../missions/dialogue.js';
import { nearestEnterableVehicle } from '../vehicles/carjack.js';
import { radio } from '../audio/radio.js';
import { down } from '../systems/respawn.js';
import { drawMinimap } from './minimap.js';

const el = {};
const last = {};
let hintTime = 0, moneyFlash = 0, promptClock = 0, helpTime = 14;

const TEMPLATE = `
<div id="h-letter-top" class="letterbox"></div><div id="h-letter-bottom" class="letterbox"></div>
<div id="h-hurt"></div>
<div id="h-status">
  <div id="h-stars"></div>
  <div id="h-money">$0</div>
  <div id="h-weapon"><span id="h-weapon-name">Fists</span><span id="h-ammo"></span></div>
  <div id="h-clock"></div>
</div>
<div id="h-mission">
  <div id="h-mission-title"></div>
  <div id="h-objective"></div>
  <div id="h-timer"></div>
  <div id="h-meter"><span id="h-meter-label"></span><div class="bar"><i id="h-meter-fill"></i></div></div>
  <div id="h-info"></div>
</div>
<div id="h-radar">
  <div id="h-place"></div>
  <canvas id="h-minimap" width="232" height="232"></canvas>
  <div class="bar health"><i id="h-health"></i></div>
  <div class="bar armor"><i id="h-armor"></i></div>
</div>
<div id="h-vehicle">
  <div id="h-radio"></div>
  <div id="h-car-name"></div>
  <div id="h-speed"><b id="h-kmh">0</b><span>KM/H</span></div>
  <div class="bar damage"><i id="h-car-health"></i></div>
</div>
<div id="h-banner"><div id="h-banner-title"></div><div id="h-banner-sub"></div></div>
<div id="h-hint"></div>
<div id="h-prompt"></div>
<div id="h-subtitle"><b id="h-speaker"></b><span id="h-line"></span></div>
<div id="h-crosshair"><i></i><i></i><i></i><i></i></div>
<div id="h-help">WASD move · Shift sprint · Space jump · F enter / exit car · Mouse aim &amp; fire · Q / E weapons · M map · Esc pause</div>
<div id="h-down"><div id="h-down-title"></div><div id="h-down-sub"></div></div>`;

export function initHud() {
  const root = document.getElementById('hud');
  root.innerHTML = TEMPLATE;
  for (const node of root.querySelectorAll('[id]')) el[node.id.replace('h-', '').replace(/-(\w)/g, (m, c) => c.toUpperCase())] = node;
  el.root = root;
  let stars = '';
  for (let i = 0; i < 5; i++) stars += '<span>★</span>';
  el.stars.innerHTML = stars;
}

function set(key, value, prop = 'textContent') {
  if (last[key + prop] === value) return;
  last[key + prop] = value;
  el[key][prop] = value;
}

function show(key, visible) {
  if (last[key + '_v'] === visible) return;
  last[key + '_v'] = visible;
  el[key].classList.toggle('on', visible);
}

function width(key, ratio) {
  const w = Math.round(clamp(ratio, 0, 1) * 100) + '%';
  if (last[key + '_w'] === w) return;
  last[key + '_w'] = w;
  el[key].style.width = w;
}

export function showHint(text, seconds = 4.5) {
  set('hint', text);
  hintTime = seconds;
}

/** Refreshes every HUD element from the game state. Cheap: the DOM is only touched on change. */
export function updateHud(dt) {
  const p = game.player;
  const playing = game.mode === 'play' || game.mode === 'cutscene' || game.mode === 'down' || game.mode === 'map' || game.mode === 'paused' || game.mode === 'shop';
  el.root.classList.toggle('on', playing && !!p);
  if (!playing || !p) return;
  const cut = game.mode === 'cutscene';
  el.root.classList.toggle('cutscene', cut);

  // wanted stars: lit ones flash while the police have lost sight
  const searching = wanted.stars > 0 && !wanted.seen;
  const blink = searching && Math.floor(game.time * 3.5) % 2 === 0;
  const starKey = wanted.stars + (blink ? 'b' : '');
  if (last.starKey !== starKey) {
    last.starKey = starKey;
    [...el.stars.children].forEach((s, i) => { s.className = i < wanted.stars ? (blink ? 'lit dim' : 'lit') : ''; });
  }
  set('money', formatMoney(game.money));
  if (moneyFlash > 0) { moneyFlash -= dt; el.money.classList.toggle('flash', moneyFlash > 0); }
  const w = WEAPONS[p.current];
  set('weaponName', w.name);
  set('ammo', p.reloadTime > 0 ? 'RELOADING' : p.ammoText());
  set('clock', 'DAY ' + game.day + '  ·  ' + clockText());

  // mission panel
  const title = mission.active ? mission.active.title : '';
  set('missionTitle', title);
  show('missionTitle', !!title);
  set('objective', mission.objective || '');
  show('objective', !!mission.objective);
  show('timer', !!mission.timer);
  if (mission.timer) { set('timer', formatTime(mission.timer.left)); el.timer.classList.toggle('low', mission.timer.left < 20); }
  show('meter', !!mission.meter);
  if (mission.meter) { set('meterLabel', mission.meter.label); width('meterFill', mission.meter.value); if (last.meterColor !== mission.meter.color) { last.meterColor = mission.meter.color; el.meterFill.style.background = mission.meter.color; } }
  set('info', mission.info || '');
  show('info', !!mission.info);

  // radar
  drawMinimap(el.minimap, p.vehicle ? 0.95 : 1.25);
  width('health', p.health / p.maxHealth);
  width('armor', p.armor / 100);
  set('place', streetNameAt(p.pos.x, p.pos.z) + '  ·  ' + DISTRICTS[districtAt(p.pos.x, p.pos.z)].name);

  // vehicle panel
  const v = p.vehicle;
  show('vehicle', !!v);
  if (v) {
    set('kmh', String(Math.round(v.kmh)));
    set('carName', v.type.name + '  ·  ' + v.type.cls);
    width('carHealth', v.health / v.type.health);
    set('radio', radio.showTime > 0 ? '♪ ' + radio.name : '');
  }

  // banner, hint, prompt, subtitles
  const b = mission.banner;
  show('banner', !!b);
  if (b) { set('bannerTitle', b.title); set('bannerSub', b.sub || ''); if (last.bannerKind !== b.kind) { last.bannerKind = b.kind; el.banner.className = 'on ' + b.kind; last.banner_v = true; } }
  if (hintTime > 0) hintTime -= dt;
  show('hint', hintTime > 0);
  promptClock -= dt;
  if (promptClock <= 0) {
    promptClock = 0.2;
    let prompt = '';
    if (game.mode === 'play' && !p.dead) {
      if (arrestProgress() > 0.25) prompt = 'You are being arrested — move!';
      else if (!v) { const near = nearestEnterableVehicle(p); if (near) prompt = '[F]  ' + (near.driver ? 'Hijack the ' : near.ownedByPlayer ? 'Get in the ' : 'Steal the ') + near.type.name; }
      else if (Math.abs(v.speed) < 1 && game.time < 60) prompt = '[F] exit  ·  [R] radio  ·  [Space] handbrake  ·  [H] horn';
    }
    set('prompt', prompt);
    show('prompt', !!prompt);
  }
  const d = dialogue.current;
  show('subtitle', !!d);
  if (d) { set('speaker', d.speaker + ':'); set('line', ' ' + d.text); const color = SPEAKERS[d.speaker] || '#fff'; if (last.speakerColor !== color) { last.speakerColor = color; el.speaker.style.color = color; } }
  show('crosshair', game.mode === 'play' && !p.dead && (!WEAPONS[p.current].melee) && (!v || p.current === 'pistol' || p.current === 'smg'));
  el.hurt.style.opacity = String(clamp(p.hurtFlash * 2.2 + (p.health < 30 ? 0.35 : 0), 0, 0.85));
  if (helpTime > 0 && game.mode === 'play') helpTime -= dt;
  show('help', helpTime > 0 && !cut);

  show('down', down.active);
  if (down.active) {
    set('downTitle', down.cause === 'booked' ? 'BOOKED' : 'FLATLINED');
    set('downSub', down.cause === 'booked' ? 'Marisol Bay PD thanks you for your cooperation' : 'Mercy General is expecting you');
    if (last.downKind !== down.cause) { last.downKind = down.cause; el.down.className = 'on ' + down.cause; last.down_v = true; }
  }
}

onEvent('hint', ({ text }) => showHint(text));
onEvent('money', ({ amount }) => { if (amount) moneyFlash = 0.8; });
onEvent('wantedCleared', () => showHint('You lost the cops'));
onEvent('roadblock', () => showHint('Dispatch: roadblock set up ahead'));
onEvent('enteredVehicle', ({ vehicle }) => showHint(vehicle.type.name + '  —  ' + vehicle.type.cls, 3));
onEvent('weaponChanged', ({ id }) => showHint(WEAPONS[id].name, 1.6));
