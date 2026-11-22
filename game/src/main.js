// Sundown Syndicate: boot and the frame loop. Creates the renderer, builds Marisol Bay, then every
// frame advances each system in turn (player, vehicles, people, police, missions) and draws the result.
import * as THREE from '../vendor/three.module.min.js';
import { buildCity, updateCity } from './world/city.js';
import { Vehicle, collideVehicles } from './vehicles/vehicle.js';
import { updateTraffic } from './vehicles/traffic.js';
import { Player } from './characters/player.js';
import { updatePedestrians } from './characters/pedestrians.js';
import { updateWantedLevel, clearWantedLevel, wanted } from './police/wanted.js';
import { updatePolice, clearPolice } from './police/police.js';
import { updateGangs } from './combat/gangs.js';
import { updateMissions, refreshStartMarkers, mission, failMission } from './missions/missions.js';
import './missions/story.js';
import { updateActivities, stopTaxiWork } from './missions/activities.js';
import { updateDialogue, say, clearDialogue } from './missions/dialogue.js';
import { placeShopMarkers, updateShops } from './economy/shops.js';
import { initHud, updateHud, showHint } from './ui/hud.js';
import { initMenus, showTitle, updateMenus } from './ui/menus.js';
import { saveGame, readSavedGame, loadGame, loadSettings } from './systems/save.js';
import { updateRespawn } from './systems/respawn.js';
import { installDebugTools } from './systems/debug.js';
import { updateLoops, playSound, applyVolumes } from './audio/sound.js';
import { updateRadio } from './audio/radio.js';
import { game, onEvent } from './core/state.js';
import { initInput, endInputFrame, mouse } from './core/input.js';
import { cam, updateChaseCamera, snapCameraBehind } from './core/camera.js';
import { initEffects, updateEffects } from './fx/effects.js';
import { placeWorldPickups, updatePickups } from './world/pickups.js';
import { updateMarkers } from './world/markers.js';
import { removeNpcs } from './characters/npc.js';
import { LANDMARKS, ISLAND, CITY } from './world/layout.js';
import { setClock } from './world/sky.js';

const canvas = document.getElementById('world');
let lastFrame = 0;

/** Wipes the streets and puts the player down for a fresh story. */
function startNewGame() {
  resetWorld();
  const p = game.player, lm = LANDMARKS.tiki;
  game.money = 250; game.storyIndex = 0; game.flags = {}; game.day = 1;
  for (const k in game.stats) game.stats[k] = 0;
  p.weapons = { fists: { clip: 0, ammo: 0 } }; p.current = 'fists'; p.armor = 0;
  p.revive(lm.x - 9, lm.z - 3, Math.PI / 2);
  setClock(10.5);
  beginPlay();
  say([['RADIO', 'KBAY 99.1 — another perfect morning in Marisol Bay. Somebody tell Sterling Vance he does not own the sunshine yet.'], ['DEZ', 'Three years. Tiki Taco still smells the same. Lupe will be at the counter.']]);
  showHint('Walk into the pink marker to meet Mama Lupe', 9);
}

/** Restores the game saved at a safehouse. */
function continueSavedGame() {
  const data = readSavedGame();
  if (!data) return startNewGame();
  resetWorld();
  loadGame(data);
  setClock(game.clock);
  beginPlay();
  showHint('Welcome back to Marisol Bay', 4);
}

function quitToTitle() {
  if (mission.active) failMission('Abandoned');
  resetWorld();
  enterTitle();
}

function resetWorld() {
  stopTaxiWork();
  clearDialogue();
  clearWantedLevel(true);
  clearPolice();
  const p = game.player;
  if (p.vehicle) { p.vehicle.driver = null; p.vehicle = null; p.body.root.visible = true; }
  for (const v of [...game.vehicles]) { if (v.parkedAt) v.parkedAt.vehicle = null; v.remove(); }
  removeNpcs(() => true);
  cam.cinematic = null;
  game.debug.spawnInView = false;
  game.time = 0;
}

function beginPlay() {
  game.mode = 'play';
  game.player.body.root.visible = true;
  placeWorldPickups();
  placeShopMarkers();
  refreshStartMarkers();
  snapCameraBehind(game.player.heading);
  applyVolumes();
}

/** The title screen plays over a slow flight along the Ocean Strip. */
function enterTitle() {
  const p = game.player;
  p.revive(CITY - 12, 430, 0);
  p.body.root.visible = false;
  game.debug.spawnInView = true;
  setClock(16.6);
  showTitle();
}

/** One simulation step of the whole city. */
function updateWorld(dt) {
  const p = game.player, mode = game.mode;
  game.time += dt;
  game.dt = dt;
  if (mode === 'play') { game.stats.playSeconds += dt; p.update(dt); }
  else {
    if (p.vehicle) { p.vehicle.input.throttle = 0; p.vehicle.input.steer = 0; p.vehicle.input.brake = 1; p.pos.copy(p.vehicle.pos); }
    p.sync(dt);
  }
  for (const v of [...game.vehicles]) {
    if (v.driver && v.driver !== 'player' && v.driver.update) v.driver.update(dt);
    v.update(dt);
  }
  collideVehicles(dt);
  for (const n of [...game.npcs]) n.update(dt);
  updateTraffic(dt);
  updatePedestrians(dt);
  if (mode !== 'title') {
    updateGangs(dt);
    if (mode === 'play') { updateWantedLevel(dt); updatePolice(dt); updateShops(dt); updateActivities(dt); }
    updateMissions(dt);
    updateDialogue(dt, true);
    updateRespawn(dt);
    updatePickups(dt);
  } else {
    const a = game.time * 0.05;
    cam.cinematic = { x: CITY + 40 + Math.sin(a) * 70, y: 26 + Math.sin(a * 0.7) * 8, z: 430 + Math.cos(a) * 170, lookX: CITY - 60, lookY: 22, lookZ: 400, fov: 58 };
  }
  updateMarkers(dt);
  updateEffects(dt);
  updateCity(dt, p.pos);
  updateRadio(dt);
  updateAmbientSound();
}

function updateAmbientSound() {
  const p = game.player, v = p.vehicle;
  let sirenLevel = 0;
  for (const c of game.vehicles) if (c.siren && !c.destroyed) sirenLevel = Math.max(sirenLevel, 1 - Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) / 130);
  const toSea = Math.min(p.pos.x - ISLAND.x0, ISLAND.x1 - p.pos.x, p.pos.z - ISLAND.z0, ISLAND.z1 - p.pos.z);
  const surf = 1 - toSea / 150;
  if (v && game.mode === 'play') updateLoops(Math.min(1, Math.abs(v.speed) / v.type.topSpeed), Math.abs(v.input.throttle), (Math.abs(v.slip) - 3) / 6, sirenLevel, surf);
  else updateLoops(-1, 0, 0, game.mode === 'title' ? 0 : sirenLevel, surf);
}

function renderFrame(now) {
  requestAnimationFrame(renderFrame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  const steps = game.debug.fastForward || 1;
  const mode = game.mode;
  if (mode === 'play' || mode === 'cutscene' || mode === 'down' || mode === 'title') for (let i = 0; i < steps; i++) updateWorld(dt);
  updateMenus();
  updateChaseCamera(dt);
  updateHud(dt);
  game.renderer.render(game.scene, game.camera);
  game.frame++;
  endInputFrame();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  game.renderer.setSize(w, h, false);
  game.camera.aspect = w / h;
  game.camera.updateProjectionMatrix();
}

function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  game.renderer = renderer;
  game.scene = new THREE.Scene();
  game.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 5000);
  loadSettings();
  initInput(canvas);
  buildCity(game.scene);
  initEffects(game.scene);
  new Player(LANDMARKS.tiki.x - 9, LANDMARKS.tiki.z - 3, Math.PI / 2);
  initHud();
  initMenus({ newGame: startNewGame, continueGame: continueSavedGame, quitToTitle });
  window.addEventListener('resize', resize);
  resize();
  document.addEventListener('pointerlockchange', () => {
    // leaving mouse-look with Esc pauses the game, as players expect
    if (!document.pointerLockElement && game.mode === 'play' && mouse.wasLocked) game.pendingPause = true;
    mouse.wasLocked = !!document.pointerLockElement;
  });
  onEvent('missionPassed', () => { placeShopMarkers(); if (saveGame()) showHint('Progress saved', 3); });
  onEvent('npcKilled', ({ attacker }) => { if (attacker === game.player) game.stats.kills++; });
  onEvent('crash', ({ vehicle, impact }) => playSound('crash', vehicle.pos.x, vehicle.pos.z, Math.min(1, impact / 14)));
  onEvent('vehicleCollision', ({ a, impact }) => playSound('crash', a.pos.x, a.pos.z, Math.min(1, impact / 12)));
  installDebugTools({ startNewGame, continueSavedGame, Vehicle, wanted });
  enterTitle();
  requestAnimationFrame(renderFrame);
}

boot();
