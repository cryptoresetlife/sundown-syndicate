// Places to spend money: Iron Pelican Arms gun shops, Fresh Coat Customs paint shops that repair
// the car and shake the police, food stands that heal, and safehouses where the game is saved.
import '../audio/radio.js'; // load order: shops and safehouses, then the radio and the world
import { game, emitEvent, spendMoney } from '../core/state.js';
import { rand, formatMoney } from '../core/mathutil.js';
import { LANDMARKS } from '../world/layout.js';
import { addMarker, removeMarker, playerInMarker } from '../world/markers.js';
import { WEAPONS } from '../combat/weapons.js';
import { PAINTS } from '../vehicles/catalog.js';
import { wanted, clearWantedLevel } from '../police/wanted.js';
import { clearPolice } from '../police/police.js';
import { mission } from '../missions/missions.js';
import { playSound } from '../audio/sound.js';

export { buyWeapon, buyAmmo, buyArmor, buySafehouse, placeShopMarkers, updateShops };

const shopMarkers = [];
export const WEAPON_UNLOCKS = { pistol: 0, smg: 2, shotgun: 3, rifle: 5, launcher: 7 };
export const ARMOR_PRICE = 400, FOOD_PRICE = 20, RESPRAY_PRICE = 250;

/** Places a marker for every shop and safehouse the player has access to. */
function placeShopMarkers() {
  for (const m of shopMarkers) removeMarker(m);
  shopMarkers.length = 0;
  for (const lm of Object.values(LANDMARKS)) {
    let opts = null;
    if (lm.kind === 'guns') opts = { x: lm.x, z: lm.z, color: 0xff5a5a, label: 'G' };
    else if (lm.kind === 'paint') opts = { x: lm.x, z: lm.z, color: 0xff9a3d, label: 'P', radius: 3.4 };
    else if (lm.kind === 'food') opts = { x: lm.x + 8, z: lm.z, color: 0xffe14a, label: 'F', radius: 1.6 };
    else if (lm.kind === 'safehouse') {
      if (lm.id === 'safehouse' && game.storyIndex < 1) continue;
      opts = { x: lm.x - 8, z: lm.z, color: 0x4dff9a, label: lm.price && !game.flags['own_' + lm.id] ? '$' : 'H', radius: 1.8 };
    }
    if (!opts) continue;
    const m = addMarker({ ...opts, kind: 'shop', beam: false, name: lm.name });
    m.landmark = lm;
    shopMarkers.push(m);
  }
}

export function weaponAvailable(id) {
  return game.storyIndex >= (WEAPON_UNLOCKS[id] ?? 99);
}

function buyWeapon(id) {
  const w = WEAPONS[id], p = game.player;
  if (p.weapons[id]) return buyAmmo(id);
  if (!weaponAvailable(id) || !spendMoney(w.price)) { playSound('uiBack'); return false; }
  p.giveWeapon(id, w.ammoPack);
  p.selectWeapon(id);
  playSound('reload');
  return true;
}

function buyAmmo(id) {
  const w = WEAPONS[id], p = game.player;
  if (!p.weapons[id] || !spendMoney(w.ammoPrice)) { playSound('uiBack'); return false; }
  p.weapons[id].ammo += w.ammoPack;
  playSound('reload');
  return true;
}

function buyArmor() {
  const p = game.player;
  if (p.armor >= 100 || !spendMoney(ARMOR_PRICE)) { playSound('uiBack'); return false; }
  p.armor = 100;
  playSound('pickup');
  return true;
}

function policeNearby(range) {
  const p = game.player;
  for (const n of game.npcs) if (n.role === 'cop' && !n.dead && n.distanceTo(p.pos.x, p.pos.z) < range) return true;
  for (const v of game.vehicles) if (v.type.police && v.driver && v.driver !== 'player' && !v.destroyed && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < range) return true;
  return false;
}

/** Drive into a Fresh Coat: new colour, full repair, and the police lose the description. */
function respray(vehicle) {
  if (wanted.stars > 0 && policeNearby(38)) { emitEvent('hint', { text: 'The cops saw you drive in — shake them first' }); return; }
  if (!spendMoney(RESPRAY_PRICE)) { emitEvent('hint', { text: 'A respray costs ' + formatMoney(RESPRAY_PRICE) }); return; }
  let color = rand.pick(PAINTS);
  if (color === vehicle.paint) color = PAINTS[(PAINTS.indexOf(color) + 3) % PAINTS.length];
  vehicle.repaint(color);
  vehicle.repair();
  vehicle.vx = 0; vehicle.vz = 0;
  playSound('spray');
  const had = wanted.stars;
  if (had) { game.flags.wantedLocked = false; clearWantedLevel(); clearPolice(); }
  emitEvent('hint', { text: had ? 'Fresh Coat: resprayed, repaired, and the heat is off' : 'Fresh Coat: resprayed and repaired' });
  emitEvent('resprayed', { vehicle });
}

/** Run every frame: reacts when the player steps or drives into a shop marker. */
function updateShops() {
  const p = game.player;
  if (p.dead || game.mode !== 'play') return;
  for (const m of shopMarkers) {
    const inside = playerInMarker(m);
    if (!inside) { m.inside = false; continue; }
    if (m.inside) continue;
    m.inside = true;
    const lm = m.landmark;
    if (lm.kind === 'paint') { if (p.vehicle) respray(p.vehicle); else emitEvent('hint', { text: 'Bring a vehicle here for a respray and repair (' + formatMoney(RESPRAY_PRICE) + ')' }); }
    else if (p.vehicle) emitEvent('hint', { text: 'Step out of the vehicle to enter ' + lm.name });
    else if (lm.kind === 'food') {
      if (p.health >= p.maxHealth) emitEvent('hint', { text: lm.name + ': you are not hungry' });
      else if (spendMoney(FOOD_PRICE)) { p.heal(100); playSound('pickup'); emitEvent('hint', { text: lm.name + ': health restored  -' + formatMoney(FOOD_PRICE) }); }
      else emitEvent('hint', { text: 'A meal costs ' + formatMoney(FOOD_PRICE) });
    } else if (lm.kind === 'guns') {
      if (wanted.stars > 0) emitEvent('hint', { text: 'Iron Pelican does not serve wanted customers' });
      else emitEvent('openShop', { kind: 'guns', landmark: lm });
    } else if (lm.kind === 'safehouse') {
      if (mission.active) emitEvent('hint', { text: 'Finish the job before you rest' });
      else if (wanted.stars > 0) emitEvent('hint', { text: 'Lose the cops before going home' });
      else emitEvent('openShop', { kind: lm.price && !game.flags['own_' + lm.id] ? 'realty' : 'safehouse', landmark: lm });
    }
  }
}

function buySafehouse(lm) {
  if (!spendMoney(lm.price)) { playSound('uiBack'); return false; }
  game.flags['own_' + lm.id] = true;
  playSound('missionPass');
  placeShopMarkers();
  return true;
}
