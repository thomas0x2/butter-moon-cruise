// Draws the world to a low-res canvas, then the HUD on top at screen resolution.

import { floorSprite, hullStrip, icon, personSprite, propSprite, type Look, type Dir, type Item } from './art';
import { BASKET_SIZE, BUDGET, GRADE_NAMES, INGREDIENTS, MENU_SIZE, NEXT_PORT, SLOP, STALLS, nameOf, recipe, type StallId } from './data';
import { SERVICE_END, type Game, type MenuRow, type Modal, type Target, type Ticket } from './game';
import { drawBlock, hash2, TILE, tileCenter, toScreen, toWorld } from './grid';
import { charAt, floorAt, isDoor, isLand, isWall, type TileMap } from './map';

const SEA = '#1d6a98';
const VOID = '#0d0f18';
const BURNT_ID = 'burnt';
const FONT = "'Pixelify Sans', 'Courier New', monospace";

/**
 * Offset that puts `focus` in the middle of the visible window [start, start + span),
 * clamped so the map never scrolls further than needed to show its edge inside that window.
 */
function camera(start: number, span: number, size: number, focus: number): number {
  if (size <= span) return start + (span - size) / 2;
  return Math.min(start, Math.max(start + span - size, start + span / 2 - focus));
}

const cam = { x: 0, y: 0, map: '', t: 0 };

/** The Butter Moon tied up along the quay, seen from the market. */
function drawMooredShip(g: CanvasRenderingContext2D, ox: number, oy: number, t: number) {
  const x0 = 19 * TILE + ox;
  const x1 = 34 * TILE + ox;
  const bottom = 4 * TILE + oy - 2;
  const bob = Math.round(Math.sin(t * 0.8));
  const top = -6 * TILE + oy + bob;
  g.fillStyle = 'rgba(10,30,60,0.35)';
  g.fillRect(x0 + 4, bottom - 2, x1 - x0, 4);
  g.fillStyle = '#f4f7fa';
  g.fillRect(x0, top, x1 - x0, bottom - top + bob);
  g.fillStyle = '#d5dbe2';
  g.fillRect(x0, top, 3, bottom - top + bob);
  g.fillStyle = '#243a5e';
  g.fillRect(x0, bottom - 10 + bob, x1 - x0, 10);
  g.fillStyle = '#d63a3a';
  g.fillRect(x0, bottom - 13 + bob, x1 - x0, 3);
  for (let row = 0; row < 3; row++) {
    for (let x = x0 + 8; x < x1 - 6; x += 10) {
      g.fillStyle = row === 2 ? '#2b3a55' : '#7fb8e0';
      g.fillRect(x, bottom - 26 - row * 14 + bob, 5, row === 2 ? 3 : 5);
    }
  }
  g.fillStyle = '#e8b84a';
  g.fillRect(x0, bottom - 16 + bob, x1 - x0, 1);
}

interface Drawable {
  depth: number;
  draw: () => void;
}

export interface View {
  ox: number;
  oy: number;
}

// ------------------------------------------------------------------ world

export function renderWorld(game: Game, g: CanvasRenderingContext2D, W: number, H: number, hud: HudLayout): View {
  const m = game.map;
  const p = toScreen(game.x, game.y);
  const t = game.time;
  // frame the chef inside the strip the HUD leaves uncovered, easing so panels resizing never jolt the view
  const tx = camera(0, W, m.w * TILE, p.x);
  const ty = camera(hud.top, H - hud.top - hud.bottom, m.h * TILE, p.y - 8);
  if (cam.map !== m.id) Object.assign(cam, { x: tx, y: ty, map: m.id });
  const k = 1 - Math.exp(-Math.max(0, t - cam.t) * 12);
  cam.t = t;
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const ox = Math.round(cam.x);
  const oy = Math.round(cam.y);
  const outdoors = m.outside === 'sea';

  if (outdoors) {
    g.fillStyle = SEA;
    g.fillRect(0, 0, W, H);
    drawSea(g, W, H, ox, oy, t);
    if (m.id === 'market') drawMooredShip(g, ox, oy, t);
  } else {
    g.fillStyle = VOID;
    g.fillRect(0, 0, W, H);
  }

  // hull side under the lido deck's edges
  if (m.id === 'lido') {
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (isLand(m, x, y) && !isLand(m, x, y + 1)) hullStrip(g, x * TILE + ox, (y + 1) * TILE + oy, TILE);
      }
    }
  }

  // floors, with a soft shadow under tall walls
  const poolFrame = Math.floor(t * 2) % 2;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!isLand(m, x, y)) continue;
      const c = charAt(m, x, y);
      if (isWall(c)) continue;
      const sx = x * TILE + ox;
      const sy = y * TILE + oy;
      g.drawImage(floorSprite(floorAt(m, x, y), x, y, poolFrame), sx, sy);
      if (y > 0 && isWall(charAt(m, x, y - 1))) {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(sx, sy, TILE, 3);
      }
      if (c === 'D' && !tallWall(m, x, y)) drawDoormat(g, sx, sy);
    }
  }

  // walls first: they sit behind everything standing in the room
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const c = charAt(m, x, y);
      if (isWall(c)) drawWall(g, m, x, y, ox, oy);
      else if (c === 'D' && tallWall(m, x, y)) drawDoorway(g, m, x * TILE + ox, y * TILE + oy);
    }
  }

  // depth-sorted props and characters
  const list: Drawable[] = [];
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const c = charAt(m, x, y);
      if (c === 'r') {
        list.push({ depth: y + 1, draw: () => drawRail(g, m, x, y, ox, oy) });
        continue;
      }
      if (isWall(c) || isDoor(c)) continue;
      if (c === 'v' && !game.owned.has('oven')) {
        list.push({ depth: y + 1, draw: () => drawEmptySlot(g, x * TILE + ox, y * TILE + oy, t) });
        continue;
      }
      const sp = propSprite(c);
      if (!sp) continue;
      const sx = x * TILE + ox + sp.ox;
      const sy = y * TILE + oy + sp.oy;
      list.push({ depth: y + 1, draw: () => g.drawImage(sp.canvas, sx, sy) });
    }
  }

  if (m.id === 'galley') {
    for (const s of game.stations) {
      if (s.kind === 'oven' && !game.owned.has('oven')) continue;
      const c = tileCenter(s.tx, s.ty);
      const cx = c.x + ox;
      const cy = c.y + oy;
      list.push({
        depth: s.ty + 1.01,
        draw: () => {
          const top = cy - (s.kind === 'oven' ? 18 : 10);
          if (s.kind === 'stove' && game.owned.has('copper')) {
            g.fillStyle = '#d98c4a';
            g.fillRect(cx - 7, cy - 18, 14, 1);
          }
          if ((s.kind === 'stove' || s.kind === 'pot') && (s.recipe || (s.result && s.result !== BURNT_ID))) {
            const flick = Math.floor(t * 10) % 2;
            g.fillStyle = flick ? '#ff9b3d' : '#ffcf4a';
            g.fillRect(cx - 5, cy - 14, 4, 1);
            g.fillRect(cx + 1, cy - 9, 4, 1);
          }
          s.items.forEach((it, i) => g.drawImage(icon(it), cx - 10 + i * 6, top - 6 + (i % 2)));
          if (s.result) g.drawImage(icon(s.result), cx - 4, top - 6);
          if (s.recipe || s.result === BURNT_ID) {
            for (let q = 0; q < 3; q++) {
              const life = (t * 0.8 + q / 3) % 1;
              g.fillStyle = s.result === BURNT_ID ? `rgba(60,60,60,${1 - life})` : `rgba(255,255,255,${0.8 * (1 - life)})`;
              g.fillRect(Math.round(cx - 2 + Math.sin(life * 6 + q) * 3), Math.round(top - 8 - life * 14), 2, 2);
            }
          }
        },
      });
    }
    // plates waiting on the pass window
    for (const slot of game.pass) {
      if (!slot.dish) continue;
      const c = tileCenter(slot.tx, 3);
      const dish = slot.dish;
      const q = slot.q;
      list.push({
        depth: 4.02,
        draw: () => {
          g.drawImage(icon(dish), c.x + ox - 4, c.y + oy - 17);
          if (q >= 3 && dish !== SLOP.id && Math.floor(t * 3) % 3 === 0) {
            g.fillStyle = '#ffffff';
            g.fillRect(c.x + ox + 3, c.y + oy - 19, 1, 3);
            g.fillRect(c.x + ox + 2, c.y + oy - 18, 3, 1);
          }
        },
      });
    }
    for (const w of game.waiters) {
      const note = w.task?.kind === 'drop' && w.stage === 'going';
      list.push({ depth: w.y, draw: () => drawPerson(g, w.look, w.dir, w.moving ? w.anim : 0, w.x, w.y, ox, oy, w.carrying, note) });
    }
  }

  for (const n of game.npcs) {
    list.push({ depth: n.y, draw: () => drawPerson(g, n.def.look, n.dir, n.moving ? n.anim : 0, n.x, n.y, ox, oy, null) });
  }
  list.push({ depth: game.y, draw: () => drawPerson(g, game.look, game.dir, game.moving ? game.anim : 0, game.x, game.y, ox, oy, game.hands) });
  list.sort((a, b) => a.depth - b.depth);
  for (const d of list) d.draw();

  // overlays: progress bars and burn warnings
  if (m.id === 'galley') {
    for (const s of game.stations) {
      const c = tileCenter(s.tx, s.ty);
      const bx = c.x + ox - 8;
      const by = c.y + oy - (s.kind === 'oven' ? 40 : 32);
      if (s.recipe) bar(g, bx, by, s.t / s.dur, '#5fcf7a');
      else if (s.kind === 'stove' && s.result && s.result !== BURNT_ID && s.doneT > 3 && Math.floor(t * 6) % 2) {
        g.fillStyle = '#ff5a5a';
        g.fillRect(bx + 6, by - 4, 3, 6);
        g.fillRect(bx + 6, by + 3, 3, 2);
      }
    }
  }
  if (game.target && !game.modal && !game.warp) drawArrow(g, game, game.target, ox, oy, t);

  drawLighting(game, g, W, H);

  // door transition: fade to black and back
  if (game.warp) {
    const wt = game.warp.t;
    const a = wt < 0.25 ? wt / 0.25 : Math.max(0, (0.5 - wt) / 0.25);
    g.fillStyle = `rgba(5,6,12,${Math.min(1, a).toFixed(3)})`;
    g.fillRect(0, 0, W, H);
  }
  return { ox, oy };
}

/** A wall tile that faces the room: the floor tile below it is open, so we see its full face. */
function tallWall(m: TileMap, x: number, y: number) {
  const below = charAt(m, x, y + 1);
  return y + 1 < m.h && below !== ' ' && below !== '~' && !isWall(below);
}

function drawWall(g: CanvasRenderingContext2D, m: TileMap, x: number, y: number, ox: number, oy: number) {
  const c = charAt(m, x, y);
  const sx = x * TILE + ox;
  const sy = y * TILE + oy;
  const wl = m.wall;
  if (c === 'g') {
    // the locked gangway hatch in the atrium's outer wall
    g.fillStyle = wl.top;
    g.fillRect(sx, sy, TILE, TILE);
    g.fillStyle = '#5b6672';
    g.fillRect(sx + 1, sy + 2, TILE - 2, TILE - 2);
    g.fillStyle = '#8f9aa6';
    g.fillRect(sx + 2, sy + 3, TILE - 4, 1);
    g.fillStyle = '#e8452c';
    g.fillRect(sx + 1, sy + 8, TILE - 2, 2);
    return;
  }
  if (tallWall(m, x, y)) {
    g.fillStyle = wl.face;
    g.fillRect(sx, sy, TILE, TILE);
    g.fillStyle = wl.top;
    g.fillRect(sx, sy, TILE, 3);
    g.fillStyle = wl.trim;
    g.fillRect(sx, sy + 3, TILE, 1);
    g.fillRect(sx, sy + 10, TILE, 1);
    g.fillRect(sx, sy + TILE - 2, TILE, 2);
    if (c === 'w') {
      g.fillStyle = '#c9a14a';
      g.fillRect(sx + 4, sy + 4, 8, 6);
      g.fillRect(sx + 5, sy + 3, 6, 8);
      g.fillStyle = '#7fb8e0';
      g.fillRect(sx + 5, sy + 5, 6, 4);
      g.fillRect(sx + 6, sy + 4, 4, 6);
      g.fillStyle = '#d9f0ff';
      g.fillRect(sx + 6, sy + 5, 2, 1);
    }
    return;
  }
  // seen from above: just the wall's cap, edged where it meets the floor
  g.fillStyle = wl.top;
  g.fillRect(sx, sy, TILE, TILE);
  g.fillStyle = wl.trim;
  const open = (dx: number, dy: number) => {
    const n = charAt(m, x + dx, y + dy);
    return n !== ' ' && n !== '~' && !isWall(n);
  };
  if (open(-1, 0)) g.fillRect(sx, sy, 2, TILE);
  if (open(1, 0)) g.fillRect(sx + TILE - 2, sy, 2, TILE);
  if (open(0, -1)) g.fillRect(sx, sy, TILE, 2);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(sx, sy + TILE - 3, TILE, 3);
}

/** A door set into a room's back wall. */
function drawDoorway(g: CanvasRenderingContext2D, m: TileMap, sx: number, sy: number) {
  g.fillStyle = m.wall.face;
  g.fillRect(sx, sy, TILE, TILE);
  g.fillStyle = m.wall.top;
  g.fillRect(sx, sy, TILE, 3);
  g.fillStyle = m.wall.trim;
  g.fillRect(sx + 2, sy + 3, 12, 13);
  g.fillStyle = '#1a1420';
  g.fillRect(sx + 3, sy + 4, 10, 12);
  g.fillStyle = '#3a2a40';
  g.fillRect(sx + 3, sy + 4, 10, 2);
}

function drawDoormat(g: CanvasRenderingContext2D, sx: number, sy: number) {
  g.fillStyle = '#7a2a2a';
  g.fillRect(sx + 2, sy + 3, 12, 10);
  g.fillStyle = '#c9a14a';
  g.fillRect(sx + 3, sy + 4, 10, 1);
  g.fillRect(sx + 3, sy + 11, 10, 1);
}

/** Where a machine could go once it is bought. */
function drawEmptySlot(g: CanvasRenderingContext2D, sx: number, sy: number, t: number) {
  g.fillStyle = Math.floor(t * 2) % 2 ? 'rgba(255,224,102,0.7)' : 'rgba(255,224,102,0.35)';
  for (let i = 0; i < 14; i += 3) {
    g.fillRect(sx + 1 + i, sy + 1, 2, 1);
    g.fillRect(sx + 1 + i, sy + 14, 2, 1);
    g.fillRect(sx + 1, sy + 1 + i, 1, 2);
    g.fillRect(sx + 14, sy + 1 + i, 1, 2);
  }
  g.fillRect(sx + 7, sy + 5, 2, 6);
  g.fillRect(sx + 5, sy + 7, 6, 2);
}

const RAIL = { top: '#9b6a3e', front: '#f3f5f7', edge: '#c08a55', base: '#9aa4ae' };

/** A slim white bulwark along whichever sides of the tile face the sea. */
function drawRail(g: CanvasRenderingContext2D, m: TileMap, tx: number, ty: number, ox: number, oy: number) {
  const x = tx * TILE + ox;
  const y = ty * TILE + oy;
  if (!isLand(m, tx, ty - 1)) drawBlock(g, x, y, TILE, 5, 9, RAIL);
  if (!isLand(m, tx - 1, ty)) drawBlock(g, x, y, 5, TILE, 9, RAIL);
  if (!isLand(m, tx + 1, ty)) drawBlock(g, x + TILE - 5, y, 5, TILE, 9, RAIL);
  if (!isLand(m, tx, ty + 1)) drawBlock(g, x, y + TILE - 5, TILE, 5, 9, RAIL);
}

function drawSea(g: CanvasRenderingContext2D, W: number, H: number, ox: number, oy: number, t: number) {
  const scroll = t * 0.7;
  const base = Math.floor(scroll);
  const frac = scroll - base;
  const a = toWorld(-ox, -oy);
  const b = toWorld(W - ox, H - oy);
  const shimmer = Math.floor(t * 1.5) % 3;
  for (let j = Math.floor(a.y) - 1; j <= Math.ceil(b.y) + 1; j++) {
    for (let i = Math.floor(a.x) - 1; i <= Math.ceil(b.x) + 2; i++) {
      const s = toScreen(i - frac + 0.5, j + 0.5);
      const sx = Math.round(s.x + ox);
      const sy = Math.round(s.y + oy);
      g.drawImage(floorSprite('sea', i + base, j, shimmer), sx - 8, sy - 8);
      const h = hash2(i + base, j + 77);
      if (h < 0.07) {
        const al = 0.35 + 0.45 * Math.abs(Math.sin(t * 1.3 + h * 90));
        g.fillStyle = `rgba(220,240,255,${al.toFixed(2)})`;
        g.fillRect(sx - 3, sy, 5, 1);
        g.fillRect(sx - 1, sy - 1, 2, 1);
      }
    }
  }
}

function drawPerson(g: CanvasRenderingContext2D, look: Look, dir: Dir, anim: number, x: number, y: number, ox: number, oy: number, held: Item | null, note = false) {
  const s = toScreen(x, y);
  const sx = Math.round(s.x + ox);
  const sy = Math.round(s.y + oy);
  const frame = anim > 0 ? 1 + (Math.floor(anim * 8) % 2) : 0;
  const bob = frame === 1 ? 1 : 0;
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(sx - 4, sy - 1, 8, 2);
  g.fillRect(sx - 3, sy - 2, 6, 4);
  g.drawImage(personSprite(look, dir, frame), sx - 6, sy - 20 - bob);
  if (held) g.drawImage(icon(held), sx - 4, sy - 30 - bob);
  else if (note) {
    // an order slip on its way to the pass
    g.fillStyle = '#1d1d2b';
    g.fillRect(sx + 3, sy - 15 - bob, 6, 7);
    g.fillStyle = '#fffaf0';
    g.fillRect(sx + 4, sy - 14 - bob, 4, 5);
    g.fillStyle = '#9aa6b2';
    g.fillRect(sx + 5, sy - 13 - bob, 2, 1);
    g.fillRect(sx + 5, sy - 11 - bob, 2, 1);
  }
}

function bar(g: CanvasRenderingContext2D, x: number, y: number, f: number, col: string) {
  g.fillStyle = '#1d1d2b';
  g.fillRect(x - 1, y - 1, 18, 4);
  g.fillStyle = '#3a3f55';
  g.fillRect(x, y, 16, 2);
  g.fillStyle = col;
  g.fillRect(x, y, Math.round(16 * Math.min(1, f)), 2);
}

const TARGET_HEIGHT: Record<string, number> = {
  F: 32, S: 22, C: 22, M: 16, U: 16, V: 18, O: 18, B: 16, W: 22, X: 30, v: 30, z: 20, j: 18,
  A: 34, P: 34, E: 34, Y: 34, G: 30, g: 6,
};

function drawArrow(g: CanvasRenderingContext2D, game: Game, target: Target, ox: number, oy: number, t: number) {
  let x: number;
  let y: number;
  if (target.kind === 'npc') {
    const s = toScreen(target.npc.x, target.npc.y);
    x = s.x + ox;
    y = s.y + oy - 28;
  } else {
    const c = tileCenter(target.tx, target.ty);
    x = c.x + ox;
    y = c.y + oy - (TARGET_HEIGHT[charAt(game.map, target.tx, target.ty)] ?? 24);
  }
  x = Math.round(x);
  y = Math.round(y) - (Math.floor(t * 3) % 2);
  g.fillStyle = '#1d1d2b';
  g.fillRect(x - 4, y - 1, 9, 1);
  g.fillStyle = '#ffe066';
  g.fillRect(x - 3, y, 7, 1);
  g.fillRect(x - 2, y + 1, 5, 1);
  g.fillRect(x - 1, y + 2, 3, 1);
  g.fillRect(x, y + 3, 1, 1);
}

/** Time-of-day tint outdoors; interiors keep their lamps on. */
function drawLighting(game: Game, g: CanvasRenderingContext2D, W: number, H: number) {
  const hr = game.clock / 60;
  let tint: [number, number, number, number] | null = null;
  if (game.map.outside === 'sea') {
    if (hr < 7.5) tint = [255, 150, 170, (0.18 * (7.5 - hr)) / 1.5];
    else if (hr > 16 && hr < 19) tint = [255, 140, 60, (0.22 * (hr - 16)) / 3];
    else if (hr >= 19) tint = [20, 30, 80, 0.4];
  } else if (game.phase === 'service') tint = [255, 170, 80, 0.06];
  if (!tint || tint[3] <= 0) return;
  g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${tint[3].toFixed(3)})`;
  g.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ HUD helpers

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, u: number, size = 7, col = '#ffffff', align: CanvasTextAlign = 'left') {
  c.font = `${Math.round(size * u)}px ${FONT}`;
  c.textAlign = align;
  c.textBaseline = 'top';
  c.fillStyle = 'rgba(15,18,32,0.85)';
  c.fillText(s, x + u * 0.6, y + u * 0.6);
  c.fillStyle = col;
  c.fillText(s, x, y);
}

function measure(c: CanvasRenderingContext2D, s: string, u: number, size: number) {
  c.font = `${Math.round(size * u)}px ${FONT}`;
  return c.measureText(s).width;
}

/** Greedy word wrap to a pixel width. */
function wrap(c: CanvasRenderingContext2D, s: string, maxW: number, u: number, size: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(c, next, u, size) > maxW) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, u: number, fill = 'rgba(29,29,43,0.82)') {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
  c.fillStyle = '#e8cf7a';
  c.fillRect(x, y, w, u);
  c.fillRect(x, y + h - u, w, u);
  c.fillRect(x, y, u, h);
  c.fillRect(x + w - u, y, u, h);
}

function iconAt(c: CanvasRenderingContext2D, item: Item, x: number, y: number, size: number) {
  c.imageSmoothingEnabled = false;
  c.drawImage(icon(item), Math.round(x), Math.round(y), size, size);
}

/** Subtle look of a quality grade on an icon: a glint for prime, bruises for poor. */
function gradeMarks(c: CanvasRenderingContext2D, x: number, y: number, size: number, grade: number | undefined) {
  if (!grade || grade === 2) return;
  const px = size / 8;
  if (grade >= 3) {
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.fillRect(x + 5 * px, y + 2 * px, px, px);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(x + 6 * px, y + 3 * px, px, px);
  } else {
    c.fillStyle = 'rgba(70,45,20,0.35)';
    c.fillRect(x + px, y + px, size - 2 * px, size - 2 * px);
    c.fillStyle = 'rgba(90,55,25,0.9)';
    c.fillRect(x + 2 * px, y + 4 * px, px, px);
    c.fillRect(x + 5 * px, y + 5 * px, px, px);
  }
}

function clockText(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor((min % 60) / 10) * 10;
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ap}`;
}

function star(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: number) {
  const path = () => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.closePath();
  };
  path();
  c.fillStyle = '#3a3f55';
  c.fill();
  if (fill > 0) {
    c.save();
    c.beginPath();
    c.rect(cx - r, cy - r, fill >= 1 ? 2 * r : r, 2 * r);
    c.clip();
    path();
    c.fillStyle = '#ffd23f';
    c.fill();
    c.restore();
  }
  path();
  c.strokeStyle = '#1d1d2b';
  c.lineWidth = Math.max(1, r / 6);
  c.stroke();
}

// ------------------------------------------------------------------ HUD layout

export interface HudLayout {
  narrow: boolean;
  /** game px covered by HUD along the top and bottom edges */
  top: number;
  bottom: number;
  cardCols: number;
  cardH: number;
  cardW: number;
  slotX: number;
  railY: number;
  toastY: number;
}

const PAD = 6;
const CLOCK_W = 104;
const TALLY_W = 84;
const SLOT = 22;
const TICKET_W = 26;
const TICKET_H = 30;
const MENU_ENTRY_W = 50;

function railTickets(game: Game): Ticket[] {
  return game.tickets.filter((t) => t.state === 'pending' || t.state === 'open' || t.state === 'taken');
}

/** Where the HUD sits, in game pixels, so the camera can keep the map clear of it. */
export function hudLayout(game: Game, W: number): HudLayout {
  const narrow = PAD * 3 + CLOCK_W + TALLY_W > W;
  const service = game.phase === 'service';
  const cardCols = narrow ? 5 : 6;
  let cardH = 0;
  let cardW = 10 + cardCols * 22;
  if (game.phase === 'market' || game.phase === 'afternoon') {
    const kinds = INGREDIENTS.filter((i) => game.count(i.id)).length;
    cardH = 16 + Math.max(1, Math.ceil(kinds / cardCols)) * 14;
  } else if (service) {
    const avail = narrow ? W - PAD * 2 - SLOT - 6 : Math.min(W / 2 - SLOT / 2 - PAD - 8, MENU_ENTRY_W * 4 + 10);
    const cols = Math.max(1, Math.floor((avail - 10) / MENU_ENTRY_W));
    const n = game.menu.length + 1;
    cardW = 10 + Math.min(n, cols) * MENU_ENTRY_W;
    cardH = 14 + Math.ceil(n / cols) * 12;
  }
  const slotX = narrow ? W - PAD - SLOT : Math.max(W / 2 - SLOT / 2, PAD + cardW + 8);
  // narrow screens stack the tally under the clock and the ticket rail under both
  const panels = narrow ? PAD + 38 + 30 : PAD + 34;
  const railY = narrow ? panels + 4 : PAD;
  const afterRail = narrow && service ? railY + TICKET_H + 2 : panels;
  const toastY = afterRail + 3;
  const top = toastY + 12;
  const bottom = PAD + Math.max(cardH, service ? SLOT + 12 : 0) + (narrow ? 16 : 4);
  return { narrow, top, bottom, cardCols, cardH, cardW, slotX, railY, toastY };
}

/** Screen rectangles of the open modal's rows, for pointer input. */
export const modalHits: { i: number; x: number; y: number; w: number; h: number }[] = [];
export const bookHit = { x: 0, y: 0, w: 0, h: 0 };

// ------------------------------------------------------------------ HUD

export function renderHud(game: Game, c: CanvasRenderingContext2D, view: View, u: number, CW: number, CH: number, hud: HudLayout) {
  const pad = PAD * u;
  modalHits.length = 0;
  Object.assign(bookHit, { x: 0, y: 0, w: 0, h: 0 });
  if (game.phase === 'title') {
    return overlay(c, CW, CH, u, 'Butter Moon Cruise', [
      'You are the chef aboard the MS Butter Moon, docked in Marseille.',
      `Morning: shop the Vieux-Port market. Budget ${BUDGET}g, basket space ${BASKET_SIZE}.`,
      'Afternoon: roam the ship and talk to people. Hire waiters from Henri in the restaurant, order machines from the catalog in your cabin, and taste combinations at the galley chalkboard to fill your recipe book.',
      'Evening: cook in the galley. Waiters bring tickets in; put finished plates on the pass. Then the guests give you stars.',
      'Tomorrow: Naples.',
      '',
      'Move: WASD or arrows   Use: E or Space   Back: Esc   Recipe book: N   Mute: M',
      'Touch: drag on the left half to walk, tap the right half to use.',
      '',
      'Press E or tap to start',
    ]);
  }

  // where and when
  panel(c, pad, pad, CLOCK_W * u, 34 * u, u);
  const night = game.clock >= 19 * 60;
  c.fillStyle = night ? '#ffe066' : '#ffb340';
  c.beginPath();
  c.arc(pad + 12 * u, pad + 11 * u, 5 * u, 0, Math.PI * 2);
  c.fill();
  if (night) {
    c.fillStyle = 'rgba(29,29,43,1)';
    c.beginPath();
    c.arc(pad + 14.5 * u, pad + 9.5 * u, 4.2 * u, 0, Math.PI * 2);
    c.fill();
  }
  text(c, `Day ${game.day} ${game.port}`, pad + 22 * u, pad + 4 * u, u, 6.5, '#ffe9a8');
  text(c, clockText(game.clock), pad + 98 * u, pad + 19.5 * u, u, 6, '#ffffff', 'right');
  c.fillStyle = '#f5c542';
  c.beginPath();
  c.arc(pad + 12 * u, pad + 24 * u, 3.5 * u, 0, Math.PI * 2);
  c.fill();
  text(c, `${game.money}g`, pad + 22 * u, pad + 19 * u, u, 7, '#ffe066');

  // phase panel, top right (under the clock on narrow screens)
  const tw = TALLY_W * u;
  const tally =
    game.phase === 'market' ? `Basket ${game.basketCount()}/${BASKET_SIZE}`
    : game.phase === 'afternoon' ? `Menu ${game.menu.length}/${MENU_SIZE}`
    : `Served ${game.served}  Left ${game.missed}`;
  const tx = hud.narrow ? pad : CW - pad - tw;
  const ty = hud.narrow ? pad + 38 * u : pad;
  panel(c, tx, ty, tw, 30 * u, u);
  text(c, tally, tx + tw / 2, ty + 5 * u, u, 6, '#ffffff', 'center');
  if (game.phase === 'service' && game.clock > SERVICE_END - 45) text(c, 'Last orders!', tx + tw / 2, ty + 17 * u, u, 6, '#ffb340', 'center');
  else text(c, 'N  Recipe book', tx + tw / 2, ty + 17 * u, u, 5, '#e8cf7a', 'center');
  if (game.roaming) Object.assign(bookHit, { x: tx, y: ty, w: tw, h: 30 * u });

  if (game.phase === 'service') drawTicketRail(game, c, u, CW, hud);

  // bottom-left card: basket at the market, pantry in the afternoon, the menu during service
  if (game.phase === 'market' || game.phase === 'afternoon') drawBasket(game, c, u, pad, CH, hud);
  else if (game.phase === 'service') drawMenuCard(game, c, u, pad, CH, hud);

  // hands slot
  const sw = SLOT * u;
  const sx = hud.slotX * u;
  const sy = CH - pad - sw;
  if (game.phase === 'service') {
    panel(c, sx, sy, sw, sw, u);
    if (game.hands) {
      iconAt(c, game.hands, sx + 3 * u, sy + 3 * u, 16 * u);
      if (game.hands !== BURNT_ID) gradeMarks(c, sx + 3 * u, sy + 3 * u, 16 * u, game.handsQ);
      const graded = game.hands === BURNT_ID || game.hands === SLOP.id ? nameOf(game.hands) : `${nameOf(game.hands)}, ${GRADE_NAMES[game.handsQ]}`;
      text(c, graded, hud.narrow ? sx + sw : sx + sw / 2, sy - 10 * u, u, 6, '#ffffff', hud.narrow ? 'right' : 'center');
    } else {
      text(c, 'empty hands', sx + sw / 2, sy - 10 * u, u, 5, '#9aa6b2', 'center');
    }
  }

  // interaction prompt
  if (game.target && !game.modal && !game.warp && game.roaming) {
    const label = `E  ${game.promptFor(game.target)}`;
    const w = measure(c, label, u, 6) + 10 * u;
    const h = 11 * u;
    let x: number;
    let y: number;
    if (hud.narrow) {
      x = CW / 2 - w / 2;
      y = CH - hud.bottom * u + 2 * u;
    } else if (game.phase === 'service') {
      x = sx + sw + 6 * u;
      y = sy + (sw - h) / 2;
    } else {
      x = Math.max(CW / 2 - w / 2, pad + (hud.cardW + 8) * u);
      y = CH - pad - h - 4 * u;
    }
    c.fillStyle = 'rgba(29,29,43,0.85)';
    c.fillRect(x, y, w, h);
    text(c, label, x + w / 2, y + 2 * u, u, 6, '#ffe9a8', 'center');
  }

  for (const f of game.floaters) {
    const s = toScreen(f.x, f.y);
    c.globalAlpha = Math.min(1, f.t * 1.5);
    text(c, f.text, (s.x + view.ox) * u, (s.y + view.oy - 20) * u, u, 8, f.color, 'center');
    c.globalAlpha = 1;
  }

  // the room name as you walk in
  if (game.roomBanner > 0 && !game.modal && game.roaming) {
    c.globalAlpha = Math.min(1, game.roomBanner * 2);
    const label = game.map.name;
    const w = measure(c, label, u, 7) + 16 * u;
    const y = hud.toastY * u + 14 * u;
    panel(c, CW / 2 - w / 2, y, w, 13 * u, u);
    text(c, label, CW / 2, y + 3 * u, u, 7, '#ffe9a8', 'center');
    c.globalAlpha = 1;
  }

  if (game.modal) drawModal(game, game.modal, c, u, CW, CH);

  // newest toast in the HUD's toast line (or at the bottom while a list is open)
  const toast = game.toasts[game.toasts.length - 1];
  if (toast && game.modal?.kind !== 'shop') {
    c.globalAlpha = Math.min(1, toast.t * 2);
    const maxW = CW - 16 * u;
    const lines = wrap(c, toast.text, maxW - 10 * u, u, 6);
    const w = Math.min(maxW, Math.max(...lines.map((l) => measure(c, l, u, 6))) + 10 * u);
    const h = (lines.length * 9 + 3) * u;
    const bottomish = game.modal && game.modal.kind === 'list';
    const y = bottomish ? CH - pad - h : hud.toastY * u;
    c.fillStyle = 'rgba(29,29,43,0.88)';
    c.fillRect(CW / 2 - w / 2, y, w, h);
    lines.forEach((l, i) => text(c, l, CW / 2, y + (2 + i * 9) * u, u, 6, '#ffffff', 'center'));
    c.globalAlpha = 1;
  }

  if (game.phase === 'summary') drawSummary(game, c, u, CW, CH);
  if (game.phase === 'arrival') {
    overlay(c, CW, CH, u, `Day 2  ${NEXT_PORT.name}`, [
      `${NEXT_PORT.greeting} The MS Butter Moon has docked in ${NEXT_PORT.name}.`,
      `Tonight's local star: ${NEXT_PORT.dish}.`,
      `You arrive with ${game.money}g in your purse and ${game.known.size} recipes in your book.`,
      '',
      'This is the end of the prototype leg.',
      'Press E or tap to sail from Marseille again',
    ]);
  }
}

/** Order tickets clipped above the pass: dish, table and how long they will wait. */
function drawTicketRail(game: Game, c: CanvasRenderingContext2D, u: number, CW: number, hud: HudLayout) {
  const list = railTickets(game);
  const gap = 2 * u;
  const tw = TICKET_W * u;
  const th = TICKET_H * u;
  const left = hud.narrow ? PAD * u : (PAD * 2 + CLOCK_W) * u;
  const right = hud.narrow ? CW - PAD * u : CW - (PAD * 2 + TALLY_W) * u;
  const fit = Math.max(1, Math.floor((right - left + gap) / (tw + gap)));
  const shown = list.slice(0, fit);
  const y = hud.railY * u;
  // the rail itself
  c.fillStyle = '#9aa6b2';
  c.fillRect(left, y + u, right - left, 2 * u);
  if (!shown.length) {
    text(c, 'No tickets yet', (left + right) / 2, y + 8 * u, u, 5, '#c9d3dc', 'center');
    return;
  }
  const total = shown.length * tw + (shown.length - 1) * gap;
  let x = (left + right) / 2 - total / 2;
  for (const t of shown) {
    const pending = t.state === 'pending';
    c.globalAlpha = pending ? 0.55 : 1;
    c.fillStyle = '#1d1d2b';
    c.fillRect(x - u, y + 2 * u, tw + 2 * u, th);
    c.fillStyle = '#fffaf0';
    c.fillRect(x, y + 3 * u, tw, th - 2 * u);
    c.fillStyle = '#c9a14a';
    c.fillRect(x + tw / 2 - 2 * u, y, 4 * u, 4 * u);
    iconAt(c, t.dish, x + tw / 2 - 6 * u, y + 5 * u, 12 * u);
    c.font = `${Math.round(5 * u)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillStyle = '#2b3a55';
    c.fillText(pending ? 'coming' : `#${t.table}`, x + tw / 2, y + 18 * u);
    if (!pending) {
      const f = t.state === 'taken' ? 1 : t.patience / t.max;
      const col = t.state === 'taken' ? '#5fcf7a' : f > 0.5 ? '#5fcf7a' : f > 0.25 ? '#f5c542' : Math.floor(game.time * 6) % 2 ? '#ff5a5a' : '#a02020';
      c.fillStyle = '#3a3f55';
      c.fillRect(x + 2 * u, y + 26 * u, tw - 4 * u, 2 * u);
      c.fillStyle = col;
      c.fillRect(x + 2 * u, y + 26 * u, Math.max(u, (tw - 4 * u) * f), 2 * u);
    }
    if (t.state === 'taken') {
      c.fillStyle = '#2f9a4a';
      c.fillRect(x + tw - 8 * u, y + 4 * u, 2 * u, 2 * u);
      c.fillRect(x + tw - 6 * u, y + 6 * u, 2 * u, 2 * u);
      c.fillRect(x + tw - 4 * u, y + 4 * u, 2 * u, 2 * u);
      c.fillRect(x + tw - 2 * u, y + 2 * u, 2 * u, 2 * u);
    }
    c.globalAlpha = 1;
    x += tw + gap;
  }
  if (list.length > shown.length) text(c, `+${list.length - shown.length}`, right - 2 * u, y + th + 2 * u, u, 5, '#ffe9a8', 'right');
}

function drawBasket(game: Game, c: CanvasRenderingContext2D, u: number, pad: number, CH: number, hud: HudLayout) {
  const items = INGREDIENTS.filter((i) => game.count(i.id));
  const cols = hud.cardCols;
  const w = hud.cardW * u;
  const h = hud.cardH * u;
  const y0 = CH - pad - h;
  panel(c, pad, y0, w, h, u);
  text(c, game.phase === 'market' ? 'Basket' : 'Pantry', pad + 5 * u, y0 + 4 * u, u, 5, '#e8cf7a');
  if (!items.length) text(c, 'empty', pad + 5 * u, y0 + 16 * u, u, 5, '#9aa6b2');
  items.forEach((ing, i) => {
    const x = pad + (5 + (i % cols) * 22) * u;
    const y = y0 + (14 + Math.floor(i / cols) * 14) * u;
    iconAt(c, ing.id, x, y, 10 * u);
    text(c, `${game.count(ing.id)}`, x + 11 * u, y + 3 * u, u, 5);
  });
}

function drawMenuCard(game: Game, c: CanvasRenderingContext2D, u: number, pad: number, CH: number, hud: HudLayout) {
  const ids = [...game.menu, SLOP.id];
  const w = hud.cardW * u;
  const h = hud.cardH * u;
  const y0 = CH - pad - h;
  const cols = Math.max(1, Math.round((hud.cardW - 10) / MENU_ENTRY_W));
  panel(c, pad, y0, w, h, u);
  text(c, "Tonight's menu", pad + 5 * u, y0 + 4 * u, u, 5, '#e8cf7a');
  ids.forEach((id, i) => {
    const r = recipe(id)!;
    let x = pad + (5 + (i % cols) * MENU_ENTRY_W) * u;
    const y = y0 + (13 + Math.floor(i / cols) * 12) * u;
    if (id === SLOP.id) {
      text(c, 'any', x, y + 2 * u, u, 5, '#c9d3dc');
      x += 14 * u;
    } else {
      r.inputs.forEach((inp) => {
        iconAt(c, inp, x, y, 9 * u);
        x += 10 * u;
      });
    }
    text(c, '>', x, y + 1 * u, u, 6, '#e8cf7a');
    x += 5 * u;
    iconAt(c, r.id, x, y, 9 * u);
  });
}

// ------------------------------------------------------------------ modals

function drawModal(game: Game, m: Modal, c: CanvasRenderingContext2D, u: number, CW: number, CH: number) {
  const rows = m.rows();
  if (m.index >= rows.length) m.index = rows.length - 1;
  if (m.kind === 'shop') return drawShop(game, m, rows, c, u, CW, CH);
  if (m.kind === 'talk') return drawTalk(m, rows, c, u, CW, CH);
  c.fillStyle = 'rgba(12,20,40,0.55)';
  c.fillRect(0, 0, CW, CH);
  const w = Math.min(CW - 12 * u, 250 * u);
  const headH = 30 * u;
  const rowH = 13 * u;
  const maxRows = Math.max(3, Math.floor((CH - 52 * u - headH) / rowH));
  const shown = Math.min(rows.length, maxRows);
  const h = headH + shown * rowH + 6 * u;
  const x = CW / 2 - w / 2;
  const y = Math.max(6 * u, CH / 2 - h / 2 - 8 * u);
  panel(c, x, y, w, h, u);
  text(c, m.title, x + 8 * u, y + 5 * u, u, 8, '#ffe066');
  const sub = wrap(c, m.subtitle(), w - 16 * u, u, 4.6);
  sub.slice(0, 2).forEach((l, i) => text(c, l, x + 8 * u, y + (16 + i * 6) * u, u, 4.6, '#c9d3dc'));
  drawRows(c, m, rows, x, y + headH, w, shown * rowH, u, { x: CW / 2, y: y + h + 3 * u });
}

/** A scrolling list of menu rows; the selected row's detail goes under the list when it doesn't fit. */
function drawRows(c: CanvasRenderingContext2D, m: Modal, rows: MenuRow[], x: number, y: number, w: number, h: number, u: number, detailAt: { x: number; y: number }) {
  const rowH = 13 * u;
  const shown = Math.max(1, Math.min(rows.length, Math.floor(h / rowH)));
  const first = Math.max(0, Math.min(m.index - Math.floor(shown / 2), rows.length - shown));
  for (let k = 0; k < shown; k++) {
    const i = first + k;
    const r = rows[i];
    const ry = y + k * rowH;
    if (r.heading) {
      text(c, r.label, x + 8 * u, ry + 4 * u, u, 5, '#e8cf7a');
      continue;
    }
    modalHits.push({ i, x, y: ry, w, h: rowH });
    const sel = i === m.index;
    if (sel) {
      c.fillStyle = 'rgba(232,207,122,0.22)';
      c.fillRect(x + 3 * u, ry, w - 6 * u, rowH - u);
      text(c, '>', x + 5 * u, ry + 3 * u, u, 6, '#ffe066');
    }
    let tx = x + 12 * u;
    if (r.checked !== undefined) {
      c.fillStyle = '#e8cf7a';
      c.fillRect(tx, ry + 3 * u, 7 * u, 7 * u);
      c.fillStyle = '#1d1d2b';
      c.fillRect(tx + u, ry + 4 * u, 5 * u, 5 * u);
      if (r.checked) {
        c.fillStyle = '#5fcf7a';
        c.fillRect(tx + 2 * u, ry + 5 * u, 3 * u, 3 * u);
      }
      tx += 10 * u;
    }
    if (r.icon) {
      iconAt(c, r.icon, tx, ry + 2 * u, 9 * u);
      gradeMarks(c, tx, ry + 2 * u, 9 * u, r.grade);
      tx += 12 * u;
    }
    const col = r.enabled === false ? '#7a8290' : '#ffffff';
    text(c, r.label, tx, ry + 3 * u, u, 6, col);
    if (r.detail) {
      const lw = measure(c, r.label, u, 6);
      const dw = measure(c, r.detail, u, 4.6);
      const room = x + w - 8 * u - (tx + lw + 6 * u);
      if (dw <= room) text(c, r.detail, x + w - 8 * u, ry + 4 * u, u, 4.6, '#9aa6b2', 'right');
      else if (sel) text(c, r.detail, detailAt.x, detailAt.y, u, 4.6, '#c9d3dc', 'center');
    }
  }
  if (first > 0) text(c, '^', x + w - 12 * u, y - 7 * u, u, 6, '#9aa6b2');
  if (first + shown < rows.length) text(c, 'v', x + w - 12 * u, y + shown * rowH - 6 * u, u, 6, '#9aa6b2');
}

const STALL_COLORS: Record<StallId, { awning: string; sky: string }> = {
  fish: { awning: '#2d6fb0', sky: '#9fd3ef' },
  produce: { awning: '#3f8f3f', sky: '#a9dcef' },
  epicerie: { awning: '#e8741c', sky: '#f3d29a' },
  dairy: { awning: '#c8323e', sky: '#f2e2c4' },
};

/** Market stall: the merchant in the middle, wares on the right, their words along the bottom. */
function drawShop(game: Game, m: Modal, rows: MenuRow[], c: CanvasRenderingContext2D, u: number, CW: number, CH: number) {
  c.fillStyle = 'rgba(12,20,40,0.6)';
  c.fillRect(0, 0, CW, CH);
  const stallId = (Object.keys(STALLS) as StallId[]).find((id) => STALLS[id].name === m.title) ?? 'fish';
  const col = STALL_COLORS[stallId];
  const w = Math.min(CW - 12 * u, 400 * u);
  const h = Math.min(CH - 12 * u, 250 * u);
  const x = CW / 2 - w / 2;
  const y = CH / 2 - h / 2;
  const narrow = w < 300 * u;
  panel(c, x, y, w, h, u, 'rgba(29,29,43,0.95)');
  text(c, m.title, x + 8 * u, y + 5 * u, u, 7.5, '#ffe066');
  text(c, m.subtitle(), narrow ? x + 8 * u : x + w - 8 * u, narrow ? y + 15 * u : y + 6 * u, u, 5, '#c9d3dc', narrow ? 'left' : 'right');
  const headH = (narrow ? 24 : 17) * u;

  // merchant's text box along the bottom
  const lineText = m.line ? m.line() : '';
  const boxW = w - 12 * u;
  const lines = wrap(c, lineText, boxW - 14 * u, u, 6);
  const boxH = Math.max(32, 14 + lines.length * 9) * u;
  const boxX = x + 6 * u;
  const boxY = y + h - boxH - 6 * u;

  // the stall scene and the item list share the space above it
  const mainY = y + headH;
  const mainH = boxY - 6 * u - mainY;
  let scene: { x: number; y: number; w: number; h: number };
  let list: { x: number; y: number; w: number; h: number };
  if (narrow) {
    const sh = Math.min(mainH * 0.42, 90 * u);
    scene = { x: x + 6 * u, y: mainY, w: w - 12 * u, h: sh };
    list = { x: x + 4 * u, y: mainY + sh + 4 * u, w: w - 8 * u, h: mainH - sh - 4 * u };
  } else {
    const lw = Math.max(150 * u, w * 0.4);
    scene = { x: x + 6 * u, y: mainY, w: w - lw - 16 * u, h: mainH };
    list = { x: x + w - lw - 6 * u, y: mainY, w: lw, h: mainH };
  }

  // scene: sky, striped awning, the merchant behind a counter of goods
  c.save();
  c.beginPath();
  c.rect(scene.x, scene.y, scene.w, scene.h);
  c.clip();
  c.fillStyle = col.sky;
  c.fillRect(scene.x, scene.y, scene.w, scene.h);
  c.fillStyle = '#e8b86a';
  c.fillRect(scene.x, scene.y + scene.h * 0.35, scene.w, scene.h * 0.65);
  const stripe = 8 * u;
  for (let sx = scene.x, i = 0; sx < scene.x + scene.w; sx += stripe, i++) {
    c.fillStyle = i % 2 ? '#ffffff' : col.awning;
    c.fillRect(sx, scene.y, stripe, 14 * u);
    c.beginPath();
    c.arc(sx + stripe / 2, scene.y + 14 * u, stripe / 2, 0, Math.PI);
    c.fill();
  }
  const k = Math.max(1, Math.floor(Math.min(scene.h * 0.62 / 20, scene.w * 0.5 / 12)));
  const pw = 12 * k;
  const ph = 20 * k;
  const counterH = Math.max(18 * u, scene.h * 0.28);
  const counterY = scene.y + scene.h - counterH;
  const bob = Math.floor(game.time * 2) % 2 ? 0 : k;
  c.imageSmoothingEnabled = false;
  if (m.look) c.drawImage(personSprite(m.look, 'down', 0), scene.x + scene.w / 2 - pw / 2, counterY - ph + ph * 0.3 + bob, pw, ph);
  c.fillStyle = '#c9955d';
  c.fillRect(scene.x, counterY, scene.w, 4 * u);
  c.fillStyle = '#8a5a32';
  c.fillRect(scene.x, counterY + 4 * u, scene.w, counterH - 4 * u);
  c.fillStyle = '#6b4a2a';
  for (let px = scene.x + 10 * u; px < scene.x + scene.w; px += 24 * u) c.fillRect(px, counterY + 4 * u, u, counterH);
  const goods = game.crateFor ? game.crate(game.crateFor).map(() => game.crateFor!) : INGREDIENTS.filter((i) => i.stall === stallId).map((i) => i.id);
  if (game.crateFor) {
    const cw = Math.min(scene.w - 8 * u, 110 * u);
    c.fillStyle = '#9c6b3f';
    c.fillRect(scene.x + scene.w / 2 - cw / 2, counterY - 8 * u, cw, 10 * u);
    c.fillStyle = '#7a5230';
    c.fillRect(scene.x + scene.w / 2 - cw / 2, counterY - 4 * u, cw, u);
  }
  const gs = Math.min(16 * u, (scene.w - 8 * u) / goods.length - 4 * u);
  goods.forEach((id, i) => {
    const gx = scene.x + scene.w / 2 - (goods.length * (gs + 4 * u)) / 2 + i * (gs + 4 * u) + 2 * u;
    iconAt(c, id, gx, counterY - gs + 3 * u, gs);
    if (game.crateFor) gradeMarks(c, gx, counterY - gs + 3 * u, gs, game.crate(game.crateFor)[i]);
  });
  c.restore();
  c.fillStyle = '#e8cf7a';
  c.fillRect(scene.x, scene.y + scene.h, scene.w, u);

  // wares
  panel(c, list.x, list.y, list.w, list.h, u, 'rgba(20,22,34,0.9)');
  drawRows(c, m, rows, list.x, list.y + 4 * u, list.w, list.h - 8 * u, u, { x: list.x + list.w / 2, y: list.y + list.h - 8 * u });

  // the text box, with the merchant's name tag
  panel(c, boxX, boxY, boxW, boxH, u, 'rgba(250,244,228,0.97)');
  const name = m.speaker ?? '';
  const nw = measure(c, name, u, 6) + 12 * u;
  panel(c, boxX + 8 * u, boxY - 8 * u, nw, 11 * u, u, col.awning);
  text(c, name, boxX + 8 * u + nw / 2, boxY - 6 * u, u, 6, '#ffffff', 'center');
  c.font = `${Math.round(6 * u)}px ${FONT}`;
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillStyle = '#2b2b3a';
  lines.forEach((l, i) => c.fillText(l, boxX + 7 * u, boxY + (7 + i * 9) * u));
}

/** Dialogue: portrait and name on a text box along the bottom; choices above it when there are several. */
function drawTalk(m: Modal, rows: MenuRow[], c: CanvasRenderingContext2D, u: number, CW: number, CH: number) {
  c.fillStyle = 'rgba(12,20,40,0.3)';
  c.fillRect(0, 0, CW, CH);
  const w = Math.min(CW - 12 * u, 380 * u);
  const x = CW / 2 - w / 2;
  const port = 40 * u;
  const lineText = m.line ? m.line() : '';
  const lines = wrap(c, lineText, w - port - 24 * u, u, 6);
  const boxH = Math.max(port + 10 * u, (18 + lines.length * 9) * u);
  const y = CH - boxH - 6 * u;
  panel(c, x, y, w, boxH, u, 'rgba(250,244,228,0.97)');
  // portrait: head and shoulders, scaled up
  const px = x + 6 * u;
  const py = y + 6 * u;
  c.fillStyle = '#9fc6dc';
  c.fillRect(px, py, port, port);
  if (m.look) {
    c.imageSmoothingEnabled = false;
    c.drawImage(personSprite(m.look, 'down', 0), 0, 0, 12, 14, px + 2 * u, py + 2 * u, port - 4 * u, (port - 4 * u) * 14 / 12);
  }
  c.save();
  c.strokeStyle = '#6b4a2a';
  c.lineWidth = u;
  c.strokeRect(px, py, port, port);
  c.restore();
  // repaint the box edge the portrait's overflow may have covered
  c.fillStyle = 'rgba(250,244,228,0.97)';
  c.fillRect(px, py + port + u, port, boxH - port - 7 * u);
  const name = m.speaker ?? m.title;
  const nw = measure(c, name, u, 6) + 12 * u;
  panel(c, x + port + 14 * u, y - 8 * u, nw, 11 * u, u, '#2d6fb0');
  text(c, name, x + port + 14 * u + nw / 2, y - 6 * u, u, 6, '#ffffff', 'center');
  c.font = `${Math.round(6 * u)}px ${FONT}`;
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillStyle = '#2b2b3a';
  lines.forEach((l, i) => c.fillText(l, x + port + 14 * u, y + (8 + i * 9) * u));

  if (rows.length === 1) {
    // a single choice: tap anywhere or press E to continue
    const label = `${rows[0].label}  v`;
    const blink = Math.floor(performance.now() / 400) % 2;
    c.font = `${Math.round(5 * u)}px ${FONT}`;
    c.textAlign = 'right';
    c.fillStyle = blink ? '#8a5a32' : '#c9955d';
    c.fillText(`E  ${label}`, x + w - 8 * u, y + boxH - 9 * u);
    modalHits.push({ i: 0, x: 0, y: 0, w: CW, h: CH });
    return;
  }
  const cw = Math.min(w, 280 * u);
  const ch = (rows.length * 13 + 8) * u;
  const cx = x + w - cw;
  const cy = y - ch - 12 * u;
  panel(c, cx, cy, cw, ch, u);
  drawRows(c, m, rows, cx, cy + 4 * u, cw, ch - 8 * u, u, { x: cx + cw / 2, y: cy - 8 * u });
}

function drawSummary(game: Game, c: CanvasRenderingContext2D, u: number, CW: number, CH: number) {
  const r = game.rating;
  c.fillStyle = 'rgba(12,20,40,0.75)';
  c.fillRect(0, 0, CW, CH);
  const w = Math.min(CW - 12 * u, 300 * u);
  const h = Math.min(CH - 12 * u, 184 * u);
  const x = CW / 2 - w / 2;
  const y = CH / 2 - h / 2;
  panel(c, x, y, w, h, u, 'rgba(29,29,43,0.96)');
  text(c, 'Dinner service is over', CW / 2, y + 8 * u, u, 10, '#ffe066', 'center');
  const stars = r?.stars ?? 1;
  const sr = 11 * u;
  for (let i = 0; i < 5; i++) star(c, CW / 2 + (i - 2) * sr * 2.3, y + 36 * u, sr, Math.max(0, Math.min(1, stars - i)));
  text(c, `${stars.toFixed(1)} stars`, CW / 2, y + 50 * u, u, 6.5, '#ffffff', 'center');

  const parts: [string, number][] = r ? [['Menu', r.menu], ['Speed', r.speed], ['Guests fed', r.completion], ['Waiters', r.staff]] : [];
  const bx = x + 16 * u;
  const bw = w - 32 * u;
  parts.forEach(([label, v], i) => {
    const ry = y + (64 + i * 12) * u;
    text(c, label, bx, ry, u, 5.5, '#c9d3dc');
    const lx = bx + 52 * u;
    const lw = bw - 52 * u;
    c.fillStyle = '#3a3f55';
    c.fillRect(lx, ry + 2 * u, lw, 4 * u);
    c.fillStyle = v > 0.66 ? '#5fcf7a' : v > 0.33 ? '#f5c542' : '#ff7a59';
    c.fillRect(lx, ry + 2 * u, Math.max(u, lw * Math.min(1, v)), 4 * u);
  });
  const profit = game.money - BUDGET;
  const lines = [
    `Served ${game.served}   Left hungry ${game.missed}   Served slop ${game.grumbles}`,
    plateLine(game),
    `Spent today ${game.spent}g   Earned at dinner ${game.earned}g`,
    `${profit >= 0 ? 'Profit' : 'Loss'} ${Math.abs(profit)}g   Purse ${game.money}g`,
    `The Butter Moon sails through the night toward ${NEXT_PORT.name}.`,
  ];
  let ly = y + 116 * u;
  for (const l of lines) {
    for (const part of wrap(c, l, w - 16 * u, u, 5.5)) {
      text(c, part, CW / 2, ly, u, 5.5, '#ffffff', 'center');
      ly += 9 * u;
    }
    ly += 2 * u;
  }
  text(c, 'Press E or tap to continue', CW / 2, y + h - 13 * u, u, 6, '#ffe9a8', 'center');
}

function plateLine(game: Game): string {
  const plates = game.tickets.filter((t) => t.state === 'done' && t.served !== SLOP.id);
  if (!plates.length) return 'No proper plates went out tonight.';
  const n = (g: number) => plates.filter((t) => (t.quality ?? 2) === g).length;
  return `Plates: ${n(3)} prime, ${n(2)} fine, ${n(1)} poor`;
}

function overlay(c: CanvasRenderingContext2D, CW: number, CH: number, u: number, title: string, lines: string[]) {
  c.fillStyle = 'rgba(12,20,40,0.72)';
  c.fillRect(0, 0, CW, CH);
  const w = Math.min(CW - 16 * u, 320 * u);
  const size = w < 280 * u ? 5 : 6;
  const wrapped = lines.flatMap((l) => (l ? wrap(c, l, w - 16 * u, u, size) : ['']));
  const lh = size + 4;
  const h = (40 + wrapped.length * lh) * u;
  const x = CW / 2 - w / 2;
  const y = Math.max(4 * u, CH / 2 - h / 2);
  panel(c, x, y, w, h, u);
  text(c, title, CW / 2, y + 9 * u, u, 13, '#ffe066', 'center');
  wrapped.forEach((l, i) => text(c, l, CW / 2, y + (32 + i * lh) * u, u, size, '#ffffff', 'center'));
}
