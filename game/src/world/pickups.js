// Things lying around to grab: dropped cash, health and armour, weapons and ammo, mission
// briefcases, and the twenty hidden Golden Flamingos. They spin, bob, and are collected on touch.
import * as THREE from '../../vendor/three.module.min.js';
import { game, emitEvent, onEvent, addMoney } from '../core/state.js';
import { rand } from '../core/mathutil.js';
import { pointInBuilding } from '../core/collision.js';
import { MeshBatch } from '../core/meshbatch.js';
import { groundHeight, CITY, PIER, ISLAND } from './layout.js';
import { addFlamingo } from './props.js';
import { WEAPONS } from '../combat/weapons.js';
import { playSound } from '../audio/sound.js';

const geos = {};
let material = null;

function geometryFor(kind) {
  if (geos[kind]) return geos[kind];
  const b = new MeshBatch();
  if (kind === 'cash') { b.box(0, 0, 0, 0.5, 0.12, 0.26, 0x2fbf5a); b.box(0, 0.12, 0, 0.5, 0.12, 0.26, 0x3fdc6e); b.box(0, 0.05, 0, 0.12, 0.22, 0.28, 0xf5f5f5); }
  else if (kind === 'health') { b.box(0, 0, 0, 0.55, 0.5, 0.3, 0xf5f5f5); b.box(0, 0.08, 0, 0.14, 0.34, 0.32, 0xe02020); b.box(0, 0.18, 0, 0.36, 0.14, 0.32, 0xe02020); }
  else if (kind === 'armor') { b.box(0, 0, 0, 0.55, 0.6, 0.3, 0x2a6bff); b.box(0, 0.42, 0, 0.3, 0.2, 0.32, 0x1a3f9a); }
  else if (kind === 'flamingo') addFlamingo(b, 0, 0, 0, 0.42, 0xffc928);
  else if (kind === 'briefcase') { b.box(0, 0, 0, 0.7, 0.45, 0.2, 0x7a4a22); b.box(0, 0.45, 0, 0.25, 0.1, 0.06, 0x222222); b.box(0, 0.2, 0, 0.72, 0.06, 0.22, 0xd9b36a); }
  else { b.box(0, 0, 0, 0.7, 0.28, 0.36, 0x3a4048); b.box(0, 0.28, 0, 0.5, 0.06, 0.3, 0xf2c230); } // weapon or ammo crate
  geos[kind] = b.build();
  return geos[kind];
}

/** kind: cash | health | armor | weapon | flamingo | briefcase. value: dollars, or a weapon id, or a tag. */
export function spawnPickup(kind, x, z, value = 0, opts = {}) {
  if (!material) material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.12 });
  const mesh = new THREE.Mesh(geometryFor(kind), material);
  mesh.castShadow = true;
  const scale = kind === 'flamingo' ? 1 : 1.25;
  mesh.scale.setScalar(scale);
  game.scene.add(mesh);
  const pickup = { kind, x, z, value, mesh, age: rand.range(0, 3), life: opts.life ?? (kind === 'cash' ? 90 : Infinity), ammo: opts.ammo || 0, tag: opts.tag || null, respawn: opts.respawn || 0, hidden: 0 };
  game.pickups.push(pickup);
  return pickup;
}

export function removePickup(pickup) {
  game.scene.remove(pickup.mesh);
  const i = game.pickups.indexOf(pickup);
  if (i >= 0) game.pickups.splice(i, 1);
}

function collect(p, player) {
  if (p.kind === 'cash') { addMoney(p.value, 'pickup'); playSound('cash'); }
  else if (p.kind === 'health') { if (player.health >= player.maxHealth) return false; player.heal(50); playSound('pickup'); }
  else if (p.kind === 'armor') { if (player.armor >= 100) return false; player.armor = 100; playSound('pickup'); }
  else if (p.kind === 'weapon') {
    const had = !!player.weapons[p.value];
    player.giveWeapon(p.value, p.ammo || WEAPONS[p.value].ammoPack);
    if (!had) player.selectWeapon(p.value);
    playSound('reload');
  } else if (p.kind === 'flamingo') { game.flags['flamingo_' + p.tag] = true; game.stats.flamingos++; playSound('missionPass'); }
  else playSound('pickup');
  emitEvent('pickup', { pickup: p, kind: p.kind, value: p.value, tag: p.tag });
  return true;
}

export function updatePickups(dt) {
  const player = game.player;
  for (const p of [...game.pickups]) {
    p.age += dt;
    if (p.hidden > 0) { p.hidden -= dt; p.mesh.visible = p.hidden <= 0; continue; }
    if (p.age > p.life) { removePickup(p); continue; }
    const y = groundHeight(p.x, p.z);
    p.mesh.position.set(p.x, y + 0.55 + Math.sin(p.age * 2.4) * 0.12, p.z);
    p.mesh.rotation.y = p.age * 1.8;
    if (player.dead) continue;
    const reach = player.vehicle ? (p.kind === 'cash' || p.kind === 'briefcase' ? 2.6 : 0) : 1.25;
    if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < reach && collect(p, player)) {
      if (p.respawn) { p.hidden = p.respawn; p.mesh.visible = false; } else removePickup(p);
    }
  }
}

// Where the twenty Golden Flamingos hide: alleys, the park, the beach, the pier, the docks.
const FLAMINGO_SPOTS = [
  [40, 40], [200, 120], [760, 40], [680, 760], [120, 760], [40, 600], [-40, 520], [198, 444], [262, 372], [PIER.x1 - 6, 380],
  [CITY + 110, 60], [CITY + 96, 740], [440, 680], [360, 40], [600, 120], [520, 760], [-44, -44], [ISLAND.x1 - 44, CITY + 60], [280, 680], [680, 280],
];

/** Places the fixed pickups of a new or loaded game. */
export function placeWorldPickups() {
  for (const p of [...game.pickups]) removePickup(p);
  FLAMINGO_SPOTS.forEach(([x, z], i) => {
    if (game.flags['flamingo_' + i]) return;
    let fx = x, fz = z;
    for (let k = 0; k < 8 && pointInBuilding(fx, fz); k++) { fx += 3; fz += 2; }
    spawnPickup('flamingo', fx, fz, 0, { tag: i });
  });
  for (const [x, z] of [[146, 653], [330, 216], [612, 472], [824, 392], [470, 744], [40, 280]]) spawnPickup('health', x, z, 0, { respawn: 120 });
  for (const [x, z] of [[40, 680], [520, 280], [770, 600]]) spawnPickup('armor', x, z, 0, { respawn: 240 });
  spawnPickup('weapon', 126, 653, 'pistol', { ammo: 36, respawn: 300 });
  spawnPickup('weapon', 280, 760, 'smg', { ammo: 64, respawn: 400 });
  spawnPickup('weapon', -40, 700, 'shotgun', { ammo: 12, respawn: 400 });
}

export const FLAMINGO_TOTAL = FLAMINGO_SPOTS.length;

onEvent('npcKilled', ({ npc }) => {
  if (npc.inVehicle) return;
  const cash = npc.role === 'civilian' ? rand.int(8, 60) : npc.role === 'cop' ? 0 : rand.int(40, 160);
  if (cash) spawnPickup('cash', npc.pos.x + rand.range(-0.6, 0.6), npc.pos.z + rand.range(-0.6, 0.6), cash);
  if (npc.weapon && rand.chance(npc.role === 'civilian' ? 1 : 0.55)) spawnPickup('weapon', npc.pos.x + rand.range(-0.8, 0.8), npc.pos.z + rand.range(-0.8, 0.8), npc.weapon, { ammo: Math.ceil(WEAPONS[npc.weapon].ammoPack / 3), life: 90 });
});
