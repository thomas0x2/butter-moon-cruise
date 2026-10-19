// Draws the world to a low-res canvas, then the HUD on top at screen resolution.

import { floorSprite, hullStrip, icon, personSprite, propSprite, type Look, type Dir, type Item } from './art';
import { BASKET_SIZE, INGREDIENTS, MENU_SIZE, NEXT_PORT, nameOf, recipe } from './data';
import { SERVICE_END, type Game, type Target } from './game';
import { drawBlock, hash2, TILE, tileCenter, toScreen, toWorld } from './grid';
import { charAt, floorAt, isLand, SHIP, type TileMap } from './map';

const SEA = '#1d6a98';
const BURNT_ID = 'burnt';

/** Follow the chef, but keep the view inside the map when the map is bigger than the screen. */
function camera(view: number, size: number, focus: number): number {
  if (size <= view) return (view - size) / 2;
  return Math.min(0, Math.max(view - size, view / 2 - focus));
}

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

const FONT = "'Pixelify Sans', 'Courier New', monospace";

interface Drawable {
  depth: number;
  draw: () => void;
}

export interface View {
  ox: number;
  oy: number;
}

// ------------------------------------------------------------------ world

export function renderWorld(game: Game, g: CanvasRenderingContext2D, W: number, H: number): View {
  const m = game.map;
  const p = toScreen(game.x, game.y);
  const ox = Math.round(camera(W, m.w * TILE, p.x));
  const oy = Math.round(camera(H, m.h * TILE, p.y - 8));
  const t = game.time;
  const onShip = m === SHIP;
  const MAP_W = m.w;
  const MAP_H = m.h;

  g.fillStyle = SEA;
  g.fillRect(0, 0, W, H);
  drawSea(g, W, H, ox, oy, t);
  if (onShip) drawWake(g, ox, oy, t);
  else drawMooredShip(g, ox, oy, t);

  // hull side under the deck's south edge
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (isLand(m, tx, ty) && !isLand(m, tx, ty + 1)) hullStrip(g, tx * TILE + ox, (ty + 1) * TILE + oy, TILE);
    }
  }

  // floors
  const poolFrame = Math.floor(t * 2) % 2;
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!isLand(m, tx, ty)) continue;
      g.drawImage(floorSprite(floorAt(m, tx, ty), tx, ty, poolFrame), tx * TILE + ox, ty * TILE + oy);
    }
  }

  // depth-sorted props and characters
  const list: Drawable[] = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (charAt(m, tx, ty) === 'r') {
        list.push({ depth: ty + 1, draw: () => drawRail(g, m, tx, ty, ox, oy) });
        continue;
      }
      const sp = propSprite(charAt(m, tx, ty));
      if (!sp) continue;
      const x = tx * TILE + ox + sp.ox;
      const y = ty * TILE + oy + sp.oy;
      list.push({ depth: ty + 1, draw: () => g.drawImage(sp.canvas, x, y) });
    }
  }
  for (const s of onShip ? game.stations : []) {
    const c = tileCenter(s.tx, s.ty);
    const cx = c.x + ox;
    const cy = c.y + oy;
    list.push({
      depth: s.ty + 1.01,
      draw: () => {
        const top = cy - 10;
        if (s.kind === 'stove' && (s.recipe || (s.result && s.result !== BURNT_ID))) {
          const flick = Math.floor(t * 10) % 2;
          g.fillStyle = flick ? '#ff9b3d' : '#ffcf4a';
          g.fillRect(cx - 5, cy - 14, 4, 1);
          g.fillRect(cx + 1, cy - 9, 4, 1);
        }
        s.items.forEach((it, i) => g.drawImage(icon(it), cx - 10 + i * 6, top - 6 + (i % 2)));
        if (s.result) g.drawImage(icon(s.result), cx - 4, top - 6);
        if (s.recipe || s.result === BURNT_ID) {
          for (let k = 0; k < 3; k++) {
            const life = (t * 0.8 + k / 3) % 1;
            g.fillStyle = s.result === BURNT_ID ? `rgba(60,60,60,${1 - life})` : `rgba(255,255,255,${0.8 * (1 - life)})`;
            g.fillRect(Math.round(cx - 2 + Math.sin(life * 6 + k) * 3), Math.round(top - 8 - life * 14), 2, 2);
          }
        }
      },
    });
  }
  for (const seat of game.seats) {
    const gst = seat.guest;
    if (!gst) continue;
    const c = tileCenter(seat.tx, seat.ty);
    list.push({
      depth: seat.ty + 1.02,
      draw: () => {
        g.globalAlpha = gst.state === 'leaving' ? Math.max(0, 1 - gst.t) : Math.min(1, gst.t * 3);
        const bob = gst.state === 'eating' ? Math.floor(t * 4) % 2 : 0;
        g.drawImage(personSprite(gst.look, seat.face, 0, true), c.x + ox - 6, c.y + oy - 20 + bob);
        g.globalAlpha = 1;
      },
    });
  }
  for (const w of game.walkers) {
    list.push({ depth: w.y, draw: () => drawPerson(g, w.look, w.dir, w.moving ? w.anim : 0, w.x, w.y, ox, oy, null) });
  }
  list.push({ depth: game.y, draw: () => drawPerson(g, game.look, game.dir, game.moving ? game.anim : 0, game.x, game.y, ox, oy, game.hands) });
  list.sort((a, b) => a.depth - b.depth);
  for (const d of list) d.draw();

  // overlays: order bubbles and progress bars
  for (const seat of game.seats) {
    const gst = seat.guest;
    if (!gst) continue;
    const c = tileCenter(seat.tx, seat.ty);
    const bx = c.x + ox - 7;
    const by = c.y + oy - 36;
    if (gst.state === 'waiting') {
      g.fillStyle = '#1d1d2b';
      g.fillRect(bx - 1, by - 1, 16, 14);
      g.fillStyle = '#ffffff';
      g.fillRect(bx, by, 14, 12);
      g.fillRect(bx + 5, by + 12, 3, 2);
      g.drawImage(icon(gst.order.id), bx + 3, by + 1);
      const f = gst.patience / gst.maxPatience;
      g.fillStyle = '#1d1d2b';
      g.fillRect(bx + 1, by + 9, 12, 2);
      g.fillStyle = f > 0.5 ? '#5fcf7a' : f > 0.25 ? '#f5c542' : Math.floor(t * 6) % 2 ? '#ff5a5a' : '#a02020';
      g.fillRect(bx + 1, by + 9, Math.max(1, Math.round(12 * f)), 2);
    } else if (gst.state === 'eating') {
      const hy = Math.round(by + 8 - (gst.t % 1.5) * 6);
      drawHeart(g, bx + 5, hy);
    }
  }
  for (const s of game.stations) {
    const c = tileCenter(s.tx, s.ty);
    const bx = c.x + ox - 8;
    const by = c.y + oy - 32;
    if (s.recipe) bar(g, bx, by, s.t / s.recipe.time, '#5fcf7a');
    else if (s.kind === 'stove' && s.result && s.result !== BURNT_ID && s.doneT > 3 && Math.floor(t * 6) % 2) {
      g.fillStyle = '#ff5a5a';
      g.fillRect(bx + 6, by - 4, 3, 6);
      g.fillRect(bx + 6, by + 3, 3, 2);
    }
  }
  if (game.target && !game.modal) drawArrow(g, game, game.target, ox, oy, t);

  drawLighting(game, g, W, H, ox, oy);
  return { ox, oy };
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
  const corners = [toWorld(-ox, -oy), toWorld(W - ox, -oy), toWorld(-ox, H - oy), toWorld(W - ox, H - oy)];
  const x0 = Math.floor(Math.min(...corners.map((c) => c.x))) - 1;
  const x1 = Math.ceil(Math.max(...corners.map((c) => c.x))) + 2;
  const y0 = Math.floor(Math.min(...corners.map((c) => c.y))) - 1;
  const y1 = Math.ceil(Math.max(...corners.map((c) => c.y))) + 1;
  const shimmer = Math.floor(t * 1.5) % 3;
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const s = toScreen(i - frac + 0.5, j + 0.5);
      const sx = Math.round(s.x + ox);
      const sy = Math.round(s.y + oy);
      if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue;
      g.drawImage(floorSprite('sea', i + base, j, shimmer), sx - 8, sy - 8);
      const h = hash2(i + base, j + 77);
      if (h < 0.07) {
        const a = 0.35 + 0.45 * Math.abs(Math.sin(t * 1.3 + h * 90));
        g.fillStyle = `rgba(220,240,255,${a.toFixed(2)})`;
        g.fillRect(sx - 3, sy, 5, 1);
        g.fillRect(sx - 1, sy - 1, 2, 1);
      }
    }
  }
}

function drawWake(g: CanvasRenderingContext2D, ox: number, oy: number, t: number) {
  for (let k = 0; k < 70; k++) {
    const life = (t * 0.25 + k * 0.0731) % 1;
    const spread = (hash2(k, 3) - 0.5) * (2 + life * 9);
    const s = toScreen(0.6 - life * 12, 7.5 + spread);
    g.fillStyle = `rgba(240,250,255,${(0.9 * (1 - life)).toFixed(2)})`;
    g.fillRect(Math.round(s.x + ox), Math.round(s.y + oy), 3, 1);
  }
  for (let k = 0; k < 24; k++) {
    const life = (t * 0.6 + k * 0.131) % 1;
    const side = k % 2 ? 1 : -1;
    const s = toScreen(30.5 - life * 3, 7.5 + side * (0.8 + life * 2.5));
    g.fillStyle = `rgba(240,250,255,${(1 - life).toFixed(2)})`;
    g.fillRect(Math.round(s.x + ox), Math.round(s.y + oy) + 2, 2, 1);
  }
}

function drawPerson(g: CanvasRenderingContext2D, look: Look, dir: Dir, anim: number, x: number, y: number, ox: number, oy: number, held: Item | null) {
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
}

function bar(g: CanvasRenderingContext2D, x: number, y: number, f: number, col: string) {
  g.fillStyle = '#1d1d2b';
  g.fillRect(x - 1, y - 1, 18, 4);
  g.fillStyle = '#3a3f55';
  g.fillRect(x, y, 16, 2);
  g.fillStyle = col;
  g.fillRect(x, y, Math.round(16 * Math.min(1, f)), 2);
}

function drawHeart(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = '#ff5d8f';
  g.fillRect(x, y, 2, 1);
  g.fillRect(x + 3, y, 2, 1);
  g.fillRect(x - 1, y + 1, 7, 2);
  g.fillRect(x, y + 3, 5, 1);
  g.fillRect(x + 1, y + 4, 3, 1);
  g.fillRect(x + 2, y + 5, 1, 1);
}

const TARGET_HEIGHT: Record<string, number> = { F: 32, S: 22, C: 22, M: 16, U: 16, V: 18, O: 18, B: 16, W: 22, A: 34, P: 34, E: 34, D: 34, G: 30 };

function drawArrow(g: CanvasRenderingContext2D, game: Game, target: Target, ox: number, oy: number, t: number) {
  const c = tileCenter(target.tx, target.ty);
  const h = target.kind === 'guest' ? 46 : TARGET_HEIGHT[charAt(game.map, target.tx, target.ty)] ?? 24;
  if (target.kind === 'guest') return; // the order bubble already marks the guest
  const x = c.x + ox;
  const y = c.y + oy - h - (Math.floor(t * 3) % 2);
  g.fillStyle = '#1d1d2b';
  g.fillRect(x - 4, y - 1, 9, 1);
  g.fillStyle = '#ffe066';
  g.fillRect(x - 3, y, 7, 1);
  g.fillRect(x - 2, y + 1, 5, 1);
  g.fillRect(x - 1, y + 2, 3, 1);
  g.fillRect(x, y + 3, 1, 1);
}

function drawLighting(game: Game, g: CanvasRenderingContext2D, W: number, H: number, ox: number, oy: number) {
  const hr = game.clock / 60;
  let tint: [number, number, number, number] | null = null;
  if (hr < 7.5) tint = [255, 150, 170, 0.18 * (7.5 - hr) / 1.5];
  else if (hr > 17 && hr < 19) tint = [255, 140, 60, 0.22 * (hr - 17) / 2];
  else if (hr >= 19) tint = [20, 30, 80, Math.min(0.5, 0.22 + 0.28 * ((hr - 19) / 2))];
  if (!tint || tint[3] <= 0) return;
  g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${tint[3].toFixed(3)})`;
  g.fillRect(0, 0, W, H);
  if (hr < 18.5) return;
  const glow = Math.min(1, (hr - 18.5) / 1.5);
  g.globalCompositeOperation = 'lighter';
  for (let ty = 0; ty < SHIP.h; ty++) {
    for (let tx = 0; tx < SHIP.w; tx++) {
      if (game.map !== SHIP || charAt(SHIP, tx, ty) !== 'T') continue;
      const c = tileCenter(tx, ty);
      const x = c.x + ox;
      const y = c.y + oy - 8;
      const grd = g.createRadialGradient(x, y, 0, x, y, 26);
      grd.addColorStop(0, `rgba(255,200,110,${(0.45 * glow).toFixed(3)})`);
      grd.addColorStop(1, 'rgba(255,200,110,0)');
      g.fillStyle = grd;
      g.fillRect(x - 26, y - 26, 52, 52);
    }
  }
  // the butter moon's reflection on the sea
  for (let k = 0; k < 14; k++) {
    const yy = Math.round(H * 0.05 + k * 5);
    const w = 10 - k * 0.5 + Math.sin(game.time * 2 + k) * 3;
    g.fillStyle = `rgba(255,224,120,${(0.35 * glow).toFixed(3)})`;
    g.fillRect(Math.round(W * 0.85 - w / 2), yy, Math.max(2, Math.round(w)), 1);
  }
  g.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ HUD

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, u: number, size = 7, col = '#ffffff', align: CanvasTextAlign = 'left') {
  c.font = `${Math.round(size * u)}px ${FONT}`;
  c.textAlign = align;
  c.textBaseline = 'top';
  c.fillStyle = 'rgba(15,18,32,0.85)';
  c.fillText(s, x + u * 0.6, y + u * 0.6);
  c.fillStyle = col;
  c.fillText(s, x, y);
}

function panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, u: number) {
  c.fillStyle = 'rgba(29,29,43,0.78)';
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

function clockText(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60 / 10) * 10;
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ap}`;
}

/** Screen rectangles of the open modal's rows, for pointer input. */
export const modalHits: { i: number; x: number; y: number; w: number; h: number }[] = [];
export const notebookHit = { x: 0, y: 0, w: 0, h: 0 };

export function renderHud(game: Game, c: CanvasRenderingContext2D, _view: View, u: number, CW: number, CH: number) {
  const pad = 6 * u;
  modalHits.length = 0;
  if (game.phase === 'title') {
    return overlay(c, CW, CH, u, 'Butter Moon Cruise', [
      'You are the chef aboard the MS Butter Moon, docked in Marseille.',
      `This morning: shop the Vieux-Port market. Budget ${game.money}g, basket space ${BASKET_SIZE}.`,
      'This afternoon: combine what you bought into dishes and write the dinner menu.',
      'Tonight: cook and serve dinner. Tomorrow: Naples.',
      '',
      'Move: WASD or arrows   Use: E or Space   Back: Esc   Notebook: N   Mute: M',
      'On touch: drag on the left half to walk, tap the right half to use.',
      '',
      'Press E or tap to start',
    ]);
  }

  // where and when
  panel(c, pad, pad, 104 * u, 34 * u, u);
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

  // phase panel, top right
  const tw = 84 * u;
  const tally =
    game.phase === 'market' ? `Basket ${game.basketCount()}/${BASKET_SIZE}`
    : game.phase === 'prep' ? `Menu ${game.menu.length}/${MENU_SIZE}  Planning`
    : `Served ${game.served}  Left ${game.missed}`;
  // on narrow screens this panel sits under the clock instead of beside it
  const narrow = pad * 3 + 104 * u + tw > CW;
  const tx = narrow ? pad : CW - pad - tw;
  const ty = narrow ? pad + 38 * u : pad;
  panel(c, tx, ty, tw, 30 * u, u);
  text(c, tally, tx + tw / 2, ty + 5 * u, u, 6, '#ffffff', 'center');
  text(c, "N  Chef's notebook", tx + tw / 2, ty + 17 * u, u, 5, '#e8cf7a', 'center');
  Object.assign(notebookHit, { x: tx, y: ty, w: tw, h: 30 * u });

  // bottom-left card: basket at the market, the menu on board
  if (game.phase === 'market' || game.phase === 'prep') drawBasket(game, c, u, pad, CH);
  else if (game.phase === 'service') drawMenuCard(game, c, u, pad, CH);

  // hands slot
  const sw = 22 * u;
  const cardW = 96 * u;
  const sx = pad + cardW + 40 * u > CW / 2 - sw / 2 ? CW - pad - sw - 30 * u : CW / 2 - sw / 2;
  const sy = CH - pad - sw;
  if (game.phase === 'service') {
    panel(c, sx, sy, sw, sw, u);
    if (game.hands) {
      iconAt(c, game.hands, sx + 3 * u, sy + 3 * u, 16 * u);
      text(c, nameOf(game.hands), sx + sw / 2, sy - 10 * u, u, 6, '#ffffff', 'center');
    } else {
      text(c, 'empty hands', sx + sw / 2, sy - 10 * u, u, 5, '#9aa6b2', 'center');
    }
  }

  // interaction prompt
  if (game.target && !game.modal) {
    const label = `E  ${game.promptFor(game.target)}`;
    c.font = `${Math.round(6 * u)}px ${FONT}`;
    const w = c.measureText(label).width + 10 * u;
    const y = sy - 30 * u;
    c.fillStyle = 'rgba(29,29,43,0.85)';
    c.fillRect(CW / 2 - w / 2, y, w, 11 * u);
    text(c, label, CW / 2, y + 2 * u, u, 6, '#ffe9a8', 'center');
  }

  for (const f of game.floaters) {
    const s = toScreen(f.x, f.y);
    c.globalAlpha = Math.min(1, f.t * 1.5);
    text(c, f.text, (s.x + _view.ox) * u, (s.y + _view.oy - 40) * u, u, 8, f.color, 'center');
    c.globalAlpha = 1;
  }

  if (game.phase === 'service' && game.clock > SERVICE_END - 45) {
    text(c, 'Last orders!', CW / 2, pad + 36 * u, u, 7, '#ffb340', 'center');
  }

  if (game.modal) drawModal(game, c, u, CW, CH);

  game.toasts.forEach((t, i) => {
    c.globalAlpha = Math.min(1, t.t * 2);
    const y = (game.modal ? CH - pad - 12 * u : sy - 44 * u) - (game.toasts.length - 1 - i) * 10 * u;
    c.font = `${Math.round(6 * u)}px ${FONT}`;
    const w = c.measureText(t.text).width + 10 * u;
    c.fillStyle = 'rgba(29,29,43,0.8)';
    c.fillRect(CW / 2 - w / 2, y - 2 * u, w, 10 * u);
    text(c, t.text, CW / 2, y, u, 6, '#ffffff', 'center');
    c.globalAlpha = 1;
  });

  if (game.phase === 'summary') {
    const profit = game.money - 120;
    overlay(c, CW, CH, u, 'Dinner service is over', [
      `Guests served: ${game.served}    Guests who left hungry: ${game.missed}`,
      `Spent at the market: ${game.spent}g    Earned at dinner: ${game.earned}g`,
      `${profit >= 0 ? 'Profit' : 'Loss'} for the day: ${Math.abs(profit)}g    Purse: ${game.money}g`,
      `Leftovers in the pantry: ${game.basketCount()}`,
      '',
      `The Butter Moon sails through the night toward ${NEXT_PORT.name}.`,
      'Press E or tap to continue',
    ]);
  }
  if (game.phase === 'arrival') {
    overlay(c, CW, CH, u, `Day 2  ${NEXT_PORT.name}`, [
      `${NEXT_PORT.greeting} The MS Butter Moon has docked in ${NEXT_PORT.name}.`,
      `Tonight's local star: ${NEXT_PORT.dish}.`,
      `You arrive with ${game.money}g in your purse.`,
      '',
      'This is the end of the prototype leg.',
      'Press E or tap to sail from Marseille again',
    ]);
  }
}

function drawBasket(game: Game, c: CanvasRenderingContext2D, u: number, pad: number, CH: number) {
  const items = INGREDIENTS.filter((i) => game.count(i.id));
  const cols = 4;
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const w = 96 * u;
  const h = (16 + rows * 14) * u;
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

function drawMenuCard(game: Game, c: CanvasRenderingContext2D, u: number, pad: number, CH: number) {
  const rows = game.menu.map((id) => recipe(id)!);
  const w = 96 * u;
  const h = (14 + rows.length * 14) * u;
  const y0 = CH - pad - h;
  panel(c, pad, y0, w, h, u);
  text(c, "Tonight's menu", pad + 5 * u, y0 + 4 * u, u, 5, '#e8cf7a');
  rows.forEach((r, i) => {
    const y = y0 + (13 + i * 14) * u;
    let x = pad + 5 * u;
    r.inputs.forEach((id) => {
      iconAt(c, id, x, y, 9 * u);
      x += 10 * u;
    });
    text(c, '>', x, y + 1 * u, u, 6, '#e8cf7a');
    x += 6 * u;
    iconAt(c, r.id, x, y, 9 * u);
    text(c, r.at, x + 11 * u, y + 2 * u, u, 5, '#c9d3dc');
  });
}

function drawModal(game: Game, c: CanvasRenderingContext2D, u: number, CW: number, CH: number) {
  const m = game.modal!;
  const rows = m.rows();
  if (m.index >= rows.length) m.index = rows.length - 1;
  c.fillStyle = 'rgba(12,20,40,0.55)';
  c.fillRect(0, 0, CW, CH);
  const w = Math.min(CW - 12 * u, 250 * u);
  const rowH = 13 * u;
  const headH = 30 * u;
  const maxRows = Math.max(3, Math.floor((CH - 40 * u - headH) / rowH));
  const shown = Math.min(rows.length, maxRows);
  const first = Math.max(0, Math.min(m.index - Math.floor(shown / 2), rows.length - shown));
  const h = headH + shown * rowH + 6 * u;
  const x = CW / 2 - w / 2;
  const y = Math.max(6 * u, CH / 2 - h / 2 - 8 * u);
  panel(c, x, y, w, h, u);
  text(c, m.title, x + 8 * u, y + 5 * u, u, 8, '#ffe066');
  text(c, m.subtitle(), x + 8 * u, y + 17 * u, u, 4.6, '#c9d3dc');
  for (let k = 0; k < shown; k++) {
    const i = first + k;
    const r = rows[i];
    const ry = y + headH + k * rowH;
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
      tx += 12 * u;
    }
    const col = r.enabled === false ? '#7a8290' : '#ffffff';
    text(c, r.label, tx, ry + 3 * u, u, 6, col);
    if (r.detail) {
      c.font = `${Math.round(6 * u)}px ${FONT}`;
      const lw = c.measureText(r.label).width;
      c.font = `${Math.round(4.6 * u)}px ${FONT}`;
      const dw = c.measureText(r.detail).width;
      const room = x + w - 8 * u - (tx + lw + 6 * u);
      if (dw <= room) text(c, r.detail, x + w - 8 * u, ry + 4 * u, u, 4.6, '#9aa6b2', 'right');
      else if (sel) text(c, r.detail, CW / 2, y + h + 3 * u, u, 4.6, '#c9d3dc', 'center');
    }
  }
  if (first > 0) text(c, '...', x + w - 14 * u, y + headH - 6 * u, u, 6, '#9aa6b2');
  if (first + shown < rows.length) text(c, '...', x + w - 14 * u, y + h - 9 * u, u, 6, '#9aa6b2');
}

function overlay(c: CanvasRenderingContext2D, CW: number, CH: number, u: number, title: string, lines: string[]) {
  c.fillStyle = 'rgba(12,20,40,0.72)';
  c.fillRect(0, 0, CW, CH);
  const w = Math.min(CW - 16 * u, 320 * u);
  const h = (40 + lines.length * 11) * u;
  const x = CW / 2 - w / 2;
  const y = CH / 2 - h / 2;
  panel(c, x, y, w, h, u);
  text(c, title, CW / 2, y + 9 * u, u, 13, '#ffe066', 'center');
  lines.forEach((l, i) => text(c, l, CW / 2, y + (32 + i * 11) * u, u, w < 280 * u ? 4.6 : 6, '#ffffff', 'center'));
}
