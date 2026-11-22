// Keyboard and mouse input: held keys, one-shot presses, pointer-locked mouse look.
import { game } from './state.js';

const held = new Set();
const pressed = new Set();
export const mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0, locked: false, lastMove: 0 };

export function isKeyDown(code) {
  return held.has(code);
}

/** True once per physical press; cleared at the end of every frame. */
export function wasKeyPressed(code) {
  return pressed.has(code);
}

export function endInputFrame() {
  pressed.clear();
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.wheel = 0;
}

export function axis(negative, positive) {
  let v = 0;
  for (const code of negative) if (held.has(code)) v -= 1;
  for (const code of positive) if (held.has(code)) v += 1;
  return Math.max(-1, Math.min(1, v));
}

export function requestMouseLook(canvas) {
  if (!mouse.locked && canvas.requestPointerLock) {
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* pointer lock is optional: drag-look still works */ }
  }
}

export function releaseMouseLook() {
  if (document.pointerLockElement) document.exitPointerLock();
}

export function initInput(canvas) {
  const blocked = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyF', 'Slash']);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (blocked.has(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); mouse.left = false; mouse.right = false; });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.left = true; pressed.add('MouseLeft'); }
    if (e.button === 2) { mouse.right = true; pressed.add('MouseRight'); }
    if (game.mode === 'play') requestMouseLook(canvas);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  window.addEventListener('mousemove', (e) => {
    // Look with the locked pointer, or by dragging when the browser refuses the lock.
    if (mouse.locked || mouse.left || mouse.right) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
      mouse.lastMove = performance.now();
    }
  });
  canvas.addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { mouse.locked = document.pointerLockElement === canvas; });
}
