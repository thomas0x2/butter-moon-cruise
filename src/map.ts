// Tile maps. Each character is one tile; rooms connect through doors like Stardew or Pokemon buildings.
//
// Floors   . teak deck   k galley tiles   d carpet   , carpet behind the pass   p pool   q cobbles
//          m marble   c cabin boards   R rooftops
// Walls    # wall   w wall with porthole   r ship's rail   D door   Z stairs   g locked gangway door
// Galley   F M U V O pantry (fridge, ice box, sacks, crates)   S stove   C cutting board   B bin
//          W menu chalkboard   X pass window   v oven (once bought)   z slop pot
// Rooms    T table   h chair   L sun lounger   o life ring   J bar counter   i bar stool   u funnel
//          Q reception desk   f potted palm   K b bed (head, foot)   j writing desk
//          ! fishing rod stand   % garden planter
// Market   n bollard   G gangway   A P E Y market stalls   x barrel   t plane tree   H I house front
// City     & fountain   l bench
// Galley   e steel counter (holds one thing)   N sink

export type Floor = 'sea' | 'deck' | 'galley' | 'dining' | 'pool' | 'cobble' | 'roof' | 'marble' | 'cabin' | 'stairs';

export type MapId = 'market' | 'lobby' | 'galley' | 'restaurant' | 'lido' | 'cabin' | 'alley' | 'city' | 'garde';

/** Maps on land, in the port city. */
export const ASHORE = new Set<MapId>(['market', 'alley', 'city', 'garde']);

export interface Door {
  x: number;
  y: number;
  to: MapId;
  /** where the chef appears in the destination room */
  sx: number;
  sy: number;
  dir: 'up' | 'down' | 'left' | 'right';
}

export interface WallLook {
  face: string;
  top: string;
  trim: string;
}

export interface TileMap {
  id: MapId;
  name: string;
  rows: string[];
  w: number;
  h: number;
  outside: 'sea' | 'void';
  floorOf: (tx: number, ty: number, c: string) => Floor;
  walkable: Set<string>;
  /** tile character strolling NPCs stay on */
  strollOn: string;
  wall: WallLook;
  doors: Door[];
}

const DOORS = new Set(['D', 'Z']);
const WALLS = new Set(['#', 'w', 'g']);

function build(rows: string[]): string[] {
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) throw new Error(`map row ${i} is ${r.length} wide, expected ${w}`);
  });
  return rows;
}

function make(m: Omit<TileMap, 'w' | 'h'>): TileMap {
  return { ...m, rows: build(m.rows), w: m.rows[0].length, h: m.rows.length };
}

// ------------------------------------------------------------ Marseille

function marketRows(): string[] {
  const W = 34;
  const set = (row: string, x: number, c: string) => row.slice(0, x) + c + row.slice(x + 1);
  const rows: string[] = [];
  for (let y = 0; y < 4; y++) rows.push('~'.repeat(W));
  let quay = 'q'.repeat(W);
  for (const x of [3, 9, 15, 30]) quay = set(quay, x, 'n');
  rows.push(set(quay, 26, 'G'));
  for (let y = 5; y <= 12; y++) {
    let r = 'q'.repeat(W);
    if (y === 6) for (const x of [2, 30]) r = set(r, x, 't');
    if (y === 8) {
      for (const [x, c] of [[5, 'A'], [6, 'A'], [10, 'P'], [11, 'P'], [15, 'E'], [16, 'E'], [20, 'Y'], [21, 'Y']] as [number, string][]) r = set(r, x, c);
      for (const x of [25, 26]) r = set(r, x, 'x');
    }
    if (y === 11) for (const x of [8, 18, 27]) r = set(r, x, 't');
    if (y === 12) for (const x of [1, 32]) r = set(r, x, 'x');
    rows.push(r);
  }
  let houses = 'H'.repeat(W);
  for (const x of [4, 11, 17, 24]) houses = set(houses, x, 'I');
  // open doors: up the steps into Le Panier, and through to the Canebiere
  houses = set(houses, 30, 'D');
  houses = set(houses, 8, 'D');
  rows.push(houses);
  rows.push('R'.repeat(W));
  rows.push('R'.repeat(W));
  return rows;
}

export const MARKET = make({
  id: 'market',
  name: 'Vieux-Port market, Marseille',
  rows: marketRows(),
  outside: 'sea',
  walkable: new Set(['q', 'D']),
  strollOn: 'q',
  wall: { face: '#e8b86a', top: '#c4643a', trim: '#a5733f' },
  floorOf: (_tx, _ty, c) => (c === 'R' || c === 'H' || c === 'I' ? 'roof' : 'cobble'),
  doors: [
    { x: 30, y: 13, to: 'alley', sx: 11.5, sy: 9.3, dir: 'up' },
    { x: 8, y: 13, to: 'city', sx: 5.5, sy: 11.3, dir: 'up' },
  ],
});

export const ALLEY = make({
  id: 'alley',
  name: 'Le Panier, the old quarter',
  rows: [
    '###w####w#####w####w####',
    '#qqqqqqqqqqqqqqqqqqqqqq#',
    '#qPPqqqqqqqqqqqqqqxxqqq#',
    '#qqqqqqqqqtqqqqqqqqqqqq#',
    '#qqqqqqqqqqqqqqqqqqqqqq#',
    '#qqqqqxqqqqqqqqqqqnqqqq#',
    '#qqqqqqqqqqqqqqqqqqqqqq#',
    '#qtqqqqqqqqqqqqqqqqqqtq#',
    '#qqqqqqqqqqqqqqqqqqqqqq#',
    '#qqqqqqqqqqqqqqqqqqqqqq#',
    '###########D############',
  ],
  outside: 'void',
  walkable: new Set(['q', 'D']),
  strollOn: 'q',
  wall: { face: '#e8b86a', top: '#c4643a', trim: '#a5733f' },
  floorOf: () => 'cobble',
  doors: [{ x: 11, y: 10, to: 'market', sx: 30.5, sy: 12.4, dir: 'up' }],
});

export const CITY = make({
  id: 'city',
  name: 'La Canebiere',
  rows: [
    '##############ZZ##############',
    '#qqqqqqqqqqqqqqqqqqqqqqqqqqqq#',
    '#qhThqhThqqqqqqqqqqqqqqqqJJJq#',
    '#qqqqqqqqqqqqqqqqqqqqqqqqqqqq#',
    '#qhThqhThqqqqqqqqqqqqqqqqqqqq#',
    '#qqqqqqqqqqqqqqqqqqqqqqqqqqqq#',
    '#qtqqqqqtqqqqqq&qqqqqqtqqqqtq#',
    '#qqqqqqqqqqqqqqqqqqqqqqqqqqqq#',
    '#qqqqqqqqqqqqqqqqqqqqqqqqqqqq#',
    '#qtqqqqqtqqqqqqqqqqqqqtqqqqtq#',
    '#qqqqqqqqqqqqqqqqqqqqqqqqqqqq#',
    '#xqqqqqqqqqqqqqqqqqqqqqqqqqxq#',
    '#####D########################',
  ],
  outside: 'void',
  walkable: new Set(['q', 'D', 'Z']),
  strollOn: 'q',
  wall: { face: '#efd9a8', top: '#b8553a', trim: '#8a6a3f' },
  floorOf: () => 'cobble',
  doors: [
    { x: 5, y: 12, to: 'market', sx: 8.5, sy: 12.4, dir: 'up' },
    { x: 14, y: 0, to: 'garde', sx: 11.5, sy: 7.6, dir: 'up' },
    { x: 15, y: 0, to: 'garde', sx: 12.5, sy: 7.6, dir: 'up' },
  ],
});

export const GARDE = make({
  id: 'garde',
  name: 'Notre-Dame de la Garde',
  rows: [
    '~~~~~~~~~~~~~~~~~~~~~~~~',
    '~######################~',
    '~#qqqqqqqqqqqqqqqqqqqq#~',
    '~#qqqqqqqqqqqqqqqqqqqq#~',
    '~#qtqqqqqqqqqqqqqqqqtq#~',
    '~#qqqqqqqqqqqqqqqqqqqq#~',
    '~#qqqqqqqqqqqqqqqqqqqq#~',
    '~#qlqlqqqqqqqqqqqqlqlq#~',
    '~#qqqqqqqqqqqqqqqqqqqq#~',
    '~rrrrrrrrrrZZrrrrrrrrrr~',
    '~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
  outside: 'sea',
  walkable: new Set(['q', 'Z']),
  strollOn: 'q',
  wall: { face: '#e9e2d0', top: '#9aa6b2', trim: '#c9a14a' },
  floorOf: () => 'cobble',
  doors: [
    { x: 11, y: 9, to: 'city', sx: 14.5, sy: 1.5, dir: 'down' },
    { x: 12, y: 9, to: 'city', sx: 15.5, sy: 1.5, dir: 'down' },
  ],
});

// ------------------------------------------------------------ ship rooms

export const LOBBY = make({
  id: 'lobby',
  name: 'Grand atrium',
  rows: [
    '###w##w###ZZ###w#D####',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#mfmmmmmmmmmmmmmmmfmm#',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#mmQQQmmmmmmmmmmmmmmm#',
    '#mmmmmmmmmmmmmmmmmmmm#',
    'Dmmmmmmmmmmmmmmmmmmmm' + 'D',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#mfmmmmmmmmmmmmmmmfmm#',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '#mmmmmmmmmmmmmmmmmmmm#',
    '##########gg##########',
  ],
  outside: 'void',
  walkable: new Set(['m', 'D', 'Z']),
  strollOn: 'm',
  wall: { face: '#2f5d6b', top: '#e8dcc0', trim: '#c9a14a' },
  floorOf: () => 'marble',
  doors: [
    { x: 10, y: 0, to: 'lido', sx: 6.5, sy: 6.6, dir: 'down' },
    { x: 11, y: 0, to: 'lido', sx: 6.5, sy: 6.6, dir: 'down' },
    { x: 17, y: 0, to: 'cabin', sx: 4.5, sy: 5.4, dir: 'up' },
    { x: 0, y: 6, to: 'galley', sx: 10.5, sy: 9.4, dir: 'up' },
    { x: 21, y: 6, to: 'restaurant', sx: 13.5, sy: 8.4, dir: 'up' },
  ],
});

/**
 * Laid out like a real line kitchen. Food flows one way: stores by the crew door, the cold line
 * (boards, sink) and hot line (burners, oven) back to back on one long island, and the pass with
 * its heat lamps facing the cooks across a narrow aisle. Steel counters along the way hold one thing each.
 */
export const GALLEY = make({
  id: 'galley',
  name: 'Galley',
  rows: [
    '######################',
    '#,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,#',
    '######eXXXXe##########',
    '#kkkkkkkkkkkkkkkkkkkW#',
    '#kkkkkkkkkkkkkkkkkkkk#',
    '#keSSSSevzeCCeNekkkkk#',
    '#kkkkkkkkkkkkkkkkkkkk#',
    '#kkkkkkkkkkkkkkkkkkkk#',
    '#BkkkkkkeekkkkkkFMUVO#',
    '##########D###########',
  ],
  outside: 'void',
  walkable: new Set(['k', 'D']),
  strollOn: ',',
  wall: { face: '#c9d3dc', top: '#8f9aa6', trim: '#5b6672' },
  floorOf: (_tx, _ty, c) => (c === ',' ? 'dining' : 'galley'),
  doors: [{ x: 10, y: 10, to: 'lobby', sx: 1.5, sy: 6.5, dir: 'right' }],
});

export const RESTAURANT = make({
  id: 'restaurant',
  name: 'The Butter Moon restaurant',
  rows: [
    '##w##w##w##w##w##w##w#',
    '#dddddddddddddddddddd#',
    '#dhThddhThddhThddhThd#',
    '#dddddddddddddddddddd#',
    '#dhThddhThddhThddhThd#',
    '#dddddddddddddddddddd#',
    '#dhThddhThddhThddhThd#',
    '#dddddddddddddddddddd#',
    '#fddddddddddddddddddf#',
    '####XXXX#####DD#######',
  ],
  outside: 'void',
  walkable: new Set(['d', 'D']),
  strollOn: 'd',
  wall: { face: '#5a2a3a', top: '#e3b54a', trim: '#3a1a24' },
  floorOf: () => 'dining',
  doors: [
    { x: 13, y: 9, to: 'lobby', sx: 20.5, sy: 6.5, dir: 'left' },
    { x: 14, y: 9, to: 'lobby', sx: 20.5, sy: 6.5, dir: 'left' },
  ],
});

export const CABIN = make({
  id: 'cabin',
  name: "Chef's cabin",
  rows: [
    '##w###w###',
    '#cKKcccjc#',
    '#cbbccccc#',
    '#ccccccfc#',
    '#cccccccc#',
    '#cccccccc#',
    '####D#####',
  ],
  outside: 'void',
  walkable: new Set(['c', 'D']),
  strollOn: 'c',
  wall: { face: '#e8dcc0', top: '#8a5a32', trim: '#6b4a2a' },
  floorOf: () => 'cabin',
  doors: [{ x: 4, y: 6, to: 'lobby', sx: 17.5, sy: 1.5, dir: 'down' }],
});

function lidoRows(): string[] {
  const W = 42;
  const H = 18;
  const right = (y: number) => [0, 34, 35, 36, 37][Math.min(y, H - 1 - y)] ?? 38;
  const grid: string[][] = [];
  for (let y = 0; y < H; y++) {
    const row = Array(W).fill('~');
    if (y >= 1 && y <= H - 2) {
      const r = right(y);
      for (let x = 1; x <= r; x++) row[x] = y === 1 || y === H - 2 || x === 1 || x === r ? 'r' : '.';
    }
    grid.push(row);
  }
  const put = (x: number, y: number, s: string) => [...s].forEach((c, i) => (grid[y][x + i] = c));
  // deckhouse with the stairs down to the atrium
  put(4, 3, '#####');
  put(4, 4, '#####');
  put(4, 5, '##Z##');
  for (let y = 6; y <= 10; y++) put(14, y, 'pppppppp');
  put(14, 4, 'L.L.L.L.');
  put(14, 12, 'L.L.L.L.');
  put(26, 4, 'JJJJ');
  put(26, 5, 'iiii');
  put(32, 8, 'u');
  put(5, 11, 'hTh');
  put(5, 13, 'hTh');
  put(26, 11, 'hTh');
  put(26, 13, 'hTh');
  put(10, 2, 'o');
  put(24, 2, 'o');
  put(10, 15, 'o');
  // the chef's own corner: a rod stand by the rail and the sun-deck planters
  put(31, 15, '!');
  put(15, 14, '%.%.%');
  put(24, 15, 'o');
  return grid.map((r) => r.join(''));
}

export const LIDO = make({
  id: 'lido',
  name: 'Lido deck',
  rows: lidoRows(),
  outside: 'sea',
  walkable: new Set(['.', 'Z']),
  strollOn: '.',
  wall: { face: '#f3f5f7', top: '#9b6a3e', trim: '#9aa4ae' },
  floorOf: () => 'deck',
  doors: [{ x: 6, y: 5, to: 'lobby', sx: 10.9, sy: 1.5, dir: 'down' }],
});

export const MAPS: Record<MapId, TileMap> = { market: MARKET, alley: ALLEY, city: CITY, garde: GARDE, lobby: LOBBY, galley: GALLEY, restaurant: RESTAURANT, lido: LIDO, cabin: CABIN };

// ------------------------------------------------------------ queries

export function charAt(m: TileMap, tx: number, ty: number): string {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return m.outside === 'sea' ? '~' : ' ';
  return m.rows[ty][tx];
}

export function floorAt(m: TileMap, tx: number, ty: number): Floor {
  const c = charAt(m, tx, ty);
  if (c === '~') return 'sea';
  if (c === 'Z') return 'stairs';
  if (c === 'p') return 'pool';
  return m.floorOf(tx, ty, c);
}

export function isSolid(m: TileMap, tx: number, ty: number): boolean {
  return !m.walkable.has(charAt(m, tx, ty));
}

/** Tiles that get a floor drawn: anything but open sea and the void around interiors. */
export function isLand(m: TileMap, tx: number, ty: number): boolean {
  const c = charAt(m, tx, ty);
  return c !== '~' && c !== ' ';
}

export function isWall(c: string): boolean {
  return WALLS.has(c);
}

export function isDoor(c: string): boolean {
  return DOORS.has(c);
}

export function doorAt(m: TileMap, tx: number, ty: number): Door | undefined {
  return m.doors.find((d) => d.x === tx && d.y === ty);
}
