// Square-grid, three-quarter ("Stardew") view helpers.
// World units are tiles; tile (tx, ty) spans [tx, tx+1] x [ty, ty+1].

export const TILE = 16;

export function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: x * TILE, y: y * TILE };
}

export function toWorld(sx: number, sy: number): { x: number; y: number } {
  return { x: sx / TILE, y: sy / TILE };
}

/** Screen position of a tile's floor centre. */
export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return toScreen(tx + 0.5, ty + 0.5);
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export interface BlockColors {
  top: string;
  front: string;
  edge?: string;
  base?: string;
}

/**
 * Draws a block seen from the front and above: its footprint is (x, y, w, d)
 * on the floor and it stands h px tall, so the top face is lifted by h and
 * the front face fills the gap down to the floor.
 */
export function drawBlock(g: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, col: BlockColors): void {
  g.fillStyle = col.front;
  g.fillRect(x, y + d - h, w, h);
  g.fillStyle = col.top;
  g.fillRect(x, y - h, w, d);
  if (col.edge) {
    g.fillStyle = col.edge;
    g.fillRect(x, y - h, w, 1);
  }
  if (col.base) {
    g.fillStyle = col.base;
    g.fillRect(x, y + d - 1, w, 1);
  }
}

export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
