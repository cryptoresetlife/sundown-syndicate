// The minimap and the full city map: the island is painted once to an off-screen canvas (districts,
// streets, park, beach, pier), then drawn rotated around the player with blips for everything that matters.
import './menus.js'; // load order: HUD, minimap, then the menus
import { game } from '../core/state.js';
import { cam } from '../core/camera.js';
import { GRID, BLOCK, ROAD_HALF, CITY, ISLAND, PIER, DISTRICTS, AVENUES, STREETS, LANDMARKS, districtOfBlock, lotOfBlock } from '../world/layout.js';
import { nodeExists } from '../world/roads.js';
import { markers } from '../world/markers.js';
import { wanted } from '../police/wanted.js';
import { helicopterPosition } from '../police/helicopter.js';

export { drawMinimap, drawCityMap, mapLegend };

const ORIGIN_X = -150, ORIGIN_Z = -150, MAP_W = 1360, MAP_H = 1130; // world window covered by the base map, 1 px per metre
let base = null;

function paintBaseMap() {
  base = document.createElement('canvas');
  base.width = MAP_W; base.height = MAP_H;
  const g = base.getContext('2d');
  g.fillStyle = '#1f7fc4'; g.fillRect(0, 0, MAP_W, MAP_H);
  g.translate(-ORIGIN_X, -ORIGIN_Z);
  // shallows, sand, then the street grid as one dark slab that blocks are laid onto
  g.fillStyle = '#37a9d6'; roundRect(g, ISLAND.x0 - 26, ISLAND.z0 - 26, ISLAND.x1 - ISLAND.x0 + 52, ISLAND.z1 - ISLAND.z0 + 52, 60); g.fill();
  g.fillStyle = '#f0deb0'; roundRect(g, ISLAND.x0, ISLAND.z0, ISLAND.x1 - ISLAND.x0, ISLAND.z1 - ISLAND.z0, 36); g.fill();
  g.fillStyle = '#b58a5c'; g.fillRect(PIER.x0, PIER.z0, PIER.x1 - PIER.x0, PIER.z1 - PIER.z0); g.fillRect(PIER.headX0, PIER.headZ0, PIER.x1 - PIER.headX0, PIER.headZ1 - PIER.headZ0);
  g.fillStyle = '#4a4e56'; g.fillRect(-ROAD_HALF - 3, -ROAD_HALF - 3, CITY + 2 * ROAD_HALF + 6, CITY + 2 * ROAD_HALF + 6);
  for (let bx = 0; bx < GRID - 1; bx++) for (let bz = 0; bz < GRID - 1; bz++) {
    const d = districtOfBlock(bx, bz);
    const x = bx * BLOCK + ROAD_HALF, z = bz * BLOCK + ROAD_HALF, s = BLOCK - 2 * ROAD_HALF;
    g.fillStyle = DISTRICTS[d].color;
    if (d === 'park') g.fillRect(x - (bx === 3 ? 2 * ROAD_HALF : 0), z - (bz === 5 ? 2 * ROAD_HALF : 0), s + (bx === 3 ? 2 * ROAD_HALF : 0), s + (bz === 5 ? 2 * ROAD_HALF : 0));
    else {
      g.fillRect(x, z, s, s);
      const lot = lotOfBlock(bx, bz);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      for (let q = 0; q < 4; q++) g.fillRect(lot.x0 + (q % 2) * 32 + 2, lot.z0 + Math.floor(q / 2) * 32 + 2, 24, 24);
    }
  }
  g.fillStyle = '#2fa8d8'; g.beginPath(); g.arc(2 * BLOCK + ROAD_HALF + 41, 6 * BLOCK - ROAD_HALF - 39, 20, 0, Math.PI * 2); g.fill();
  // centre lines
  g.strokeStyle = 'rgba(255,220,90,0.55)'; g.lineWidth = 1.2;
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    if (!nodeExists(i, j)) continue;
    if (nodeExists(i + 1, j)) { g.beginPath(); g.moveTo(i * BLOCK, j * BLOCK); g.lineTo((i + 1) * BLOCK, j * BLOCK); g.stroke(); }
    if (nodeExists(i, j + 1)) { g.beginPath(); g.moveTo(i * BLOCK, j * BLOCK); g.lineTo(i * BLOCK, (j + 1) * BLOCK); g.stroke(); }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function blip(g, x, y, color, label, r = 6) {
  g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r + 1.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  if (label) { g.fillStyle = '#111'; g.font = `900 ${Math.round(r * 1.5)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y + 0.5); }
}

function arrow(g, x, y, angle, size, color) {
  g.save(); g.translate(x, y); g.rotate(angle);
  g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.72, size * 0.8); g.lineTo(0, size * 0.4); g.lineTo(-size * 0.72, size * 0.8); g.closePath();
  g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke(); g.fill();
  g.restore();
}

/** Draws the round minimap: north-free, rotating so that "up" is where the camera looks. */
function drawMinimap(canvas, zoom = 1.15) {
  if (!base) paintBaseMap();
  const g = canvas.getContext('2d'), size = canvas.width, c = size / 2, p = game.player;
  const theta = cam.yaw - Math.PI;
  g.save();
  g.clearRect(0, 0, size, size);
  g.beginPath(); g.arc(c, c, c - 3, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#1f7fc4'; g.fillRect(0, 0, size, size);
  g.translate(c, c); g.rotate(theta); g.scale(zoom, zoom);
  g.drawImage(base, ORIGIN_X - p.pos.x, ORIGIN_Z - p.pos.z);
  g.restore();
  const cos = Math.cos(theta), sin = Math.sin(theta), edge = c - 13;
  const place = (wx, wz, clampToEdge) => {
    const dx = (wx - p.pos.x) * zoom, dz = (wz - p.pos.z) * zoom;
    let x = dx * cos - dz * sin, y = dx * sin + dz * cos;
    const d = Math.hypot(x, y);
    if (d > edge) { if (!clampToEdge) return null; x *= edge / d; y *= edge / d; }
    return [c + x, c + y];
  };
  g.save();
  g.beginPath(); g.arc(c, c, c - 3, 0, Math.PI * 2); g.clip();
  for (const pk of game.pickups) {
    if (pk.hidden > 0 || pk.kind === 'flamingo') continue;
    const s = place(pk.x, pk.z, false);
    if (s) { g.fillStyle = pk.kind === 'cash' ? '#5dff8a' : pk.kind === 'health' ? '#ff6a6a' : pk.kind === 'armor' ? '#6aa8ff' : '#ffd23f'; g.fillRect(s[0] - 2.5, s[1] - 2.5, 5, 5); }
  }
  for (const m of markers) {
    if (m.hideOnMap) continue;
    const s = place(m.x, m.z, m.kind !== 'shop' && m.kind !== 'enemy');
    if (!s) continue;
    if (m.kind === 'enemy') blip(g, s[0], s[1], '#ff3a3a', '', 4.5);
    else blip(g, s[0], s[1], hex(m.color), m.label && m.label.length === 1 && m.label !== '▼' ? m.label : '', m.kind === 'shop' ? 7 : 8.5);
  }
  if (wanted.stars > 0) {
    const flash = Math.floor(game.time * 5) % 2 === 0;
    for (const v of game.vehicles) {
      if (!v.type.police || v.destroyed || !v.driver || v.driver === 'player') continue;
      const s = place(v.pos.x, v.pos.z, false);
      if (s) blip(g, s[0], s[1], flash ? '#ff3030' : '#3a7bff', '', 5.5);
    }
    for (const n of game.npcs) {
      if (n.role !== 'cop' || n.dead) continue;
      const s = place(n.pos.x, n.pos.z, false);
      if (s) blip(g, s[0], s[1], flash ? '#3a7bff' : '#ff3030', '', 3.5);
    }
    const h = helicopterPosition();
    if (h) { const s = place(h.x, h.z, true); if (s) blip(g, s[0], s[1], flash ? '#ffffff' : '#3a7bff', 'H', 7); }
  }
  for (const n of game.npcs) {
    if (n.dead || !n.hostileToPlayer || n.role === 'cop') continue;
    const s = place(n.pos.x, n.pos.z, false);
    if (s) blip(g, s[0], s[1], '#ff3a3a', '', 3.5);
  }
  g.restore();
  arrow(g, c, c, -(p.heading - cam.yaw), 9, '#ffffff');
  // rim and the north tick
  g.lineWidth = 5; g.strokeStyle = wanted.stars > 0 && Math.floor(game.time * 4) % 2 ? '#ff4040' : 'rgba(10,14,22,0.95)';
  g.beginPath(); g.arc(c, c, c - 3, 0, Math.PI * 2); g.stroke();
  const ndx = sin, ndy = -cos; // world north (0, -1) after the map's rotation
  g.font = '900 13px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#000'; g.beginPath(); g.arc(c + ndx * (c - 11), c + ndy * (c - 11), 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.fillText('N', c + ndx * (c - 11), c + ndy * (c - 10));
}

/** Draws the whole island with street names, districts, landmarks and live blips (the M key map). */
function drawCityMap(canvas) {
  if (!base) paintBaseMap();
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, p = game.player;
  const scale = Math.min(W / MAP_W, H / MAP_H);
  const ox = (W - MAP_W * scale) / 2, oy = (H - MAP_H * scale) / 2;
  g.clearRect(0, 0, W, H);
  g.drawImage(base, ox, oy, MAP_W * scale, MAP_H * scale);
  const sx = (wx) => ox + (wx - ORIGIN_X) * scale, sy = (wz) => oy + (wz - ORIGIN_Z) * scale;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(9 * scale + 5)}px Arial, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.8)';
  AVENUES.forEach((name, i) => { g.save(); g.translate(sx(i * BLOCK), sy(CITY + 34)); g.rotate(-Math.PI / 2); g.fillStyle = 'rgba(20,30,40,0.85)'; g.fillText(name, 0, 0); g.restore(); });
  STREETS.forEach((name, j) => { g.fillStyle = 'rgba(20,30,40,0.85)'; g.textAlign = 'right'; g.fillText(name, sx(-16), sy(j * BLOCK)); });
  g.textAlign = 'center';
  g.font = `900 ${Math.round(15 * scale + 6)}px Arial, sans-serif`;
  const labels = [['PALM HEIGHTS', 320, 80], ['MIDTOWN', 160, 240], ['DOWNTOWN', 480, 300], ['OCEAN STRIP', 720, 520], ['FLAMINGO PARK', 240, 400], ['DOCKYARDS', 80, 640], ['SOUTHSIDE', 440, 720], ['SUNSET BEACH', 880, 200], ['THE PIER', 1000, 440]];
  for (const [text, x, z] of labels) { g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text, sx(x), sy(z)); g.fillStyle = '#fff'; g.fillText(text, sx(x), sy(z)); }
  for (const lm of Object.values(LANDMARKS)) {
    if (lm.kind === 'contact' || lm.kind === 'hospital' || lm.kind === 'police') blip(g, sx(lm.x), sy(lm.z), lm.kind === 'hospital' ? '#ffffff' : lm.kind === 'police' ? '#3a7bff' : '#c9c9c9', lm.kind === 'hospital' ? '+' : lm.kind === 'police' ? '★' : '', 6);
  }
  for (const m of markers) if (!m.hideOnMap) blip(g, sx(m.x), sy(m.z), hex(m.color), m.label && m.label.length === 1 && m.label !== '▼' ? m.label : '', m.kind === 'shop' ? 8 : 10);
  if (wanted.stars > 0) for (const v of game.vehicles) if (v.type.police && v.driver && v.driver !== 'player' && !v.destroyed) blip(g, sx(v.pos.x), sy(v.pos.z), '#3a7bff', '', 5);
  arrow(g, sx(p.pos.x), sy(p.pos.z), Math.PI - p.heading, 11, '#ffffff');
}

function mapLegend() {
  return [['#ff7ab8', 'L', 'Story job'], ['#4dff9a', 'R', 'Street race'], ['#ff5a5a', 'G', 'Iron Pelican Arms'], ['#ff9a3d', 'P', 'Fresh Coat respray'], ['#ffe14a', 'F', 'Food'], ['#4dff9a', 'H', 'Safehouse'], ['#ffffff', '+', 'Mercy General'], ['#3a7bff', '★', 'Police']];
}
