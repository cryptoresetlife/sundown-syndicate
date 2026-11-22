// Subtitled dialogue: a queue of spoken lines shown one at a time at the bottom of the screen,
// each with its speaker's name and colour. Cutscenes and missions both talk through this.
import { wasKeyPressed } from '../core/input.js';
import { playSound } from '../audio/sound.js';

export const SPEAKERS = {
  DEZ: '#ffb81c', LUPE: '#ff7ab8', BENNY: '#7fd4ff', JUNO: '#b79bff', VANCE: '#ffd98a', ROYCE: '#9fb4c8',
  RIPTIDE: '#ff6b4a', KINGS: '#ff6b4a', DISPATCH: '#8fb8ff', FARE: '#b8f0a0', RADIO: '#b8f0a0',
};

export const dialogue = { current: null, queue: [], onDone: null, timer: 0 };

/** lines: [['SPEAKER', 'text'], ...]. onDone runs after the last line has been shown. */
export function say(lines, onDone = null) {
  for (const [speaker, text] of lines) dialogue.queue.push({ speaker, text });
  if (onDone) dialogue.queue.push({ done: onDone });
  if (!dialogue.current) next();
}

function next() {
  let item = dialogue.queue.shift();
  while (item && item.done) { item.done(); item = dialogue.queue.shift(); }
  dialogue.current = item || null;
  if (item) { dialogue.timer = 1.3 + item.text.length * 0.042; playSound('ui', null, null, 0.4); }
}

export function isTalking() {
  return !!dialogue.current || dialogue.queue.length > 0;
}

export function clearDialogue() {
  dialogue.queue.length = 0;
  dialogue.current = null;
}

export function updateDialogue(dt, allowSkip = false) {
  if (!dialogue.current) { if (dialogue.queue.length) next(); return; }
  dialogue.timer -= dt;
  if (dialogue.timer <= 0 || (allowSkip && (wasKeyPressed('Enter') || wasKeyPressed('Space')))) next();
}
