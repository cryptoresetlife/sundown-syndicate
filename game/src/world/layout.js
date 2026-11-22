// The plan of Marisol Bay: grid dimensions, districts, street names and every named landmark.
// Pure data and lookups; the modules that build meshes read it from here.

export const GRID = 11; // road intersections per axis
export const BLOCK = 80; // metres between intersections
export const ROAD_HALF = 7; // a road is four lanes, 14 m wide
export const SIDEWALK = 3;
export const CITY = (GRID - 1) * BLOCK; // 800 m of streets
export const LANE = 3.5;
export const ISLAND = { x0: -62, z0: -62, x1: CITY + 152, z1: CITY + 78 }; // sand ends, sea begins
export const SHORE_SLOPE = 32; // the last metres of beach slope down into the water
export const PIER = { x0: CITY + 20, x1: CITY + 250, z0: 392, z1: 408, headX0: CITY + 196, headZ0: 372, headZ1: 428, deck: 0.32 };
export const SEA_LEVEL = -0.55;

export function onPier(x, z, margin = 0) {
  if (x < PIER.x0 - margin || x > PIER.x1 + margin) return false;
  if (z > PIER.z0 - margin && z < PIER.z1 + margin) return true;
  return x > PIER.headX0 - margin && z > PIER.headZ0 - margin && z < PIER.headZ1 + margin;
}

/** Height of the walkable ground: flat city, a raised pier deck, and a beach that slopes into the sea. */
export function groundHeight(x, z) {
  if (onPier(x, z)) return PIER.deck;
  const out = Math.max(ISLAND.x0 + SHORE_SLOPE - x, x - (ISLAND.x1 - SHORE_SLOPE), ISLAND.z0 + SHORE_SLOPE - z, z - (ISLAND.z1 - SHORE_SLOPE), 0);
  return -1.2 * Math.min(1, out / SHORE_SLOPE);
}

export const DISTRICTS = {
  downtown: { name: 'Downtown', color: '#8fa3b8' },
  midtown: { name: 'Midtown', color: '#b9a98f' },
  strip: { name: 'Ocean Strip', color: '#f2a7c3' },
  heights: { name: 'Palm Heights', color: '#9cc48a' },
  southside: { name: 'Southside', color: '#e0a060' },
  docks: { name: 'Dockyards', color: '#8d939c' },
  park: { name: 'Flamingo Park', color: '#5fae5a' },
  beach: { name: 'Sunset Beach', color: '#f0deb0' },
};

export const AVENUES = ['Wharf Rd', 'Anchor Ave', 'Heron Ave', 'Flamingo Ave', 'Coral Ave', 'Marisol Blvd', 'Sterling Ave', 'Mango Ave', 'Palmetto Ave', 'Neon Row', 'Tidewater Drive'];
export const STREETS = ['Vista Rd', 'Hibiscus St', 'Orchid St', 'Bank St', 'Liberty St', 'Central St', 'Calle Sol', 'Mercado St', 'Calle Luna', 'Cannery St', 'Southshore Rd'];

/** District key of block (bx, bz), each 0..GRID-2. */
export function districtOfBlock(bx, bz) {
  if (bx >= 2 && bx <= 3 && bz >= 4 && bz <= 5) return 'park';
  if (bx >= 8) return 'strip';
  if (bz <= 1) return 'heights';
  if (bx <= 1 && bz >= 6) return 'docks';
  if (bz >= 8) return 'southside';
  if (bx >= 4 && bx <= 7 && bz >= 2 && bz <= 6) return 'downtown';
  return 'midtown';
}

export function districtAt(x, z) {
  if (x > CITY + ROAD_HALF || z > CITY + ROAD_HALF || x < -ROAD_HALF || z < -ROAD_HALF) return 'beach';
  const bx = Math.max(0, Math.min(GRID - 2, Math.floor(x / BLOCK)));
  const bz = Math.max(0, Math.min(GRID - 2, Math.floor(z / BLOCK)));
  return districtOfBlock(bx, bz);
}

export function streetNameAt(x, z) {
  const i = Math.round(x / BLOCK), j = Math.round(z / BLOCK);
  const offX = Math.abs(x - i * BLOCK), offZ = Math.abs(z - j * BLOCK);
  const ci = Math.max(0, Math.min(GRID - 1, i)), cj = Math.max(0, Math.min(GRID - 1, j));
  if (offX <= ROAD_HALF + SIDEWALK && offX <= offZ) return AVENUES[ci];
  if (offZ <= ROAD_HALF + SIDEWALK) return STREETS[cj];
  return offX < offZ ? AVENUES[ci] : STREETS[cj];
}

/** The 60 m building lot inside block (bx, bz), within its ring of sidewalk. */
export function lotOfBlock(bx, bz) {
  const x0 = bx * BLOCK + ROAD_HALF + SIDEWALK, z0 = bz * BLOCK + ROAD_HALF + SIDEWALK;
  return { x0, z0, x1: x0 + BLOCK - 2 * (ROAD_HALF + SIDEWALK), z1: z0 + BLOCK - 2 * (ROAD_HALF + SIDEWALK) };
}

/** A lot is quartered into four 28 m parcels (q: 0 NW, 1 NE, 2 SW, 3 SE) around a 4 m alley cross. */
export function parcelOf(bx, bz, q) {
  const lot = lotOfBlock(bx, bz);
  const x0 = lot.x0 + (q % 2) * 32, z0 = lot.z0 + Math.floor(q / 2) * 32;
  return { x0, z0, x1: x0 + 28, z1: z0 + 28, north: q < 2 };
}

// Named places. Each takes one parcel: a building at the back, an open forecourt on the street side
// where its marker stands. `sign` is the neon sign shown on the building (an index into SIGN_NAMES).
const PLACES = [
  { id: 'safehouse', name: 'Calloway Boat Works', kind: 'safehouse', block: [1, 8], q: 1, sign: 30, color: 0x3fb7a5 },
  { id: 'penthouse', name: 'Coraline Penthouse', kind: 'safehouse', block: [8, 5], q: 2, sign: 12, color: 0xf4a3c0, price: 6000 },
  { id: 'paint_south', name: 'Fresh Coat Customs', kind: 'paint', block: [5, 7], q: 2, sign: 6, color: 0xff7a3d },
  { id: 'paint_north', name: 'Fresh Coat Customs', kind: 'paint', block: [7, 1], q: 3, sign: 6, color: 0xff7a3d },
  { id: 'guns_downtown', name: 'Iron Pelican Arms', kind: 'guns', block: [6, 4], q: 3, sign: 5, color: 0x59636e },
  { id: 'guns_docks', name: 'Iron Pelican Arms', kind: 'guns', block: [2, 8], q: 0, sign: 5, color: 0x59636e },
  { id: 'hospital', name: 'Mercy General', kind: 'hospital', block: [3, 2], q: 2, sign: 31, color: 0xf5f5f5 },
  { id: 'police', name: 'Marisol Bay PD', kind: 'police', block: [6, 6], q: 1, sign: 19, color: 0x3a5f9a },
  { id: 'tiki', name: 'Tiki Taco', kind: 'food', block: [7, 8], q: 0, sign: 0, color: 0xffc23d },
  { id: 'benny', name: "Benny's Chop Shop", kind: 'contact', block: [0, 6], q: 3, sign: 26, color: 0x8a6f52 },
  { id: 'bank', name: 'Bank of Marisol', kind: 'contact', block: [5, 3], q: 2, sign: 19, color: 0xe8e2d0 },
  { id: 'club', name: 'Club Flamingo', kind: 'contact', block: [8, 3], q: 1, sign: 4, color: 0xff4fa3 },
  { id: 'stash', name: 'Coral Kings Stash', kind: 'contact', block: [3, 9], q: 1, sign: 11, color: 0xb04a3a },
  { id: 'diner', name: 'Sundown Diner', kind: 'food', block: [2, 2], q: 3, sign: 28, color: 0x5fd0d8 },
  { id: 'juno', name: "Juno's Arcade", kind: 'contact', block: [4, 7], q: 0, sign: 15, color: 0x9a6bff },
];

export const LANDMARKS = {};
for (const p of PLACES) {
  const parcel = parcelOf(p.block[0], p.block[1], p.q);
  const north = parcel.north;
  const bz0 = north ? parcel.z0 + 13 : parcel.z0, bz1 = north ? parcel.z1 : parcel.z0 + 15;
  LANDMARKS[p.id] = {
    ...p, parcel, north,
    building: { x0: parcel.x0, z0: bz0, x1: parcel.x1, z1: bz1 },
    x: parcel.x0 + 14, z: north ? parcel.z0 + 6.5 : parcel.z0 + 21.5, // forecourt centre: the marker
    facing: north ? Math.PI : 0, // which way the shop front looks (heading)
    // a spot on the street outside, for cars to arrive at
    streetX: parcel.x0 + 14, streetZ: north ? p.block[1] * BLOCK + 4 : (p.block[1] + 1) * BLOCK - 4,
  };
}

export function isLandmarkParcel(bx, bz, q) {
  for (const p of PLACES) if (p.block[0] === bx && p.block[1] === bz && p.q === q) return LANDMARKS[p.id];
  return null;
}

export const VANCE_TOWER_BLOCK = [5, 4];
export const HOSPITAL_SPAWN = { x: LANDMARKS.hospital.x, z: LANDMARKS.hospital.z };
export const POLICE_SPAWN = { x: LANDMARKS.police.x, z: LANDMARKS.police.z };
