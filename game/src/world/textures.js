// Every texture in the game is painted here on a canvas at load time: building facades with their
// night-time lit windows, neon shop signs, asphalt grain, soft glows. No image files anywhere.
import * as THREE from '../../vendor/three.module.min.js';
import { makeRandom } from '../core/mathutil.js';

export const FACADE_TILE_W = 24; // metres one facade tile covers: 8 window bays
export const FACADE_TILE_H = 25.6; // 8 floors

export const SIGN_NAMES = [
  'TIKI TACO', 'PELICAN PAWN', 'SOL MART', 'MANGO MOTEL', 'CLUB FLAMINGO', 'IRON PELICAN', 'FRESH COAT', 'BAYSIDE BURGER',
  'NEON NOODLE', 'CASA CUBANO', 'SURF SHACK', 'LUCKY GECKO', 'HOTEL CORALINE', 'MOONTIDE BAR', 'ZEST JUICE', 'PIXEL ARCADE',
  'GATOR GYM', 'VINYL VAULT', 'DON CHURRO', 'BANK OF MARISOL', 'KBAY 99.1', 'SOLARA COLA', 'PELICAN AIR', 'MARISOL LOTTO',
  'HOTEL AZURE', 'LA PERLA', 'TURBO LUBE', 'COCO CABANA', 'SUNDOWN DINER', 'OCEANVIEW', 'PALM & PINE', 'MERCY GENERAL',
];
const SIGN_COLORS = ['#ff3ea5', '#35e8ff', '#ffe14a', '#7dff6b', '#ff8a2b', '#c58bff', '#ffffff', '#ff5252'];
export const SIGN_COLS = 4;
export const SIGN_ROWS = 8;

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function textureOf(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}

/** kind: glass | office | deco | stucco | warehouse | shopfront. Returns the day map and the lit-window map. */
export function makeFacadeTexture(kind, seed = 1) {
  const rnd = makeRandom(seed * 977 + kind.length * 31);
  const S = 512, bays = 8, floors = 8, bw = S / bays, fh = S / floors;
  const [day, d] = canvasOf(S, S);
  const [night, n] = canvasOf(S, S);
  n.fillStyle = '#000'; n.fillRect(0, 0, S, S);
  const lit = (x, y, w, h, p) => {
    if (!rnd.chance(p)) return;
    n.fillStyle = rnd.pick(['#ffd98a', '#ffe9b8', '#fff2d6', '#9fd8ff', '#ffc46b']);
    n.globalAlpha = rnd.range(0.55, 1);
    n.fillRect(x, y, w, h);
    n.globalAlpha = 1;
  };
  if (kind === 'glass') {
    for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
      const shade = rnd.range(0.55, 1);
      d.fillStyle = `rgb(${Math.round(70 * shade)},${Math.round(150 * shade)},${Math.round(200 * shade)})`;
      d.fillRect(b * bw, f * fh, bw, fh);
      const g = d.createLinearGradient(0, f * fh, 0, (f + 1) * fh);
      g.addColorStop(0, 'rgba(255,255,255,0.38)'); g.addColorStop(0.5, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,20,60,0.25)');
      d.fillStyle = g; d.fillRect(b * bw, f * fh, bw, fh);
      lit(b * bw + 3, f * fh + 6, bw - 6, fh - 10, 0.3);
    }
    d.fillStyle = '#d9e6ee';
    for (let b = 0; b <= bays; b++) d.fillRect(b * bw - 2, 0, 4, S);
    d.fillStyle = '#b8c9d4';
    for (let f = 0; f <= floors; f++) d.fillRect(0, f * fh - 3, S, 6);
  } else if (kind === 'office') {
    d.fillStyle = '#e9e4da'; d.fillRect(0, 0, S, S);
    for (let f = 0; f < floors; f++) {
      d.fillStyle = '#cfc8ba'; d.fillRect(0, f * fh, S, 5);
      for (let b = 0; b < bays; b++) {
        d.fillStyle = rnd.pick(['#29475e', '#31566f', '#244055', '#3a6680']);
        d.fillRect(b * bw + 5, f * fh + 14, bw - 10, fh - 26);
        d.fillStyle = 'rgba(255,255,255,0.22)'; d.fillRect(b * bw + 5, f * fh + 14, bw - 10, 8);
        lit(b * bw + 5, f * fh + 14, bw - 10, fh - 26, 0.35);
      }
    }
  } else if (kind === 'deco') {
    d.fillStyle = '#fbf7ef'; d.fillRect(0, 0, S, S);
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        d.fillStyle = rnd.pick(['#2d5d7a', '#356b8a', '#27506b']);
        d.fillRect(b * bw + 12, f * fh + 12, bw - 24, fh - 30);
        d.fillStyle = 'rgba(255,255,255,0.3)'; d.fillRect(b * bw + 12, f * fh + 12, bw - 24, 6);
        lit(b * bw + 12, f * fh + 12, bw - 24, fh - 30, 0.45);
      }
      d.fillStyle = '#ffffff'; d.fillRect(0, f * fh + fh - 16, S, 9); // balcony slab
      d.fillStyle = 'rgba(0,0,0,0.28)'; d.fillRect(0, f * fh + fh - 7, S, 5);
      d.fillStyle = 'rgba(60,60,80,0.35)';
      for (let x = 0; x < S; x += 8) d.fillRect(x, f * fh + fh - 26, 2, 10); // railing
    }
  } else if (kind === 'stucco') {
    d.fillStyle = '#f1e7d6'; d.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { d.fillStyle = `rgba(120,90,60,${rnd.range(0.02, 0.07)})`; d.fillRect(rnd() * S, rnd() * S, rnd.range(2, 9), 2); }
    for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
      if ((b + f) % 4 === 3) continue;
      d.fillStyle = '#6b4a35'; d.fillRect(b * bw + 14, f * fh + 12, bw - 28, fh - 26);
      d.fillStyle = '#2b4a5c'; d.fillRect(b * bw + 17, f * fh + 15, bw - 34, fh - 32);
      d.fillStyle = '#d8d2c4'; d.fillRect(b * bw + 10, f * fh + fh - 14, bw - 20, 4);
      lit(b * bw + 17, f * fh + 15, bw - 34, fh - 32, 0.4);
    }
  } else if (kind === 'warehouse') {
    d.fillStyle = '#c9ced2'; d.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 8) { d.fillStyle = x % 16 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.14)'; d.fillRect(x, 0, 3, S); }
    for (let f = 1; f < floors; f += 3) for (let b = 0; b < bays; b += 2) {
      d.fillStyle = '#3f5563'; d.fillRect(b * bw + 8, f * fh + 10, bw * 2 - 16, fh - 30);
      lit(b * bw + 8, f * fh + 10, bw * 2 - 16, fh - 30, 0.2);
    }
    d.fillStyle = 'rgba(120,70,30,0.18)';
    for (let i = 0; i < 30; i++) d.fillRect(rnd() * S, rnd() * S, rnd.range(3, 7), rnd.range(20, 90));
  } else { // shopfront: one 4 m storey of plate glass, door and awning stripe
    d.fillStyle = '#f3efe8'; d.fillRect(0, 0, S, S);
    for (let b = 0; b < bays; b += 2) {
      const x = b * bw;
      d.fillStyle = '#18303f'; d.fillRect(x + 8, 150, bw * 2 - 16, S - 190);
      const g = d.createLinearGradient(x, 150, x + bw * 2, S);
      g.addColorStop(0, 'rgba(140,220,255,0.55)'); g.addColorStop(0.6, 'rgba(60,120,160,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0.2)');
      d.fillStyle = g; d.fillRect(x + 8, 150, bw * 2 - 16, S - 190);
      d.fillStyle = '#f3efe8'; d.fillRect(x + bw - 2, 150, 4, S - 190);
      n.fillStyle = rnd.pick(['#ffe2a8', '#bfe8ff', '#ffd0f0']); n.globalAlpha = 0.9; n.fillRect(x + 8, 150, bw * 2 - 16, S - 190); n.globalAlpha = 1;
    }
    d.fillStyle = '#55504a'; d.fillRect(0, S - 40, S, 40);
  }
  const map = textureOf(day);
  const emissiveMap = textureOf(night);
  return { map, emissiveMap };
}

/** One atlas of neon shop signs; cell (col,row) of SIGN_COLS x SIGN_ROWS holds SIGN_NAMES[row*cols+col]. */
export function makeSignAtlas() {
  const cw = 256, ch = 96;
  const [c, g] = canvasOf(cw * SIGN_COLS, ch * SIGN_ROWS);
  g.fillStyle = '#0c0d18'; g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  SIGN_NAMES.forEach((name, i) => {
    const col = i % SIGN_COLS, row = Math.floor(i / SIGN_COLS);
    const x = col * cw, y = row * ch, color = SIGN_COLORS[i % SIGN_COLORS.length];
    g.fillStyle = i % 3 === 0 ? '#1a1030' : i % 3 === 1 ? '#0d2030' : '#2a1220';
    g.fillRect(x + 3, y + 3, cw - 6, ch - 6);
    g.strokeStyle = color; g.lineWidth = 4; g.shadowColor = color; g.shadowBlur = 14;
    g.strokeRect(x + 9, y + 9, cw - 18, ch - 18);
    let size = 44;
    g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
    while (g.measureText(name).width > cw - 40 && size > 14) { size -= 2; g.font = `900 ${size}px "Arial Black", Impact, sans-serif`; }
    g.fillStyle = color; g.fillText(name, x + cw / 2, y + ch / 2 + 2);
    g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(name, x + cw / 2, y + ch / 2 + 2);
  });
  const t = textureOf(c, false);
  return t;
}

export function makeGroundTexture() {
  const rnd = makeRandom(4242);
  const [c, g] = canvasOf(256, 256);
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = rnd.int(170, 255);
    g.fillStyle = `rgba(${v},${v},${v},${rnd.range(0.15, 0.6)})`;
    g.fillRect(rnd() * 256, rnd() * 256, rnd.range(1, 3), rnd.range(1, 3));
  }
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(120,120,120,${rnd.range(0.08, 0.2)})`; g.lineWidth = 1;
    g.beginPath(); let x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += rnd.range(-30, 30); y += rnd.range(-30, 30); g.lineTo(x, y); }
    g.stroke();
  }
  return textureOf(c);
}

export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvasOf(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return textureOf(c, false);
}

export function makeSmokeTexture() {
  const [c, g] = canvasOf(64, 64);
  const rnd = makeRandom(99);
  for (let i = 0; i < 14; i++) {
    const x = rnd.range(20, 44), y = rnd.range(20, 44), r = rnd.range(8, 18);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }
  return textureOf(c, false);
}

/** Text painted on a small canvas: mission marker letters, billboards, licence plates. */
export function makeTextTexture(text, { color = '#fff', bg = 'rgba(0,0,0,0)', size = 96, w = 128, h = 128, font = '"Arial Black", Impact, sans-serif' } = {}) {
  const [c, g] = canvasOf(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = `900 ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.fillText(text, w / 2, h / 2 + size * 0.06);
  return textureOf(c, false);
}
