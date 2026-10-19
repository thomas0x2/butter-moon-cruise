// Game state and rules for one leg of the cruise:
// Marseille market -> menu planning on board -> dinner service -> arrival in Naples.

import { CHEF_LOOK, randomLook, type Dir, type Item, type Look } from './art';
import {
  BASKET_SIZE, BUDGET, BURNT, ingredient, INGREDIENTS, isSubset, matchRecipe, MENU_SIZE, nameOf, NEXT_PORT, recipe,
  RECIPES, STALLS, type Recipe, type StallId,
} from './data';
import { charAt, isSolid, MARKET, SHIP, type TileMap } from './map';
import { sfx } from './sound';

export type Phase = 'title' | 'market' | 'prep' | 'service' | 'summary' | 'arrival';

export interface Station {
  kind: 'stove' | 'board';
  tx: number;
  ty: number;
  items: Item[];
  recipe: Recipe | null;
  t: number;
  result: Item | null;
  doneT: number;
}

export interface Seat {
  tx: number;
  ty: number;
  face: Dir;
  guest: Guest | null;
}

export interface Guest {
  seat: Seat;
  look: Look;
  order: Recipe;
  patience: number;
  maxPatience: number;
  state: 'waiting' | 'eating' | 'leaving';
  t: number;
}

export interface Walker {
  x: number;
  y: number;
  look: Look;
  dir: Dir;
  tx: number;
  ty: number;
  wait: number;
  anim: number;
  moving: boolean;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export interface MenuRow {
  label: string;
  detail?: string;
  icon?: string;
  heading?: boolean;
  enabled?: boolean;
  checked?: boolean;
  action?: () => void;
}

export interface Modal {
  title: string;
  subtitle: () => string;
  rows: () => MenuRow[];
  index: number;
}

export type Target =
  | { kind: 'pantry'; tx: number; ty: number }
  | { kind: 'station'; tx: number; ty: number; station: Station }
  | { kind: 'bin'; tx: number; ty: number }
  | { kind: 'guest'; tx: number; ty: number; guest: Guest }
  | { kind: 'stall'; tx: number; ty: number; stall: StallId }
  | { kind: 'gangway'; tx: number; ty: number }
  | { kind: 'board'; tx: number; ty: number };

const STALL_CHARS: Record<string, StallId> = { A: 'fish', P: 'produce', E: 'epicerie', D: 'dairy' };
const PANTRY_CHARS = new Set(['F', 'M', 'U', 'V', 'O']);
const BURN_AFTER = 8;

export const MARKET_OPEN = 8 * 60;
export const PREP_TIME = 17 * 60;
export const SERVICE_START = 18 * 60;
export const SERVICE_END = 23 * 60;
const LAST_SEATING = 22 * 60 + 15;
const SERVICE_MINUTES_PER_SECOND = 1.5; // dinner lasts a little over three real minutes
const MARKET_MINUTES_PER_SECOND = 0.5;

const rand = Math.random;

export class Game {
  // chef
  x = 0;
  y = 0;
  dir: Dir = 'down';
  faceX = 0;
  faceY = 1;
  anim = 0;
  moving = false;
  hands: Item | null = null;
  readonly look = CHEF_LOOK;

  // world
  map: TileMap = MARKET;
  stations: Station[] = [];
  seats: Seat[] = [];
  walkers: Walker[] = [];
  floaters: Floater[] = [];
  toasts: { text: string; t: number }[] = [];
  target: Target | null = null;
  modal: Modal | null = null;

  // the leg's economy
  phase: Phase = 'title';
  port = 'Marseille';
  day = 1;
  clock = MARKET_OPEN;
  money = BUDGET;
  stock = new Map<string, number>();
  known = new Set<string>();
  menu: string[] = [];
  picks: string[] = [];
  spent = 0;
  earned = 0;
  served = 0;
  missed = 0;
  spawnIn = 3;
  closingIn = -1;
  time = 0;

  constructor() {
    for (let ty = 0; ty < SHIP.h; ty++) {
      for (let tx = 0; tx < SHIP.w; tx++) {
        const c = charAt(SHIP, tx, ty);
        if (c === 'S' || c === 'C') {
          this.stations.push({ kind: c === 'S' ? 'stove' : 'board', tx, ty, items: [], recipe: null, t: 0, result: null, doneT: 0 });
        } else if (c === 'h') {
          this.seats.push({ tx, ty, face: charAt(SHIP, tx + 1, ty) === 'T' ? 'right' : 'left', guest: null });
        }
      }
    }
    this.enterMarket();
  }

  // ------------------------------------------------------------ helpers

  toast(text: string) {
    this.toasts.push({ text, t: 2.6 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  float(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, color, t: 1.4 });
  }

  count(id: string) {
    return this.stock.get(id) ?? 0;
  }

  basketCount() {
    let n = 0;
    for (const v of this.stock.values()) n += v;
    return n;
  }

  private add(id: string, d: number) {
    const n = this.count(id) + d;
    if (n > 0) this.stock.set(id, n);
    else this.stock.delete(id);
  }

  blocked(x: number, y: number, r: number): boolean {
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (!isSolid(this.map, tx, ty)) continue;
        const nx = Math.max(tx, Math.min(x, tx + 1));
        const ny = Math.max(ty, Math.min(y, ty + 1));
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  private spawnWalkers(spots: [number, number][]) {
    this.walkers = spots.map(([sx, sy]) => ({
      x: sx + 0.5, y: sy + 0.5, look: randomLook(rand), dir: 'down' as Dir, tx: sx + 0.5, ty: sy + 0.5, wait: rand() * 3, anim: 0, moving: false,
    }));
  }

  // ------------------------------------------------------------ scene changes

  private enterMarket() {
    this.map = MARKET;
    this.x = 13.5;
    this.y = 10.5;
    this.dir = 'up';
    this.faceX = 0;
    this.faceY = -1;
    this.clock = MARKET_OPEN;
    this.spawnWalkers([[4, 10], [12, 6], [19, 10], [24, 6], [28, 9], [8, 6]]);
  }

  private board() {
    this.map = SHIP;
    this.phase = 'prep';
    this.clock = PREP_TIME;
    this.x = 9.5;
    this.y = 4.5;
    this.dir = 'up';
    this.faceX = 0;
    this.faceY = -1;
    this.hands = null;
    this.modal = null;
    this.spawnWalkers([[5, 9], [17, 8], [26, 7], [12, 12]]);
    this.toast('All aboard! Plan tonight\'s dinner menu at the chalkboard.');
    sfx('start');
  }

  private openService() {
    this.phase = 'service';
    this.clock = SERVICE_START;
    this.modal = null;
    this.spawnIn = 2;
    this.closingIn = -1;
    this.toast('The dining room is open. Bon appetit!');
    sfx('bell');
  }

  private endService() {
    this.phase = 'summary';
    this.modal = null;
    for (const s of this.seats) s.guest = null;
    sfx('start');
  }

  private reset() {
    this.money = BUDGET;
    this.stock.clear();
    this.known.clear();
    this.menu = [];
    this.picks = [];
    this.spent = this.earned = this.served = this.missed = 0;
    this.hands = null;
    this.port = 'Marseille';
    this.day = 1;
    for (const s of this.stations) Object.assign(s, { items: [], recipe: null, t: 0, result: null, doneT: 0 });
    this.enterMarket();
    this.phase = 'market';
  }

  // ------------------------------------------------------------ update

  update(dt: number, ix: number, iy: number) {
    this.time += dt;
    for (const f of this.floaters) {
      f.t -= dt;
      f.y -= dt * 0.4;
    }
    this.floaters = this.floaters.filter((f) => f.t > 0);
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    this.updateWalkers(dt);
    if (this.phase !== 'market' && this.phase !== 'prep' && this.phase !== 'service') return;

    if (!this.modal) this.moveChef(dt, ix, iy);
    else this.moving = false;
    this.target = this.modal ? null : this.findTarget();

    if (this.phase === 'market') this.clock = Math.min(12 * 60, this.clock + dt * MARKET_MINUTES_PER_SECOND);
    if (this.phase === 'service') {
      this.clock += dt * SERVICE_MINUTES_PER_SECOND;
      this.updateStations(dt);
      this.updateGuests(dt);
      if (this.clock >= SERVICE_END) this.endService();
      else if (this.closingIn > 0) {
        this.closingIn -= dt;
        if (this.closingIn <= 0) this.endService();
      }
    }
  }

  private moveChef(dt: number, ix: number, iy: number) {
    let wx = ix;
    let wy = iy;
    const len = Math.hypot(wx, wy);
    this.moving = len > 0;
    if (!this.moving) {
      this.anim = 0;
      return;
    }
    wx /= len;
    wy /= len;
    this.faceX = wx;
    this.faceY = wy;
    this.dir = ix > 0 ? 'right' : ix < 0 ? 'left' : iy < 0 ? 'up' : 'down';
    const speed = 4 * dt;
    const r = 0.28;
    if (!this.blocked(this.x + wx * speed, this.y, r)) this.x += wx * speed;
    if (!this.blocked(this.x, this.y + wy * speed, r)) this.y += wy * speed;
    this.anim += dt;
  }

  private updateWalkers(dt: number) {
    for (const w of this.walkers) {
      if (w.wait > 0) {
        w.wait -= dt;
        w.moving = false;
        if (w.wait <= 0) {
          w.tx = w.x + (rand() - 0.5) * 8;
          w.ty = w.y + (rand() - 0.5) * 6;
        }
        continue;
      }
      const dx = w.tx - w.x;
      const dy = w.ty - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.1) {
        w.wait = 1 + rand() * 4;
        continue;
      }
      const sp = Math.min(d, 1.3 * dt);
      const nx = w.x + (dx / d) * sp;
      const ny = w.y + (dy / d) * sp;
      const tile = charAt(this.map, Math.floor(nx), Math.floor(ny));
      if (this.blocked(nx, ny, 0.3) || tile !== this.map.strollOn || Math.hypot(nx - this.x, ny - this.y) < 0.6) {
        w.wait = 0.5 + rand();
        continue;
      }
      w.x = nx;
      w.y = ny;
      w.moving = true;
      w.anim += dt;
      w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
  }

  private updateStations(dt: number) {
    for (const s of this.stations) {
      if (s.recipe) {
        s.t += dt;
        if (s.t >= s.recipe.time) {
          s.result = s.recipe.id;
          s.recipe = null;
          s.items = [];
          s.doneT = 0;
          sfx('ding');
        }
      } else if (s.result && s.result !== BURNT && s.kind === 'stove') {
        s.doneT += dt;
        if (s.doneT >= BURN_AFTER) {
          s.result = BURNT;
          sfx('burn');
          this.toast('Something burnt on the stove!');
        }
      }
    }
  }

  /** Menu dishes that can still be cooked once every waiting guest's order is accounted for. */
  orderable(): Recipe[] {
    const left = new Map(this.stock);
    const give = (id: string) => left.set(id, (left.get(id) ?? 0) + 1);
    if (this.hands && ingredient(this.hands)) give(this.hands);
    const ready: string[] = [];
    if (this.hands && recipe(this.hands)) ready.push(this.hands);
    for (const s of this.stations) {
      s.items.forEach(give);
      if (s.recipe) ready.push(s.recipe.id);
      if (s.result && s.result !== BURNT) ready.push(s.result);
    }
    for (const seat of this.seats) {
      const g = seat.guest;
      if (!g || g.state !== 'waiting') continue;
      const i = ready.indexOf(g.order.id);
      if (i >= 0) {
        ready.splice(i, 1);
        continue;
      }
      for (const id of g.order.inputs) left.set(id, (left.get(id) ?? 0) - 1);
    }
    for (const id of ready) for (const inp of recipe(id)!.inputs) give(inp);
    return this.menu.map((id) => recipe(id)!).filter((r) => r.inputs.every((id) => (left.get(id) ?? 0) > 0));
  }

  private updateGuests(dt: number) {
    const seated = this.seats.filter((s) => s.guest).length;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.clock < LAST_SEATING && this.closingIn < 0) {
      const options = this.orderable();
      const free = this.seats.filter((s) => !s.guest);
      if (options.length && free.length && seated < 8) {
        const seat = free[Math.floor(rand() * free.length)];
        const order = options[Math.floor(rand() * options.length)];
        seat.guest = { seat, look: randomLook(rand), order, patience: 70, maxPatience: 70, state: 'waiting', t: 0 };
        sfx('bell');
      } else if (!options.length && !this.seats.some((s) => s.guest)) {
        this.toast('The pantry is bare. Closing the kitchen for tonight.');
        this.closingIn = 3;
      }
      this.spawnIn = 7 + rand() * 6;
    }
    for (const seat of this.seats) {
      const g = seat.guest;
      if (!g) continue;
      g.t += dt;
      if (g.state === 'waiting') {
        g.patience -= dt;
        if (g.patience <= 0) {
          g.state = 'leaving';
          g.t = 0;
          this.missed++;
          this.float(seat.tx + 0.5, seat.ty + 0.5, 'Hmph!', '#ff6b6b');
          sfx('miss');
        }
      } else if (g.state === 'eating' && g.t > 6) {
        g.state = 'leaving';
        g.t = 0;
      } else if (g.state === 'leaving' && g.t > 1) {
        seat.guest = null;
      }
    }
  }

  private findTarget(): Target | null {
    const px = this.x + this.faceX * 0.75;
    const py = this.y + this.faceY * 0.75;
    let best: Target | null = null;
    let bestD = 0.95;
    const consider = (t: Target) => {
      const d = Math.hypot(t.tx + 0.5 - px, t.ty + 0.5 - py);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    };
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    for (let ty = y0 - 1; ty <= y0 + 1; ty++) {
      for (let tx = x0 - 1; tx <= x0 + 1; tx++) {
        const c = charAt(this.map, tx, ty);
        if (this.map === MARKET) {
          if (STALL_CHARS[c]) consider({ kind: 'stall', tx, ty, stall: STALL_CHARS[c] });
          else if (c === 'G') consider({ kind: 'gangway', tx, ty });
          continue;
        }
        if (PANTRY_CHARS.has(c)) consider({ kind: 'pantry', tx, ty });
        else if (c === 'W') consider({ kind: 'board', tx, ty });
        else if (c === 'B') consider({ kind: 'bin', tx, ty });
        else if (c === 'S' || c === 'C') {
          const st = this.stations.find((s) => s.tx === tx && s.ty === ty)!;
          consider({ kind: 'station', tx, ty, station: st });
        } else if (c === 'h') {
          const seat = this.seats.find((s) => s.tx === tx && s.ty === ty)!;
          if (seat.guest && seat.guest.state === 'waiting') consider({ kind: 'guest', tx, ty, guest: seat.guest });
        }
      }
    }
    return best;
  }

  /** Label for the interaction prompt. */
  promptFor(t: Target): string {
    const held = this.hands ? nameOf(this.hands).toLowerCase() : '';
    switch (t.kind) {
      case 'stall':
        return `Browse the ${STALLS[t.stall].name}`;
      case 'gangway':
        return 'Board the Butter Moon';
      case 'board':
        return this.phase === 'prep' ? "Plan tonight's menu" : "Tonight's menu";
      case 'pantry':
        if (this.phase === 'prep') return 'Pantry';
        if (this.hands && ingredient(this.hands)) return `Put back ${held}`;
        return this.hands ? 'Hands full' : 'Open the pantry';
      case 'bin':
        return this.hands ? `Toss ${held}` : 'Bin';
      case 'guest':
        return this.hands === t.guest.order.id ? `Serve ${held}` : `Wants ${nameOf(t.guest.order.id).toLowerCase()}`;
      case 'station': {
        const s = t.station;
        const name = s.kind === 'stove' ? 'stove' : 'board';
        if (this.phase !== 'service') return s.kind === 'stove' ? 'Stove' : 'Cutting board';
        if (s.result) return this.hands ? 'Hands full' : `Take ${nameOf(s.result).toLowerCase()}`;
        if (s.recipe) return s.kind === 'stove' ? 'Cooking...' : 'Chopping...';
        if (this.hands) return `Put on ${name}`;
        if (s.items.length) return `Take back ${nameOf(s.items[s.items.length - 1]).toLowerCase()}`;
        return name === 'stove' ? 'Stove' : 'Cutting board';
      }
    }
  }

  // ------------------------------------------------------------ input

  interact() {
    if (this.modal) return this.modalSelect();
    switch (this.phase) {
      case 'title':
        this.phase = 'market';
        this.toast('Welcome to the Vieux-Port market! Fill your basket.');
        sfx('start');
        return;
      case 'summary':
        this.phase = 'arrival';
        this.port = NEXT_PORT.name;
        this.day = 2;
        this.clock = MARKET_OPEN;
        sfx('bell');
        return;
      case 'arrival':
        this.reset();
        return;
    }
    const t = this.target;
    if (!t) return;
    switch (t.kind) {
      case 'stall':
        return this.openStall(t.stall);
      case 'gangway':
        return this.openGangway();
      case 'board':
        return this.phase === 'prep' ? this.openWorkbench() : this.openMenuCard();
      case 'pantry':
        if (this.phase === 'prep') return this.toast('Plan the menu at the chalkboard first.');
        if (this.hands && ingredient(this.hands)) {
          this.add(this.hands, 1);
          this.hands = null;
          sfx('place');
          return;
        }
        if (this.hands) return this.toast('Your hands are full.');
        return this.openPantry();
      case 'bin':
        if (!this.hands) return;
        this.toast(`Tossed the ${nameOf(this.hands).toLowerCase()}.`);
        this.hands = null;
        sfx('toss');
        return;
      case 'guest': {
        const g = t.guest;
        if (this.hands !== g.order.id) {
          sfx('nope');
          return this.toast(`They ordered ${nameOf(g.order.id)}.`);
        }
        const tip = Math.round(g.order.price * 0.5 * (g.patience / g.maxPatience));
        const pay = g.order.price + tip;
        this.money += pay;
        this.earned += pay;
        this.served++;
        this.hands = null;
        g.state = 'eating';
        g.t = 0;
        this.float(t.tx + 0.5, t.ty + 0.5, `+${pay}g`, '#ffe066');
        sfx('coin');
        return;
      }
      case 'station':
        if (this.phase !== 'service') return this.toast('The kitchen opens when dinner service starts.');
        return this.useStation(t.station);
    }
  }

  cancel() {
    if (this.modal) {
      this.modal = null;
      sfx('toss');
    }
  }

  openNotebook() {
    if (this.phase !== 'market' && this.phase !== 'prep' && this.phase !== 'service') return;
    if (this.modal) return this.cancel();
    this.modal = {
      title: "Chef's notebook",
      subtitle: () => 'Dishes worth trying on this leg. Ingredients are your call.',
      index: 0,
      rows: () => RECIPES.map((r) => ({
        label: this.known.has(r.id) ? r.name : `${r.name}  (${r.inputs.length} ingredients)`,
        detail: this.known.has(r.id) ? r.inputs.map(nameOf).join(' + ') : r.hint,
        icon: r.id,
        enabled: true,
      })),
    };
  }

  moveSelection(d: number) {
    const m = this.modal;
    if (!m) return;
    const rows = m.rows();
    let i = m.index;
    for (let k = 0; k < rows.length; k++) {
      i = (i + d + rows.length) % rows.length;
      if (!rows[i].heading) break;
    }
    m.index = i;
    sfx('pick');
  }

  selectRow(i: number) {
    if (!this.modal) return;
    this.modal.index = i;
    this.modalSelect();
  }

  private modalSelect() {
    const m = this.modal!;
    const rows = m.rows();
    const row = rows[Math.min(m.index, rows.length - 1)];
    if (!row || row.heading) return;
    if (row.enabled === false || !row.action) {
      sfx('nope');
      return;
    }
    row.action();
  }

  // ------------------------------------------------------------ market

  private openStall(id: StallId) {
    const stall = STALLS[id];
    this.modal = {
      title: stall.name,
      subtitle: () => `"${stall.keeper}"   Purse ${this.money}g   Basket ${this.basketCount()}/${BASKET_SIZE}`,
      index: 0,
      rows: () => {
        const rows: MenuRow[] = INGREDIENTS.filter((i) => i.stall === id).map((ing) => ({
          label: `${ing.name}  ${ing.price}g`,
          detail: this.count(ing.id) ? `in basket: ${this.count(ing.id)}` : undefined,
          icon: ing.id,
          enabled: this.money >= ing.price && this.basketCount() < BASKET_SIZE,
          action: () => {
            this.money -= ing.price;
            this.spent += ing.price;
            this.add(ing.id, 1);
            sfx('coin');
          },
        }));
        const inBasket = INGREDIENTS.filter((i) => i.stall === id && this.count(i.id));
        if (inBasket.length) {
          rows.push({ label: 'Change your mind', heading: true });
          for (const ing of inBasket) {
            rows.push({
              label: `Hand back one: ${ing.name}  +${ing.price}g`,
              icon: ing.id,
              enabled: true,
              action: () => {
                this.money += ing.price;
                this.spent -= ing.price;
                this.add(ing.id, -1);
                sfx('toss');
              },
            });
          }
        }
        rows.push({ label: 'Done', enabled: true, action: () => this.cancel() });
        return rows;
      },
    };
  }

  private openGangway() {
    this.modal = {
      title: 'Board the Butter Moon?',
      subtitle: () => `The ship sails for ${NEXT_PORT.name} tonight. Basket ${this.basketCount()}/${BASKET_SIZE}, ${this.money}g left.`,
      index: 0,
      rows: () => [
        { label: 'Not yet, keep shopping', enabled: true, action: () => this.cancel() },
        {
          label: 'All aboard, head to the galley',
          detail: this.basketCount() ? undefined : 'Your basket is empty',
          enabled: this.basketCount() > 0,
          action: () => this.board(),
        },
      ],
    };
  }

  // ------------------------------------------------------------ menu planning

  private openWorkbench() {
    this.modal = {
      title: "Tonight's dinner menu",
      subtitle: () => `Pick 2 or 3 ingredients and taste them together. Menu ${this.menu.length}/${MENU_SIZE}.`,
      index: 1,
      rows: () => {
        const rows: MenuRow[] = [{ label: 'Your pantry', heading: true }];
        for (const ing of INGREDIENTS) {
          if (!this.count(ing.id)) continue;
          rows.push({
            label: ing.name,
            detail: `x${this.count(ing.id)}`,
            icon: ing.id,
            checked: this.picks.includes(ing.id),
            enabled: true,
            action: () => {
              const at = this.picks.indexOf(ing.id);
              if (at >= 0) this.picks.splice(at, 1);
              else if (this.picks.length < 3) this.picks.push(ing.id);
              else return this.toast('Three ingredients at most.');
              sfx('pick');
            },
          });
        }
        rows.push({
          label: this.picks.length ? `Taste: ${this.picks.map(nameOf).join(' + ')}` : 'Taste the combination',
          enabled: this.picks.length >= 2,
          action: () => this.taste(),
        });
        rows.push({ label: 'Dishes you can make', heading: true });
        if (!this.known.size) rows.push({ label: 'Nothing yet. Combine ingredients above.', heading: true });
        for (const id of this.known) {
          const r = recipe(id)!;
          const on = this.menu.includes(id);
          rows.push({
            label: `${r.name}  ${r.price}g`,
            detail: `${r.inputs.map(nameOf).join(' + ')}  (${r.at === 'stove' ? 'stove' : 'board'})`,
            icon: id,
            checked: on,
            enabled: on || this.menu.length < MENU_SIZE,
            action: () => {
              if (on) this.menu = this.menu.filter((m) => m !== id);
              else this.menu.push(id);
              sfx('place');
            },
          });
        }
        rows.push({
          label: 'Open the dining room',
          detail: this.menu.length ? this.menu.map(nameOf).join(', ') : 'Put at least one dish on the menu',
          enabled: this.menu.length > 0,
          action: () => this.openService(),
        });
        return rows;
      },
    };
  }

  private taste() {
    const r = matchRecipe(this.picks);
    if (!r) {
      sfx('nope');
      this.toast("Hmm, that doesn't come together as a dish.");
      return;
    }
    if (this.known.has(r.id)) {
      this.toast(`You already know ${r.name}.`);
    } else {
      this.known.add(r.id);
      this.toast(`New recipe: ${r.name}!`);
      sfx('ding');
      if (this.menu.length < MENU_SIZE) this.menu.push(r.id);
    }
    this.picks = [];
  }

  private openMenuCard() {
    this.modal = {
      title: "Tonight's menu",
      subtitle: () => 'Guests only order what is on the menu and what the pantry can still make.',
      index: 0,
      rows: () => [
        ...this.menu.map((id) => {
          const r = recipe(id)!;
          return { label: `${r.name}  ${r.price}g`, detail: `${r.inputs.map(nameOf).join(' + ')}  (${r.at})`, icon: id, enabled: true };
        }),
        { label: 'Back to work', enabled: true, action: () => this.cancel() },
      ],
    };
  }

  // ------------------------------------------------------------ service

  private openPantry() {
    this.modal = {
      title: 'Pantry',
      subtitle: () => 'Take one ingredient at a time.',
      index: 0,
      rows: () => {
        const rows: MenuRow[] = INGREDIENTS.filter((i) => this.count(i.id)).map((ing) => ({
          label: ing.name,
          detail: `x${this.count(ing.id)}`,
          icon: ing.id,
          enabled: true,
          action: () => {
            this.add(ing.id, -1);
            this.hands = ing.id;
            this.modal = null;
            sfx('pick');
          },
        }));
        if (!rows.length) rows.push({ label: 'The pantry is empty.', heading: true });
        rows.push({ label: 'Close', enabled: true, action: () => this.cancel() });
        return rows;
      },
    };
  }

  private useStation(s: Station) {
    if (s.result) {
      if (this.hands) return this.toast('Your hands are full.');
      this.hands = s.result;
      s.result = null;
      sfx('pick');
      return;
    }
    if (s.recipe) return;
    if (!this.hands) {
      const back = s.items.pop();
      if (back) {
        this.hands = back;
        sfx('pick');
      }
      return;
    }
    if (!ingredient(this.hands)) return this.toast('Serve that to a guest, or bin it.');
    const next = [...s.items, this.hands];
    const fits = this.menu.map((id) => recipe(id)!).filter((r) => r.at === s.kind && isSubset(next, r.inputs));
    if (!fits.length) {
      sfx('nope');
      const where = s.kind === 'stove' ? 'stove' : 'board';
      return this.toast(next.length > 1 ? "That doesn't make anything on tonight's menu." : `Nothing on the menu starts with ${nameOf(this.hands).toLowerCase()} on the ${where}.`);
    }
    s.items = next;
    this.hands = null;
    sfx('place');
    const exact = fits.find((r) => r.inputs.length === next.length);
    if (exact) {
      s.recipe = exact;
      s.t = 0;
    }
  }
}
