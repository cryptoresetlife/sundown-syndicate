// Developer tools, off unless asked for: URL switches (?autostart skips the title, ?clock=17 sets
// the hour) and a small console API on window.sundown used for testing and for staging screenshots.
import { game } from '../core/state.js';
import { cam, snapCameraBehind } from '../core/camera.js';
import { setClock } from '../world/sky.js';
import { setWantedLevel } from '../police/wanted.js';
import { spawnPoliceCruiser, spawnRoadblock } from '../police/police.js';
import { enterVehicle } from '../vehicles/carjack.js';
import { startMission, storyMissions, mission, refreshStartMarkers } from '../missions/missions.js';
import { WEAPONS } from '../combat/weapons.js';
import { markers } from '../world/markers.js';
import { taxi } from '../missions/activities.js';
import { placeShopMarkers } from '../economy/shops.js';

export function installDebugTools({ startNewGame, Vehicle }) {
  const params = new URLSearchParams(window.location.search);
  const api = {
    game, cam, mission, markers, taxi,
    /** Puts the player back on foot without the exit animation or the speed check. */
    onFoot() {
      const p = game.player;
      if (p.vehicle) { p.vehicle.driver = null; p.vehicle = null; p.body.root.visible = true; }
    },
    /** Moves the player (and the car they are driving) to a spot. */
    warp(x, z, heading = 0) {
      const p = game.player, v = p.vehicle;
      if (v) { v.pos.x = x; v.pos.z = z; v.heading = heading; v.vx = 0; v.vz = 0; }
      p.pos.x = x; p.pos.z = z; p.heading = heading;
      snapCameraBehind(heading);
    },
    /** Spawns a vehicle where the player stands and puts them at the wheel. */
    drive(typeId = 'marlin', paint = 0xe63946) {
      const p = game.player;
      const v = new Vehicle(typeId, p.pos.x, p.pos.z, p.heading, paint);
      enterVehicle(p, v);
      return v;
    },
    arm() {
      const p = game.player;
      for (const id of Object.keys(WEAPONS)) if (!WEAPONS[id].melee) p.giveWeapon(id, WEAPONS[id].ammoPack * 3);
      p.armor = 100; game.money += 5000;
    },
    wanted: (stars) => setWantedLevel(stars),
    cruiser: (type) => spawnPoliceCruiser(type),
    roadblock: () => spawnRoadblock(),
    clock(hour, freeze = true) { setClock(hour); game.debug.freezeClock = freeze; },
    /** Starts story chapter n (1-based), skipping its cutscene when asked. */
    chapter(n, skipIntro = true) {
      game.storyIndex = n - 1;
      refreshStartMarkers();
      return startMission(storyMissions()[n - 1], skipIntro);
    },
    god(on = true) { game.debug.godMode = on; },
    /** Pretends the first n chapters are done and re-places the markers that unlocks. */
    progress(n) { game.storyIndex = n; refreshStartMarkers(); placeShopMarkers(); },
  };
  if (params.has('debug') || params.has('autostart')) window.sundown = api;
  if (params.has('autostart')) startNewGameSoon(startNewGame, params);
  if (params.has('clock')) { setClock(Number(params.get('clock'))); game.debug.freezeClock = true; }
}

function startNewGameSoon(startNewGame, params) {
  // after the first frame, so the title screen has been drawn once
  requestAnimationFrame(() => {
    for (const el of document.querySelectorAll('#menus > div')) el.classList.remove('on');
    startNewGame();
    if (params.has('clock')) { setClock(Number(params.get('clock'))); game.debug.freezeClock = true; }
  });
}
