// Tile maps. Each character is one tile.
// Ship:   ~ sea   r rail   # low wall   . teak deck   k galley floor   d dining carpet   p pool
//         F M U V O pantry (fridge, ice box, sacks, crates)   S stove   C cutting board   B bin
//         W menu board   T table   h chair   L sun lounger   o life ring
// Market: q cobbles   n bollard   G gangway   A P E D market stalls   x barrel   t plane tree
//         H I house front (I has a door)   R rooftops

export type Floor = 'sea' | 'deck' | 'galley' | 'dining' | 'pool' | 'cobble' | 'roof';

export interface TileMap {
  id: 'ship' | 'market';
  rows: string[];
  w: number;
  h: number;
  floorOf: (tx: number, ty: number, c: string) => Floor;
  walkable: Set<string>;
  /** tile character strolling passengers stay on */
  strollOn: string;
}

function pad(s: string, w: number, fill = '~') {
  return (s + fill.repeat(w)).slice(0, w);
}

function shipRows(): string[] {
  const W = 32;
  const galley = ['FMUkSSkCCk', 'kkkkkkkkkW', 'Vkkkkkkkkk', 'Okkkkkkkkk', 'Bkkkkkkkkk'];
  const dining = ['ddddddddd', 'dhThdhThd', 'ddddddddd', 'dhThdhThd', 'ddddddddd'];
  const galleyDoor = ['#', '#', 'k', '#', '#'];
  const diningDoor = ['#', '#', 'd', '#', '#'];
  const bow = ['....o', '......', '.......', '.hTh...', '.......'];
  const lower = [
    '............................',
    '.L.L....pppppp...hTh..hTh...',
    '........pppppp.............o',
    '.L.L....pppppp...hTh.......',
    '..........................',
  ];
  const rows: string[] = [];
  rows.push('~'.repeat(W));
  rows.push(pad('~' + 'r'.repeat(28), W));
  for (let i = 0; i < 5; i++) rows.push(pad('~r' + galley[i] + galleyDoor[i] + dining[i] + diningDoor[i] + bow[i] + 'r', W));
  rows.push(pad('~r' + '#####k#####' + '####d#####' + '.......' + 'r', W));
  for (const l of lower) rows.push(pad('~r' + l + 'r', W));
  rows.push(pad('~' + 'r'.repeat(28), W));
  while (rows.length < 16) rows.push('~'.repeat(W));
  return rows;
}

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
      for (const [x, c] of [[5, 'A'], [6, 'A'], [10, 'P'], [11, 'P'], [15, 'E'], [16, 'E'], [20, 'D'], [21, 'D']] as [number, string][]) r = set(r, x, c);
      for (const x of [25, 26]) r = set(r, x, 'x');
    }
    if (y === 11) for (const x of [8, 18, 27]) r = set(r, x, 't');
    if (y === 12) for (const x of [1, 32]) r = set(r, x, 'x');
    rows.push(r);
  }
  let houses = 'H'.repeat(W);
  for (const x of [4, 11, 17, 24, 30]) houses = set(houses, x, 'I');
  rows.push(houses);
  rows.push('R'.repeat(W));
  rows.push('R'.repeat(W));
  return rows;
}

const SHIP_ROWS = shipRows();
const MARKET_ROWS = marketRows();

export const SHIP: TileMap = {
  id: 'ship',
  rows: SHIP_ROWS,
  w: SHIP_ROWS[0].length,
  h: SHIP_ROWS.length,
  walkable: new Set(['.', 'k', 'd']),
  strollOn: '.',
  floorOf: (tx, ty, c) => {
    if (c === 'p') return 'pool';
    if (c === 'k') return 'galley';
    if (c === 'd') return 'dining';
    if (c === '#' || c === 'r') return 'deck';
    if (tx >= 2 && tx <= 11 && ty >= 2 && ty <= 6) return 'galley';
    if (tx >= 13 && tx <= 21 && ty >= 2 && ty <= 6) return 'dining';
    return 'deck';
  },
};

export const MARKET: TileMap = {
  id: 'market',
  rows: MARKET_ROWS,
  w: MARKET_ROWS[0].length,
  h: MARKET_ROWS.length,
  walkable: new Set(['q']),
  strollOn: 'q',
  floorOf: (_tx, _ty, c) => (c === 'R' || c === 'H' || c === 'I' ? 'roof' : 'cobble'),
};

export function charAt(m: TileMap, tx: number, ty: number): string {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return '~';
  return m.rows[ty][tx];
}

export function floorAt(m: TileMap, tx: number, ty: number): Floor {
  const c = charAt(m, tx, ty);
  return c === '~' ? 'sea' : m.floorOf(tx, ty, c);
}

export function isSolid(m: TileMap, tx: number, ty: number): boolean {
  return !m.walkable.has(charAt(m, tx, ty));
}

export function isLand(m: TileMap, tx: number, ty: number): boolean {
  return charAt(m, tx, ty) !== '~';
}
