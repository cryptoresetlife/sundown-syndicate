// Builds Marisol Bay: lays the ground (asphalt, sidewalks, lawns, sand), then calls on the roads,
// buildings, props, sea and sky modules to raise the rest of the island.
import '../vehicles/traffic.js'; // load order: the city, then the traffic and people that fill it
import * as THREE from '../../vendor/three.module.min.js';
import { game } from '../core/state.js';
import { MeshBatch } from '../core/meshbatch.js';
import { makeRandom } from '../core/mathutil.js';
import { GRID, BLOCK, ROAD_HALF, SIDEWALK, CITY, ISLAND, SHORE_SLOPE, districtOfBlock } from './layout.js';
import { makeGroundTexture } from './textures.js';
import { buildRoads, updateTrafficLights } from './roads.js';
import { buildBuildings } from './buildings.js';
import { buildProps } from './props.js';
import { buildOcean, updateOcean } from './ocean.js';
import { initSky, updateDayNight } from './sky.js';

/** Creates the whole static city in the scene. Deterministic: the same island every run. */
export function buildCity(scene) {
  const rnd = makeRandom(20261117);
  buildGround(scene);
  buildRoads(scene);
  buildBuildings(scene, rnd);
  animateProps = buildProps(scene, rnd);
  buildOcean(scene);
  initSky(scene);
}

export function updateCity(dt, focus) {
  updateTrafficLights(dt);
  updateDayNight(dt, focus);
  updateOcean(dt, game.scene.fog.color);
  if (animateProps) animateProps(dt, game.time);
}

function buildGround(scene) {
  const g = new MeshBatch();
  const edge = ROAD_HALF + SIDEWALK;
  g.plane(-ROAD_HALF, -ROAD_HALF, CITY + ROAD_HALF, CITY + ROAD_HALF, 0, ASPHALT);
  for (let bx = 0; bx < GRID - 1; bx++) for (let bz = 0; bz < GRID - 1; bz++) {
    const d = districtOfBlock(bx, bz);
    if (d === 'park') continue;
    const x0 = bx * BLOCK + ROAD_HALF, z0 = bz * BLOCK + ROAD_HALF, s = BLOCK - 2 * ROAD_HALF;
    g.box(x0 + s / 2, 0, z0 + s / 2, s, 0.15, s, PAVING);
    g.plane(x0 + SIDEWALK, z0 + SIDEWALK, x0 + s - SIDEWALK, z0 + s - SIDEWALK, 0.165, LOT_COLORS[d]);
    // paving joints so the sidewalk reads as slabs
    for (let k = 6; k < s; k += 6) {
      g.plane(x0 + k, z0, x0 + k + 0.06, z0 + SIDEWALK, 0.158, 0xa9a59a);
      g.plane(x0 + k, z0 + s - SIDEWALK, x0 + k + 0.06, z0 + s, 0.158, 0xa9a59a);
      g.plane(x0, z0 + k, x0 + SIDEWALK, z0 + k + 0.06, 0.158, 0xa9a59a);
      g.plane(x0 + s - SIDEWALK, z0 + k, x0 + s, z0 + k + 0.06, 0.158, 0xa9a59a);
    }
  }
  // Flamingo Park is one two-by-two lawn
  const px0 = 2 * BLOCK + ROAD_HALF, pz0 = 4 * BLOCK + ROAD_HALF, ps = 2 * BLOCK - 2 * ROAD_HALF;
  g.box(px0 + ps / 2, 0, pz0 + ps / 2, ps, 0.15, ps, PAVING);
  g.plane(px0 + SIDEWALK, pz0 + SIDEWALK, px0 + ps - SIDEWALK, pz0 + ps - SIDEWALK, 0.165, LOT_COLORS.park, 5);
  // the outer sidewalk ring, then sand out to the waterline
  const a = -edge, b = CITY + edge, r0 = -ROAD_HALF, r1 = CITY + ROAD_HALF;
  g.box((a + b) / 2, 0, (a + r0) / 2, b - a, 0.15, SIDEWALK, PAVING);
  g.box((a + b) / 2, 0, (b + r1) / 2, b - a, 0.15, SIDEWALK, PAVING);
  g.box((a + r0) / 2, 0, (r0 + r1) / 2, SIDEWALK, 0.15, r1 - r0, PAVING);
  g.box((b + r1) / 2, 0, (r0 + r1) / 2, SIDEWALK, 0.15, r1 - r0, PAVING);
  const F = { x0: ISLAND.x0 + SHORE_SLOPE, z0: ISLAND.z0 + SHORE_SLOPE, x1: ISLAND.x1 - SHORE_SLOPE, z1: ISLAND.z1 - SHORE_SLOPE };
  const sy = 0.07;
  g.plane(F.x0, F.z0, F.x1, a, sy, SAND, 5);
  g.plane(F.x0, b, F.x1, F.z1, sy, SAND, 5);
  g.plane(F.x0, a, a, b, sy, SAND, 5);
  g.plane(b, a, F.x1, b, sy, SAND, 5);
  const lo = -1.25, I = ISLAND, WET = 0xd9c48f;
  g.quad([I.x0, lo, I.z1], [F.x0, sy, F.z1], [F.x0, sy, F.z0], [I.x0, lo, I.z0], WET); // west shore
  g.quad([F.x1, sy, F.z1], [I.x1, lo, I.z1], [I.x1, lo, I.z0], [F.x1, sy, F.z0], WET); // east shore
  g.quad([I.x0, lo, I.z0], [F.x0, sy, F.z0], [F.x1, sy, F.z0], [I.x1, lo, I.z0], WET); // north shore
  g.quad([F.x0, sy, F.z1], [I.x0, lo, I.z1], [I.x1, lo, I.z1], [F.x1, sy, F.z1], WET); // south shore
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: makeGroundTexture(), roughness: 0.92 });
  const mesh = g.mesh(mat, false);
  scene.add(mesh);
}

const LOT_COLORS = { downtown: 0xa9a8a2, midtown: 0xb3ad9f, strip: 0xe9dcc2, heights: 0x5fb04c, southside: 0xb9a184, docks: 0x767a80, park: 0x52a846 };
const ASPHALT = 0x45484e, PAVING = 0xc9c5ba, SAND = 0xf6e3b4;
let animateProps = null;
