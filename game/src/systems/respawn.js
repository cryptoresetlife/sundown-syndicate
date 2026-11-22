// What happens when the player goes down: FLATLINED (killed) wakes them at Mercy General for a
// fee, BOOKED (arrested) at the police station without their guns. The heat is cleared either way.
import { game, onEvent, emitEvent, addMoney } from '../core/state.js';
import { HOSPITAL_SPAWN, POLICE_SPAWN } from '../world/layout.js';
import { clearWantedLevel } from '../police/wanted.js';
import { clearPolice } from '../police/police.js';
import { snapCameraBehind } from '../core/camera.js';
import { formatMoney } from '../core/mathutil.js';

export const down = { active: false, cause: '', timer: 0, fee: 0 };

onEvent('playerDown', ({ cause }) => {
  down.active = true; down.cause = cause; down.timer = 4.2;
  down.fee = cause === 'booked' ? Math.min(600, Math.round(game.money * 0.12)) : Math.min(450, Math.round(game.money * 0.1));
  if (cause === 'booked') game.stats.busted++; else game.stats.flatlined++;
  game.mode = 'down';
});

/** Counts down the "down" screen, then puts the player back on their feet. */
export function updateRespawn(dt) {
  if (!down.active) return;
  down.timer -= dt;
  if (down.timer > 0) return;
  const p = game.player;
  down.active = false;
  clearWantedLevel(true);
  clearPolice();
  addMoney(-down.fee, 'fee');
  const at = down.cause === 'booked' ? POLICE_SPAWN : HOSPITAL_SPAWN;
  p.revive(at.x + 3, at.z, 0);
  p.armor = 0;
  if (down.cause === 'booked') { p.weapons = { fists: { clip: 0, ammo: 0 } }; p.current = 'fists'; }
  game.clock = (game.clock + 5) % 24;
  game.mode = 'play';
  snapCameraBehind(p.heading);
  emitEvent('hint', { text: down.cause === 'booked' ? 'Released on bail: ' + formatMoney(down.fee) + '. Your weapons were confiscated.' : 'Patched up at Mercy General: ' + formatMoney(down.fee) });
  emitEvent('respawned', { cause: down.cause });
}
