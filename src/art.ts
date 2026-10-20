// Procedural placeholder pixel art. Everything is drawn from code so the
// prototype needs no asset files; swap these for real sprite sheets later.

import { drawBlock, hash2, makeCanvas, type BlockColors } from './grid';
import type { Floor } from './map';

type Palette = Record<string, string>;

function paint(rows: string[], pal: Palette): HTMLCanvasElement {
  const [c, g] = makeCanvas(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

// ---------------------------------------------------------------- people

const CHEF_HAT = ['...kkkkkk...', '..kWWWWWWk..', '.kWWWWWWWWk.', '.kWWWWWWWWk.', '..kWWWWWWk..', '..kggggggk..'];
const HAIR_SHORT = ['............', '............', '............', '............', '...khhhhk...', '..khhhhhhk..'];
const HAIR_BUN = ['............', '............', '....khhk....', '....khhk....', '...khhhhk...', '..khhhhhhk..'];
const SUN_HAT = ['............', '............', '....kkkk....', '...kyyyyk...', '.kkyyyyyykk.', 'kyyyyyyyyyyk'];

const FRONT = [
  '..khsssshk..', '..ksessesk..', '..kssSSssk..', '...kssssk...',
  '..kwwrrwwk..', '.kwwwrrwwwk.', '.kwwwwkwwwk.', 'kgwwwwwwwwgk', 'kswwwwkwwwsk', '.kwwwwwwwwk.', '.kggggggggk.',
];
const BACK = [
  '..khhhhhhk..', '..khhhhhhk..', '..kshhhhsk..', '...kssssk...',
  '..kwwwwwwk..', '.kwwwwwwwwk.', '.kwwwwwwwwk.', 'kgwwwwwwwwgk', 'kswwwwwwwwsk', '.kwwwwwwwwk.', '.kggggggggk.',
];
const SIDE = [
  '..khhssssk..', '..khsssesk..', '..khssssSk..', '...kssssk...',
  '..kwwwwrrk..', '.kwwwwwwrwk.', '.kwwgwwwwwk.', '.kwwgwwwwwk.', '.kwwswwwwwk.', '.kwwwwwwwwk.', '.kggggggggk.',
];
const LEGS_FRONT = [
  ['..kbbkkbbk..', '..kbbkkbbk..', '..kkk..kkk..'],
  ['..kbbkkbbk..', '..kbbk.kkk..', '..kkk.......'],
  ['..kbbkkbbk..', '..kkk.kbbk..', '.......kkk..'],
];
const LEGS_SIDE = [
  ['..kbbkbbk...', '..kbbkbbk...', '...kkkkkkk..'],
  ['..kbbkbbk...', '.kbbk..kbbk.', '.kkk...kkk..'],
  ['..kbbbbk....', '...kbbk.....', '...kkkk.....'],
];

export type Dir = 'down' | 'up' | 'right' | 'left';

export interface Look {
  top: 'chef' | 'short' | 'bun' | 'sunhat';
  pal: Palette;
  pattern: boolean;
}

export const CHEF_LOOK: Look = {
  top: 'chef',
  pattern: false,
  pal: {
    k: '#1d1d2b', W: '#ffffff', w: '#f4f4f0', g: '#c3c8d0', r: '#d64545',
    b: '#2d3550', s: '#f1c27d', S: '#d9a066', h: '#5a3825', e: '#222233',
  },
};

const SHIRTS = [['#ff7a59', '#d4573a'], ['#3fb6c9', '#2a8899'], ['#f5c542', '#cc9c1f'], ['#8e6fe0', '#6a4fb8'], ['#5fcf7a', '#3c9c55'], ['#ff8fb8', '#d4628c']];
const SKINS = [['#f1c27d', '#d9a066'], ['#c68642', '#a0652d'], ['#8d5524', '#6b3e18'], ['#ffdbac', '#e8b98a']];
const HAIRS = ['#2b1b10', '#5a3825', '#c9a14a', '#b5b5b5', '#a8461f', '#121212'];
const TOPS: Look['top'][] = ['short', 'bun', 'sunhat'];

const BASE_PAL: Palette = { k: '#1d1d2b', w: '#ff7a59', g: '#d4573a', r: '#fff6d6', b: '#c8b38a', s: '#f1c27d', S: '#d9a066', h: '#5a3825', e: '#222233', y: '#e8cf7a' };

/** A named character's look: base palette with a few overrides. */
export function makeLook(top: Look['top'], pal: Palette, pattern = false): Look {
  return { top, pattern, pal: { ...BASE_PAL, ...pal } };
}

export function randomLook(rand: () => number): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const [w, g] = pick(SHIRTS);
  const [s, S] = pick(SKINS);
  return {
    top: pick(TOPS),
    pattern: rand() < 0.6,
    pal: { k: '#1d1d2b', w, g, r: '#fff6d6', b: pick(['#c8b38a', '#2d3550', '#4a6fa5', '#e9e4d4']), s, S, h: pick(HAIRS), e: '#222233', y: '#e8cf7a' },
  };
}

const personCache = new Map<string, HTMLCanvasElement>();
const lookIds = new WeakMap<Look, number>();
let nextLookId = 1;

/** 12x20 sprite. frame 0 = idle, 1/2 = walk. seated crops legs. */
export function personSprite(look: Look, dir: Dir, frame: number, seated = false): HTMLCanvasElement {
  let id = lookIds.get(look);
  if (!id) {
    id = nextLookId++;
    lookIds.set(look, id);
  }
  const key = `${id}:${dir}:${frame}:${seated}`;
  const hit = personCache.get(key);
  if (hit) return hit;

  const top = look.top === 'chef' ? CHEF_HAT : look.top === 'bun' ? HAIR_BUN : look.top === 'sunhat' ? SUN_HAT : HAIR_SHORT;
  const body = dir === 'down' ? FRONT : dir === 'up' ? BACK : SIDE;
  const legs = (dir === 'down' || dir === 'up' ? LEGS_FRONT : LEGS_SIDE)[frame];
  let rows = [...top, ...body, ...(seated ? [] : legs)];
  if (look.pattern) {
    rows = rows.map((row, y) =>
      row.split('').map((ch, x) => (ch === 'w' && y > 9 && hash2(x * 3 + id!, y) < 0.22 ? 'r' : ch)).join(''),
    );
  }
  let c = paint(rows, look.pal);
  if (dir === 'left') {
    const [f, g] = makeCanvas(c.width, c.height);
    g.scale(-1, 1);
    g.drawImage(c, -c.width, 0);
    c = f;
  }
  personCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- items

/** Any ingredient or dish id from data.ts. */
export type Item = string;

const ROUND = ['...ss...', '..kssk..', '.kccccK.', 'kclcccdk', 'kclcccdk', 'kccccddk', '.kddddk.', '..kkkk..'];
const FLAT_ROUND = ['........', '........', '..kkkk..', '.kccccK.', 'kclcccdk', 'kccccddk', '.kddddk.', '..kkkk..'];
const BOWL = ['........', '........', '.xcxccx.', 'cccxcccc', 'kbbbbbbk', '.kbbbbk.', '..kkkk..', '........'];
const PLATE = ['........', '........', '..cxcc..', '.ccccxc.', 'cccxcccc', 'wwwwwwww', '.gggggg.', '........'];

const ICONS: Record<string, [string[], Palette]> = {
  fish: [['........', '..kkk..k', '.kbbbkkk', 'kbebbbbk', 'kbllbbbk', '.kllbkkk', '..kkk..k', '........'],
    { k: '#2b3a55', b: '#d9826b', l: '#f5d0c0', e: '#111111' }],
  mussels: [['........', '..kkk...', '.kbbbk..', 'kbbbbbk.', 'kbblbbbk', '.kbbbbbk', '..kkbbk.', '....kk..'],
    { k: '#14172a', b: '#2f3658', l: '#9fb0d8' }],
  tomato: [ROUND, { s: '#2e7d32', k: '#6b1010', c: '#e53935', d: '#b71c1c', l: '#ff9e94', K: '#6b1010' }],
  onion: [ROUND, { s: '#c9a46a', k: '#5a2a3a', c: '#b06a8a', d: '#8a4568', l: '#e6b8cc', K: '#5a2a3a' }],
  garlic: [['...kk...', '...kk...', '..kwwk..', '.kwwlwk.', 'kwwlwwgk', 'kwwlwwgk', '.kggggk.', '..kkkk..'],
    { k: '#7a6a55', w: '#f7f2e8', l: '#ffffff', g: '#d9ccb4' }],
  potato: [FLAT_ROUND, { k: '#5a3b1c', c: '#c9955d', d: '#a5733f', l: '#e3b885', K: '#5a3b1c' }],
  courgette: [['......k.', '.....kgk', '....kglk', '...kglgk', '..kglgk.', '.kglgk..', 'kgggk...', '.kkk....'],
    { k: '#1f4a1f', g: '#3f8f3f', l: '#8fd06a' }],
  lemon: [FLAT_ROUND, { k: '#8a6a00', c: '#ffe14a', d: '#e6b800', l: '#fff6b0', K: '#8a6a00' }],
  saffron: [['........', '..kkkk..', '..kwwk..', '.kssssk.', '.ksSssk.', '.ksssSk.', '.kssssk.', '..kkkk..'],
    { k: '#4a2a10', w: '#e8e0d0', s: '#e8541c', S: '#ffb03a' }],
  herbs: [['....g...', '..g.gg..', '.gglgg..', '..glgg.g', '.g.gggg.', '...gkg..', '....k...', '....k...'],
    { g: '#5c8f3a', l: '#a8d67a', k: '#6b4a2a' }],
  oil: [['...kk...', '...gg...', '..kGGk..', '.kGGGGk.', '.kGlGGk.', '.kGlGGk.', '.kGGGGk.', '..kkkk..'],
    { k: '#2f3a10', g: '#8a6a3a', G: '#b5b830', l: '#e8ec80' }],
  flour: [['...kk...', '..kwwk..', '..kssk..', '.kwwwwk.', 'kwwwwwwk', 'kwwsswwk', 'kswwwwsk', '.kkkkkk.'],
    { k: '#6d5c43', w: '#f7f2e8', s: '#d9ccb4' }],
  butter: [['........', '........', '..kkkk..', '.kyyyyk.', '.kyyyYk.', 'gkYYYYkg', '.gggggg.', '........'],
    { k: '#8a6212', y: '#ffe066', Y: '#f2b705', g: '#cfd6dd' }],
  cheese: [['........', '........', '.....kk.', '...kkyyk', '.kkyyyyk', 'kyyhyyyk', 'kyyyyhyk', 'kkkkkkkk'],
    { k: '#8a6212', y: '#f5d36a', h: '#d9a83a' }],
  eggs: [['...kk...', '..kwwk..', '.kwlwwk.', '.kwlwwk.', 'kwwwwwwk', 'kwwwwwgk', '.kwwwgk.', '..kkkk..'],
    { k: '#8a7a60', w: '#fbf3e4', l: '#ffffff', g: '#e6d6b8' }],
  bread: [['........', '......kk', '....kkbk', '...kbBbk', '..kbBbk.', '.kbBbk..', 'kbbbk...', '.kkk....'],
    { k: '#5a3412', b: '#d99a4e', B: '#f2c27a' }],

  bouillabaisse: [BOWL, { c: '#e8743b', x: '#f5d36a', b: '#2d6fb0', k: '#16365a' }],
  croissant: [['........', '........', '..kkkk..', '.kcxcxk.', 'kcxccxck', 'kck..kck', '.k....k.', '........'],
    { k: '#7a4a12', c: '#e8a64a', x: '#f5cf85' }],
  moules: [BOWL, { c: '#2f3658', x: '#f2c05a', b: '#d8dde3', k: '#6b7682' }],
  grilled: [['........', '........', '..kkkk.k', '.kbdbdkk', 'kbdbdbbk', 'wkkkkkkw', '.wwwwww.', '..gggg..'],
    { k: '#3b2412', b: '#c9843f', d: '#6d3f17', w: '#ffffff', g: '#b8c2cc' }],
  ratatouille: [PLATE, { c: '#c8402f', x: '#5fae4a', w: '#ffffff', g: '#b8c2cc' }],
  onionsoup: [BOWL, { c: '#f5d36a', x: '#b5763a', b: '#8a4b2a', k: '#4a2412' }],
  gratin: [PLATE, { c: '#f2c66d', x: '#c98b3a', w: '#ffffff', g: '#b8c2cc' }],
  omelette: [PLATE, { c: '#ffd85a', x: '#5fae4a', w: '#ffffff', g: '#b8c2cc' }],
  tarte: [PLATE, { c: '#ffe66b', x: '#d9a050', w: '#ffffff', g: '#b8c2cc' }],
  salade: [BOWL, { c: '#e53935', x: '#b06a8a', b: '#d39b5b', k: '#5a3a1a' }],
  aioli: [['........', '........', '..yyyy..', '.yyWyyy.', 'bbbbbbbb', 'bBbbBbbb', '.bbbbbb.', '........'],
    { y: '#fff3c4', W: '#ffffff', b: '#d99a4e', B: '#f2c27a' }],
  slop: [BOWL, { c: '#8a7a5c', x: '#6b5a3a', b: '#9aa4ae', k: '#4a5058' }],
  burnt: [['.s..s...', '..s..s..', '.s.s....', '..kkkk..', '.kdkddk.', 'kddkdddk', '.kkkkkk.', '........'],
    { k: '#111111', d: '#3a3a3a', s: '#9a9a9a' }],
};

const iconCache = new Map<string, HTMLCanvasElement>();
export function icon(item: Item): HTMLCanvasElement {
  let c = iconCache.get(item);
  if (!c) {
    c = item.startsWith('prep:') ? prepIcon(item.slice(5)) : paint(...(ICONS[item] ?? ICONS.burnt));
    iconCache.set(item, c);
  }
  return c;
}

/** A plate's worth of chopped ingredients on a little board, coloured like the finished dish. */
function prepIcon(dish: string): HTMLCanvasElement {
  const src = icon(dish).getContext('2d')!.getImageData(0, 0, 8, 8).data;
  const cols: string[] = [];
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] > 0 && (src[i] + src[i + 1] + src[i + 2]) > 150) cols.push(`rgb(${src[i]},${src[i + 1]},${src[i + 2]})`);
  }
  const [c, g] = makeCanvas(8, 8);
  g.fillStyle = '#5a3a1e';
  g.fillRect(0, 4, 8, 4);
  g.fillStyle = '#c9955d';
  g.fillRect(0, 4, 8, 3);
  const spots: [number, number, number][] = [[1, 2, 2], [4, 1, 2], [2, 4, 2], [5, 3, 2], [6, 5, 1]];
  spots.forEach(([x, y, w], i) => {
    g.fillStyle = cols.length ? cols[(i * 7) % cols.length] : '#e8e0d0';
    g.fillRect(x, y, w, 2);
  });
  return c;
}

// ---------------------------------------------------------------- floors

function floorTile(colorAt: (c: number, r: number) => string): HTMLCanvasElement {
  const [cv, g] = makeCanvas(16, 16);
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      g.fillStyle = colorAt(c, r);
      g.fillRect(c, r, 1, 1);
    }
  }
  return cv;
}

const floorCache = new Map<string, HTMLCanvasElement>();

export function floorSprite(kind: Floor, tx: number, ty: number, t = 0): HTMLCanvasElement {
  const variant =
    kind === 'sea' ? (Math.floor(hash2(tx, ty) * 3) + t) % 3
    : kind === 'galley' ? (tx + ty) & 1
    : kind === 'pool' ? t % 2
    : kind === 'deck' ? tx % 4
    : kind === 'cobble' ? (tx * 7 + ty * 3) % 5
    : 0;
  const key = `${kind}:${variant}`;
  const hit = floorCache.get(key);
  if (hit) return hit;
  let cv: HTMLCanvasElement;
  switch (kind) {
    case 'deck':
      // teak planks running fore and aft, with staggered butt joints
      cv = floorTile((c, r) => {
        if (r % 4 === 3) return '#7a5230';
        const plank = r >> 2;
        if ((c + plank * 5 + variant * 16) % 32 === 0) return '#8a5d36';
        if (hash2(c + variant * 16, plank) < 0.03) return '#9c6b3f';
        return plank % 2 ? '#c4915c' : '#b98652';
      });
      break;
    case 'cobble':
      cv = floorTile((c, r) => {
        const row = r >> 2;
        const cx = (c + (row % 2) * 3) % 6;
        if (r % 4 === 3 || cx === 5) return '#9a8a74';
        const h = hash2(Math.floor((c + (row % 2) * 3) / 6) + tx * 3, row + ty * 4);
        return h < 0.3 ? '#cbb89a' : h < 0.6 ? '#d6c4a6' : '#c2ae8e';
      });
      break;
    case 'marble':
      cv = floorTile((c, r) => {
        if (c === 0 || r === 0) return '#b8ad96';
        const dark = ((tx + ty) & 1) === 1;
        if ((c + r) % 11 === 0) return dark ? '#d6cbb2' : '#f3ecdc';
        return dark ? '#e3d8c0' : '#fbf6ea';
      });
      break;
    case 'cabin':
      cv = floorTile((c, r) => {
        if (c % 8 === 7) return '#5a3a1e';
        const plank = c >> 3;
        return (r + plank * 5) % 16 === 0 ? '#6b4a2a' : plank % 2 ? '#8a5a32' : '#7a5230';
      });
      break;
    case 'stairs':
      cv = floorTile((_c, r) => (r % 4 === 3 ? '#6b4a2a' : r % 4 === 0 ? '#e0b07a' : '#c9955d'));
      break;
    case 'roof':
      cv = floorTile((c, r) => {
        if (r % 4 === 3) return '#8a3f22';
        return (c + (r >> 2) * 2) % 4 === 0 ? '#b5552f' : '#c4643a';
      });
      break;
    case 'galley':
      cv = floorTile((c, r) => {
        if (c === 0 || r === 0) return '#8f9aa6';
        if (c === 1 && r === 1) return '#ffffff';
        return variant ? '#e9edf1' : '#cdd6de';
      });
      break;
    case 'dining':
      cv = floorTile((c, r) => {
        const d = Math.abs(c - 7.5) + Math.abs(r - 7.5);
        if (d > 5.5 && d < 7) return '#e3b54a';
        return d < 2.5 ? '#a8323e' : '#8c2633';
      });
      break;
    case 'pool':
      cv = floorTile((c, r) => {
        const s = Math.sin((c + r * 2) * 0.7 + variant * 2.5);
        return s > 0.85 ? '#d8fbff' : r < 3 ? '#38b8d6' : '#4fd0e8';
      });
      break;
    default:
      cv = floorTile((c, r) => {
        const base = ['#1f6f9f', '#1d6a98', '#226fa3'][variant];
        return hash2(c + variant * 41, r) < 0.012 ? '#7fc8ef' : base;
      });
  }
  floorCache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------- props

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** offset from the tile's top-left corner to the canvas top-left */
  ox: number;
  oy: number;
}

// props draw into a 32x56 canvas whose tile footprint starts at (8, 36)
function prop(draw: (g: CanvasRenderingContext2D, x: number, y: number) => void): Sprite {
  const [c, g] = makeCanvas(32, 56);
  draw(g, 8, 36);
  return { canvas: c, ox: -8, oy: -36 };
}

function rect(g: CanvasRenderingContext2D, col: string, x: number, y: number, w: number, h: number) {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

const STEEL: BlockColors = { top: '#9aa6b2', front: '#5b6672', edge: '#c4ced8', base: '#2b3138' };
const WOOD: BlockColors = { top: '#c9955d', front: '#8a5a32', edge: '#e0b07a', base: '#4a2e17' };
const SACK: BlockColors = { top: '#f2ead8', front: '#dccfb4', edge: '#fffaf0', base: '#b3a27f' };

const STALL_LOOK: Record<string, { awning: string; goods: string[] }> = {
  A: { awning: '#2d6fb0', goods: ['#d9826b', '#2f3658', '#cfe3f5'] },
  P: { awning: '#3f8f3f', goods: ['#e53935', '#3f8f3f', '#b06a8a', '#ffe14a', '#c9955d'] },
  E: { awning: '#e8741c', goods: ['#e8541c', '#b5b830', '#f7f2e8', '#5c8f3a'] },
  Y: { awning: '#c8323e', goods: ['#f5d36a', '#d99a4e', '#fbf3e4', '#ffe066'] },
};

const propCache = new Map<string, Sprite>();

export function propSprite(ch: string): Sprite | null {
  const hit = propCache.get(ch);
  if (hit) return hit;
  let s: Sprite | null = null;
  switch (ch) {
    case 'r':
      s = prop((g, x, y) => {
        drawBlock(g, x, y, 16, 16, 8, { top: '#9b6a3e', front: '#f3f5f7', edge: '#c08a55', base: '#9aa4ae' });
        rect(g, '#d9dee4', x, y + 12, 16, 1);
      });
      break;
    case '#':
      s = prop((g, x, y) => drawBlock(g, x, y, 16, 16, 8, { top: '#efe4cf', front: '#d1bf9c', edge: '#fff7e6', base: '#8a7a5c' }));
      break;
    case 'S':
      s = prop((g, x, y) => {
        drawBlock(g, x + 1, y + 2, 14, 14, 11, STEEL);
        rect(g, '#2b3138', x + 3, y - 7, 4, 3);
        rect(g, '#2b3138', x + 9, y - 7, 4, 3);
        rect(g, '#2b3138', x + 3, y - 2, 4, 3);
        rect(g, '#2b3138', x + 9, y - 2, 4, 3);
        rect(g, '#2b3138', x + 3, y + 7, 10, 6); // oven door
        rect(g, '#f0a040', x + 5, y + 8, 6, 1);
      });
      break;
    case 'C':
      s = prop((g, x, y) => {
        drawBlock(g, x + 1, y + 2, 14, 14, 11, WOOD);
        rect(g, '#f0d2a0', x + 3, y - 6, 9, 7);
        rect(g, '#d6b07a', x + 3, y + 1, 9, 1);
        rect(g, '#d8dde3', x + 12, y - 5, 1, 5); // knife
        rect(g, '#3a2a1a', x + 12, y, 1, 2);
        rect(g, '#704727', x + 3, y + 8, 10, 1);
      });
      break;
    case 'F':
      s = prop((g, x, y) => {
        drawBlock(g, x + 1, y + 4, 14, 12, 24, { top: '#e8eef3', front: '#d3dce4', edge: '#ffffff', base: '#6f7c88' });
        rect(g, '#9aa6b2', x + 1, y + 1, 14, 1);
        rect(g, '#7f8c98', x + 12, y - 6, 1, 5);
        rect(g, '#7f8c98', x + 12, y + 4, 1, 6);
      });
      break;
    case 'M':
      s = prop((g, x, y) => {
        drawBlock(g, x + 2, y + 4, 12, 12, 9, { top: '#bfe6f5', front: '#7cc4de', edge: '#e8f8ff', base: '#2f6f86' });
        rect(g, '#ffffff', x + 4, y + 9, 8, 2);
      });
      break;
    case 'U':
      s = prop((g, x, y) => {
        drawBlock(g, x + 1, y + 6, 14, 10, 3, WOOD);
        drawBlock(g, x + 2, y + 6, 7, 7, 9, SACK);
        drawBlock(g, x + 8, y + 8, 7, 6, 7, SACK);
        rect(g, '#b3a27f', x + 4, y - 3, 3, 1);
      });
      break;
    case 'V':
    case 'O':
      s = prop((g, x, y) => {
        drawBlock(g, x + 1, y + 3, 14, 13, 8, WOOD);
        rect(g, '#5a3a1e', x + 1, y + 11, 14, 1);
        const a = ch === 'V' ? '#4caf50' : '#e53935';
        const b = ch === 'V' ? '#a5e887' : '#ff9e94';
        for (const [dx, dy] of [[2, -4], [7, -5], [11, -3], [4, 0], [9, 0]]) {
          rect(g, a, x + dx, y + dy, 3, 3);
          rect(g, b, x + dx, y + dy, 1, 1);
        }
      });
      break;
    case 'B':
      s = prop((g, x, y) => {
        drawBlock(g, x + 4, y + 7, 8, 8, 11, { top: '#3d4650', front: '#6b7682', edge: '#8f9aa6', base: '#2b3138' });
        rect(g, '#56606b', x + 4, y + 8, 8, 1);
      });
      break;
    case 'T':
      s = prop((g, x, y) => {
        rect(g, 'rgba(0,0,0,0.18)', x + 1, y + 14, 14, 2);
        drawBlock(g, x + 1, y + 3, 14, 11, 8, { top: '#ffffff', front: '#e3e8ed', edge: '#ffffff', base: '#b8c2cc' });
        rect(g, '#e3b54a', x + 7, y - 3, 2, 3); // candle
        rect(g, '#fff2a8', x + 7, y - 4, 2, 1);
      });
      break;
    case 'h':
      s = prop((g, x, y) => {
        drawBlock(g, x + 4, y + 6, 8, 8, 5, { top: '#a8323e', front: '#6b3a22', edge: '#c9505c' });
        rect(g, '#6b3a22', x + 4, y + 13, 1, 2);
        rect(g, '#6b3a22', x + 11, y + 13, 1, 2);
      });
      break;
    case 'L':
      s = prop((g, x, y) => {
        drawBlock(g, x + 1, y + 4, 14, 10, 3, { top: '#ffffff', front: '#c9d3dc' });
        for (let i = 0; i < 14; i += 3) rect(g, '#3fb6c9', x + 1 + i, y + 1, 1, 10);
        drawBlock(g, x + 1, y + 4, 4, 10, 7, { top: '#ffffff', front: '#dfe6ec', edge: '#ffffff' });
      });
      break;
    case 'W':
      s = prop((g, x, y) => {
        rect(g, '#6b4a2a', x + 3, y - 2, 1, 16);
        rect(g, '#6b4a2a', x + 12, y - 2, 1, 16);
        rect(g, '#5a3a1e', x + 2, y - 14, 12, 14);
        rect(g, '#22382e', x + 3, y - 13, 10, 12);
        for (const [dy, w] of [[-11, 7], [-8, 5], [-5, 8], [-2, 4]]) rect(g, '#e8efe8', x + 4, y + dy, w, 1);
        rect(g, '#ffe066', x + 11, y - 11, 1, 1);
      });
      break;
    case 'A':
    case 'P':
    case 'E':
    case 'Y': {
      const look = STALL_LOOK[ch];
      s = prop((g, x, y) => {
        drawBlock(g, x, y + 4, 16, 12, 9, WOOD);
        for (let i = 0; i < 9; i++) {
          rect(g, look.goods[i % look.goods.length], x + 1 + (i % 5) * 3, y - 4 + Math.floor(i / 5) * 4 + (i % 2), 3, 3);
        }
        rect(g, '#7a5a3a', x, y - 20, 1, 24);
        rect(g, '#7a5a3a', x + 15, y - 20, 1, 24);
        for (let i = 0; i < 16; i++) rect(g, (i >> 1) % 2 ? '#ffffff' : look.awning, x + i, y - 26, 1, 8);
        for (let i = 0; i < 16; i += 4) rect(g, look.awning, x + i, y - 18, 2, 2);
      });
      break;
    }
    case 'n':
      s = prop((g, x, y) => {
        drawBlock(g, x + 5, y + 8, 6, 6, 7, { top: '#3d4650', front: '#2b3138', edge: '#6b7682' });
        rect(g, '#c9a46a', x + 4, y + 7, 8, 1);
      });
      break;
    case 'x':
      s = prop((g, x, y) => {
        drawBlock(g, x + 3, y + 5, 10, 10, 11, { top: '#9c6b3f', front: '#7a5230', edge: '#c4915c', base: '#3a2412' });
        rect(g, '#3a3f45', x + 3, y + 6, 10, 1);
        rect(g, '#3a3f45', x + 3, y + 11, 10, 1);
      });
      break;
    case 't':
      s = prop((g, x, y) => {
        rect(g, 'rgba(0,0,0,0.18)', x - 2, y + 10, 20, 5);
        rect(g, '#8a7a5c', x + 6, y - 8, 4, 22);
        rect(g, '#b5a27f', x + 7, y - 4, 1, 5);
        const blobs: [number, number, number][] = [[8, -20, 9], [2, -14, 6], [14, -14, 6], [5, -26, 6], [12, -26, 5]];
        for (const [cx, cy, r] of blobs) {
          for (let dy = -r; dy <= r; dy++) {
            const w = Math.round(Math.sqrt(r * r - dy * dy));
            rect(g, dy < -r / 3 ? '#7cb85a' : '#4f8f3a', x + cx - w, y + cy + dy, w * 2, 1);
          }
        }
      });
      break;
    case 'H':
    case 'I':
      s = prop((g, x, y) => {
        drawBlock(g, x, y, 16, 16, 30, { top: '#c4643a', front: '#e8b86a', edge: '#e08a5a', base: '#a5733f' });
        for (let i = 0; i < 16; i += 3) rect(g, '#a84f2a', x + i, y - 30, 1, 16);
        if (ch === 'I') {
          rect(g, '#6b3a22', x + 4, y + 2, 8, 14);
          rect(g, '#8a5232', x + 5, y + 3, 6, 13);
          rect(g, '#ffe066', x + 10, y + 9, 1, 1);
        } else {
          rect(g, '#3f7a6a', x + 3, y + 2, 3, 8);
          rect(g, '#2b3a55', x + 6, y + 2, 4, 8);
          rect(g, '#3f7a6a', x + 10, y + 2, 3, 8);
          rect(g, '#d9a050', x + 3, y + 10, 10, 1);
        }
      });
      break;
    case 'G':
      s = prop((g, x, y) => {
        rect(g, '#6b7682', x + 2, y - 24, 12, 40);
        for (let i = 0; i < 40; i += 3) rect(g, '#9aa6b2', x + 3, y - 24 + i, 10, 2);
        rect(g, '#e8452c', x + 1, y - 24, 1, 40);
        rect(g, '#e8452c', x + 14, y - 24, 1, 40);
      });
      break;
    case 'X':
      s = prop((g, x, y) => {
        drawBlock(g, x, y + 3, 16, 13, 10, { top: '#d8dde3', front: '#9aa6b2', edge: '#ffffff', base: '#5b6672' });
        rect(g, '#ffcf4a', x + 2, y - 8, 12, 1); // heat lamp glow
        rect(g, '#5b6672', x + 1, y - 26, 14, 2);
        rect(g, '#e8452c', x + 4, y - 24, 2, 2);
        rect(g, '#e8452c', x + 10, y - 24, 2, 2);
      });
      break;
    case 'Q':
      s = prop((g, x, y) => {
        drawBlock(g, x, y + 4, 16, 12, 12, { top: '#e3b54a', front: '#7a4a2a', edge: '#ffe9a8', base: '#3a2412' });
        rect(g, '#c9a14a', x, y + 9, 16, 1);
      });
      break;
    case 'f':
      s = prop((g, x, y) => {
        drawBlock(g, x + 4, y + 9, 8, 6, 7, { top: '#5a3a1e', front: '#c4643a', edge: '#e08a5a' });
        for (const [dx, dy, w] of [[1, -12, 6], [9, -12, 6], [3, -16, 10], [5, -20, 6], [0, -8, 5], [11, -8, 5]]) rect(g, dy < -14 ? '#7cb85a' : '#3f8f3f', x + dx, y + dy, w, 3);
        rect(g, '#5a3a1e', x + 7, y - 6, 2, 9);
      });
      break;
    case 'K':
      s = prop((g, x, y) => {
        drawBlock(g, x, y + 2, 16, 14, 7, { top: '#f4f4f0', front: '#8a5a32', edge: '#ffffff' });
        rect(g, '#ffffff', x + 3, y - 4, 10, 4);
        rect(g, '#d8dde3', x + 3, y, 10, 1);
        rect(g, '#6b4a2a', x, y - 12, 16, 8);
      });
      break;
    case 'b':
      s = prop((g, x, y) => drawBlock(g, x, y, 16, 14, 7, { top: '#3f6fb0', front: '#8a5a32', edge: '#7fa6d9' }));
      break;
    case 'j':
      s = prop((g, x, y) => {
        drawBlock(g, x + 1, y + 4, 14, 11, 10, WOOD);
        rect(g, '#f7f2e8', x + 4, y - 4, 6, 4);
        rect(g, '#2b3a55', x + 11, y - 5, 1, 4);
      });
      break;
    case 'J':
      s = prop((g, x, y) => {
        drawBlock(g, x, y + 2, 16, 14, 12, { top: '#c9955d', front: '#2d6fb0', edge: '#e0b07a', base: '#16365a' });
        rect(g, '#f4f7fa', x, y + 6, 16, 1);
        rect(g, '#8fd06a', x + 5, y - 13, 3, 4);
        rect(g, '#ff9e94', x + 10, y - 12, 2, 3);
      });
      break;
    case 'i':
      s = prop((g, x, y) => {
        rect(g, '#6b7682', x + 7, y + 6, 2, 8);
        drawBlock(g, x + 4, y + 4, 8, 6, 2, { top: '#c8323e', front: '#8a2030' });
      });
      break;
    case 'u':
      s = prop((g, x, y) => {
        rect(g, 'rgba(0,0,0,0.2)', x - 2, y + 12, 20, 4);
        drawBlock(g, x - 2, y + 4, 20, 12, 34, { top: '#1d1d2b', front: '#d63a3a', edge: '#3a3f55', base: '#8a2020' });
        rect(g, '#f4f7fa', x - 2, y - 8, 20, 4);
        rect(g, '#1d1d2b', x - 2, y - 28, 20, 4);
        rect(g, '#e8b84a', x + 4, y - 2, 8, 8);
      });
      break;
    case 'v':
      s = prop((g, x, y) => {
        drawBlock(g, x + 1, y + 2, 14, 14, 16, { top: '#3d4650', front: '#c4643a', edge: '#e08a5a', base: '#3a2412' });
        rect(g, '#2b1b10', x + 3, y + 3, 10, 7);
        rect(g, '#ff9b3d', x + 4, y + 7, 8, 2);
        rect(g, '#ffcf4a', x + 5, y + 8, 6, 1);
        rect(g, '#e3b54a', x + 3, y + 1, 10, 1);
        rect(g, '#5b6672', x + 6, y - 22, 4, 8);
      });
      break;
    case 'z':
      s = prop((g, x, y) => {
        drawBlock(g, x + 3, y + 6, 10, 9, 4, { top: '#5b6672', front: '#3d4650', edge: '#8f9aa6' });
        drawBlock(g, x + 2, y + 4, 12, 9, 10, { top: '#2b3138', front: '#56606b', edge: '#8f9aa6', base: '#2b3138' });
        rect(g, '#8a7a3a', x + 3, y - 5, 10, 6);
        rect(g, '#a89a4a', x + 5, y - 4, 2, 1);
        rect(g, '#a89a4a', x + 9, y - 2, 2, 1);
        rect(g, '#2b3138', x + 1, y - 1, 1, 3);
        rect(g, '#2b3138', x + 14, y - 1, 1, 3);
      });
      break;
    case '!':
      s = prop((g, x, y) => {
        drawBlock(g, x + 3, y + 8, 10, 7, 6, WOOD);
        rect(g, '#6b4a2a', x + 4, y - 18, 2, 22);
        rect(g, '#2b2b3a', x + 5, y - 22, 1, 6);
        rect(g, '#d8dde3', x + 6, y - 22, 6, 1);
        rect(g, '#d8dde3', x + 12, y - 21, 1, 12);
        rect(g, '#e8452c', x + 11, y - 9, 3, 2);
        drawBlock(g, x + 8, y + 9, 6, 5, 6, { top: '#5b8fb0', front: '#3d6f90', edge: '#9fc6dc' });
      });
      break;
    case '%':
      s = prop((g, x, y) => {
        drawBlock(g, x, y + 4, 16, 11, 7, WOOD);
        rect(g, '#5a3a1e', x + 1, y - 2, 14, 5);
      });
      break;
    case 'o':
      s = prop((g, x, y) => {
        rect(g, '#6b7682', x + 7, y + 2, 2, 12);
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          rect(g, a % 4 < 2 ? '#e8452c' : '#ffffff', Math.round(x + 8 + Math.cos(ang) * 5) - 1, Math.round(y + Math.sin(ang) * 5) - 1, 2, 2);
        }
      });
      break;
  }
  if (s) propCache.set(ch, s);
  return s;
}

/** Hull side under the deck's south edge: white topsides, red boot stripe, navy below. */
const HULL = ['#f4f7fa', '#f4f7fa', '#f4f7fa', '#e3e8ee', '#d63a3a', '#d63a3a', '#243a5e', '#243a5e', '#243a5e', '#1c2f50', '#1c2f50', '#1c2f50'];
export const HULL_DEPTH = HULL.length;

export function hullStrip(g: CanvasRenderingContext2D, x: number, yTop: number, w: number): void {
  HULL.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(x, yTop + i, w, 1);
  });
}
