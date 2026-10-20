// Game state and rules for one leg of the cruise:
// Marseille market (until 1 pm) -> free time aboard (until 3) -> kitchen prep (until 6) -> dinner service -> Naples.

import { CHEF_LOOK, randomLook, type Dir, type Item, type Look } from './art';
import {
  BASKET_SIZE, BUDGET, BURNT, GUESTS_TONIGHT, STARTER_RECIPES, ingredient, INGREDIENTS, isSubset, machineLevel, matchRecipe, MENU_SIZE, nameOf, NEXT_PORT, recipe,
  cueFor, GRADE_NAMES, isPrep, prepOf, PREP, RECIPES, rollGrade, SECRET_SELLERS, SLOP, STALLS, UPGRADES, REGULARS, type Machine, type Recipe, type SecretSeller, type StallId,
} from './data';
import { ASHORE, CABIN, charAt, doorAt, GALLEY, isSolid, LIDO, MAPS, MARKET, type Door, type MapId, type TileMap } from './map';
import { MERCHANT_LOOKS, NPCS, STAFF_OPTIONS, type NpcDef, type StaffOption } from './npcs';
import { sfx } from './sound';

/**
 * A port day: morning ashore (market, old town) until the all-aboard horn, then the ship until kitchen prep,
 * afternoon prep in the galley, evening dinner service. The clock is what limits exploring.
 */
/** port: day one, a free day in Marseille (port, city and ship). aboard: the sea day until kitchen prep.
 * evening: after the stars, until bed or midnight. Every day ends only in bed or at midnight. */
export type Phase = 'title' | 'port' | 'aboard' | 'prep' | 'service' | 'summary' | 'evening' | 'arrival';

export interface Station {
  kind: Machine;
  tx: number;
  ty: number;
  items: Item[];
  /** quality grade of each item, parallel to items */
  grades: number[];
  recipe: Recipe | null;
  t: number;
  result: Item | null;
  resultQ: number;
  doneT: number;
  /** seconds this batch takes, after upgrades */
  dur: number;
}

export interface Npc {
  def: NpcDef;
  x: number;
  y: number;
  dir: Dir;
  tx: number;
  ty: number;
  wait: number;
  anim: number;
  moving: boolean;
}

export interface Ticket {
  id: number;
  dish: string;
  table: number;
  patience: number;
  max: number;
  state: 'pending' | 'open' | 'taken' | 'done' | 'missed';
  /** what actually went out, and how fresh the ticket still was */
  served?: string;
  quality?: number;
  freshness?: number;
  /** a regular passenger, who orders their favourite when it is on the menu */
  guest?: string;
}

export interface PassSlot {
  tx: number;
  dish: Item | null;
  q: number;
  claimed: boolean;
}

/** A steel counter in the galley: somewhere to set one thing down. */
export interface Counter {
  tx: number;
  ty: number;
  item: Item | null;
  q: number;
}

export interface Waiter {
  name: string;
  look: Look;
  x: number;
  y: number;
  homeX: number;
  dir: Dir;
  anim: number;
  moving: boolean;
  task: null | { kind: 'drop'; ticket: Ticket } | { kind: 'pickup'; slot: PassSlot; ticket: Ticket };
  stage: 'off' | 'going' | 'back';
  carrying: Item | null;
  carryingQ: number;
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
  /** draw the icon with this quality grade's look */
  grade?: number;
  action?: () => void;
}

export interface Modal {
  kind: 'list' | 'shop' | 'talk' | 'fish';
  title: string;
  subtitle: () => string;
  rows: () => MenuRow[];
  index: number;
  /** shop and talk: who is speaking and what they say */
  speaker?: string;
  look?: Look;
  line?: () => string;
}

export type Target =
  | { kind: 'pantry'; tx: number; ty: number }
  | { kind: 'station'; tx: number; ty: number; station: Station }
  | { kind: 'bin'; tx: number; ty: number }
  | { kind: 'pass'; tx: number; ty: number; slot: PassSlot }
  | { kind: 'counter'; tx: number; ty: number; counter: Counter }
  | { kind: 'stall'; tx: number; ty: number; stall: StallId }
  | { kind: 'gangway'; tx: number; ty: number }
  | { kind: 'ashore'; tx: number; ty: number }
  | { kind: 'bed'; tx: number; ty: number }
  | { kind: 'locked'; tx: number; ty: number; text: string }
  | { kind: 'board'; tx: number; ty: number }
  | { kind: 'catalog'; tx: number; ty: number }
  | { kind: 'rod'; tx: number; ty: number }
  | { kind: 'planter'; tx: number; ty: number; planter: Planter }
  | { kind: 'npc'; tx: number; ty: number; npc: Npc };

export interface Planter {
  tx: number;
  ty: number;
  crop: string;
  wateredDay: number;
  /** clock minute it was watered; it ripens an hour later */
  wateredAt: number;
  harvestedDay: number;
}

/** The float bobbing on the bar; reel in while it sits in the gold for a prime catch. */
export interface Fishing {
  t: number;
  speed: number;
  /** centre of the bite zone, 0..1 along the bar */
  zone: number;
  result: 0 | 1 | 2 | 3 | null;
  castsLeft: number;
}

export interface Rating {
  stars: number;
  /** how good the plates were: ingredients, machines, the dishes themselves */
  plates: number;
  variety: number;
  /** regulars who got their favourite */
  favourites: number;
  fed: number;
  speed: number;
  staff: number;
}

const STALL_CHARS: Record<string, StallId> = { A: 'fish', P: 'produce', E: 'epicerie', Y: 'dairy' };
const PANTRY_CHARS = new Set(['F', 'M', 'U', 'V', 'O']);
const BURN_AFTER = 8;
const STRIP_Y = [1.7, 2.5];
const PASS_Y = 2.6;

export const MARKET_OPEN = 8 * 60;
/** every day ends at midnight wherever the chef is, unless they went to bed first */
export const LIGHTS_OUT = 24 * 60;
/** the chef is due in the galley */
export const PREP_START = 15 * 60;
export const SERVICE_START = 18 * 60;
export const SERVICE_END = 23 * 60;
const LAST_SEATING = 22 * 60 + 15;
const MINUTES_PER_SECOND: Partial<Record<Phase, number>> = { port: 2, aboard: 2, prep: 1, service: 1.5, evening: 1 };
const MAX_TICKETS = 6;

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
  /** quality grade of what the chef holds */
  handsQ = 2;
  readonly look = CHEF_LOOK;

  // world
  map: TileMap = MARKET;
  npcs: Npc[] = [];
  stations: Station[] = [];
  pass: PassSlot[] = [];
  tickets: Ticket[] = [];
  waiters: Waiter[] = [];
  floaters: Floater[] = [];
  toasts: { text: string; t: number }[] = [];
  target: Target | null = null;
  modal: Modal | null = null;
  /** door transition: fades out, swaps rooms, fades in */
  warp: { door: Door; t: number; swapped: boolean } | null = null;
  roomBanner = 0;

  // the leg's economy
  phase: Phase = 'title';
  port = 'Marseille';
  day = 1;
  clock = MARKET_OPEN;
  money = BUDGET;
  stock = new Map<string, number>();
  /** quality grades of every unit in stock, best first */
  grades = new Map<string, number[]>();
  /** the market crates you pick from, one per ingredient */
  crates = new Map<string, number[]>();
  crateFor: string | null = null;
  planters: Planter[] = [];
  /** hidden sellers who have had their favour done, and what they have left */
  favours = new Set<string>();
  sellerStock = new Map<string, number>();
  fishing: Fishing = { t: 0, speed: 2, zone: 0.5, result: null, castsLeft: 3 };
  known = new Set<string>(STARTER_RECIPES);
  menu: string[] = [];
  picks: string[] = [];
  staff: StaffOption = STAFF_OPTIONS[0];
  owned = new Set<string>();
  spent = 0;
  earned = 0;
  served = 0;
  missed = 0;
  favouritesServed = 0;
  regularsTonight = new Set<string>();
  grumbles = 0;
  rating: Rating | null = null;
  counters: Counter[] = [];
  spawnIn = 3;
  closingIn = -1;
  nextTicket = 1;
  shopLine = '';
  time = 0;

  constructor() {
    for (let ty = 0; ty < GALLEY.h; ty++) {
      for (let tx = 0; tx < GALLEY.w; tx++) {
        const c = charAt(GALLEY, tx, ty);
        const kind: Machine | null = c === 'S' ? 'stove' : c === 'C' ? 'board' : c === 'z' ? 'pot' : c === 'v' ? 'oven' : null;
        if (kind) this.stations.push({ kind, tx, ty, items: [], grades: [], recipe: null, t: 0, result: null, resultQ: 2, doneT: 0, dur: 1 });
        if (c === 'X') this.pass.push({ tx, dish: null, q: 2, claimed: false });
        if (c === 'e') this.counters.push({ tx, ty, item: null, q: 2 });
      }
    }
    this.resetPlanters();
    this.enterMap(MARKET, 13.5, 10.5, 'up');
  }

  private resetPlanters() {
    const crops = ['herbs', 'tomato', 'courgette'];
    this.planters = [];
    for (let ty = 0; ty < LIDO.h; ty++) {
      for (let tx = 0; tx < LIDO.w; tx++) {
        if (charAt(LIDO, tx, ty) === '%') this.planters.push({ tx, ty, crop: crops[this.planters.length % crops.length], wateredDay: 0, wateredAt: 0, harvestedDay: 0 });
      }
    }
  }

  /** Ripe once watered today and given an hour of sun. */
  ripe(p: Planter) {
    return p.wateredDay === this.day && this.clock >= p.wateredAt + 60 && p.harvestedDay !== this.day;
  }

  // ------------------------------------------------------------ helpers

  toast(text: string) {
    this.toasts.push({ text, t: 2.8 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  float(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, color, t: 1.6 });
  }

  count(id: string) {
    return this.stock.get(id) ?? 0;
  }

  basketCount() {
    let n = 0;
    for (const v of this.stock.values()) n += v;
    return n;
  }

  /** Adds or removes one unit; removing takes the given grade, else the worst one. Returns the grade moved. */
  private add(id: string, d: number, q?: number): number {
    const list = this.grades.get(id) ?? [];
    let moved = q ?? 2;
    if (d > 0) {
      list.push(moved);
      list.sort((a, b) => b - a);
    } else {
      const at = q !== undefined && list.includes(q) ? list.indexOf(q) : list.length - 1;
      moved = list.splice(at, 1)[0] ?? 2;
    }
    if (list.length) this.grades.set(id, list);
    else this.grades.delete(id);
    const n = this.count(id) + d;
    if (n > 0) this.stock.set(id, n);
    else this.stock.delete(id);
    return moved;
  }

  /** Plate quality as a pay and rating multiplier: poor 0.85, fine 1, prime 1.15. */
  plateFactor(q: number) {
    return 0.7 + 0.15 * q;
  }

  crate(id: string): number[] {
    let c = this.crates.get(id);
    if (!c) {
      c = Array.from({ length: 5 }, rollGrade);
      this.crates.set(id, c);
    }
    return c;
  }

  get roaming() {
    return this.free || this.phase === 'prep' || this.phase === 'service' || this.phase === 'evening';
  }

  /** free time: the port day, or the sea day before prep */
  get free() {
    return this.phase === 'port' || this.phase === 'aboard';
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

  // ------------------------------------------------------------ rooms

  private enterMap(m: TileMap, x: number, y: number, dir: Dir) {
    this.map = m;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.faceX = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    this.faceY = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    this.roomBanner = 2.2;
    const onShip = !ASHORE.has(m.id);
    const defs = NPCS.filter((n) => n.map === m.id && !(this.phase === 'service' && n.map === 'restaurant'));
    const extras: NpcDef[] = [];
    const crowd = m.id === 'market' ? 4 : m.id === 'city' ? 4 : m.id === 'garde' ? 2 : m.id === 'lido' ? 3 : m.id === 'lobby' ? 1 : 0;
    for (let i = 0; i < crowd; i++) {
      const spot = this.freeSpot(m);
      if (spot) extras.push({ name: onShip ? 'Passenger' : 'Local', map: m.id, x: spot[0], y: spot[1], stroll: true, look: randomLook(rand), lines: [pick(onShip ? PASSENGER_LINES : LOCAL_LINES)] });
    }
    this.npcs = [...defs, ...extras].map((def) => ({
      def, x: def.x, y: def.y, dir: def.facing ?? 'down', tx: def.x, ty: def.y, wait: rand() * 3, anim: 0, moving: false,
    }));
  }

  private freeSpot(m: TileMap): [number, number] | null {
    for (let i = 0; i < 40; i++) {
      const tx = 1 + Math.floor(rand() * (m.w - 2));
      const ty = 1 + Math.floor(rand() * (m.h - 2));
      if (charAt(m, tx, ty) === m.strollOn) return [tx + 0.5, ty + 0.5];
    }
    return null;
  }

  private useDoor(door: Door) {
    if ((this.phase === 'service' || this.phase === 'prep') && this.map === GALLEY) {
      this.toast(this.phase === 'prep' ? 'Prep time. The galley needs you until service.' : 'Service is on! Stay in the galley; the waiters handle the dining room.');
      return false;
    }
    this.warp = { door, t: 0, swapped: false };
    sfx('place');
    return true;
  }

  private reminded = new Set<number>();

  /** One toast when the clock passes a time today. */
  private remind(at: number, text: string) {
    if (this.clock < at || this.reminded.has(at)) return;
    this.reminded.add(at);
    this.toast(text);
    sfx('bell');
  }

  /** 3 pm: the chef is called to the galley for menu planning and mise en place. */
  private startPrep() {
    this.phase = 'prep';
    this.clock = Math.max(this.clock, PREP_START);
    this.modal = null;
    this.hands = null;
    if (this.map !== GALLEY) this.warp = { door: { x: 0, y: 0, to: 'galley', sx: 10.5, sy: 9.0, dir: 'up' }, t: 0, swapped: false };
    this.toast('3 pm, kitchen prep. Plan the menu at the chalkboard and prep at the cutting board.');
    sfx('bell');
  }

  /** Up the gangway; on the port day you can come and go as you like. */
  private board() {
    this.hands = null;
    this.modal = null;
    this.warp = { door: { x: 0, y: 0, to: 'lobby', sx: 10.9, sy: 10.3, dir: 'up' }, t: 0, swapped: false };
    sfx('place');
  }

  private goAshore() {
    this.warp = { door: { x: 0, y: 0, to: 'market', sx: 26.5, sy: 5.6, dir: 'down' }, t: 0, swapped: false };
    sfx('place');
  }

  /** Bed, or midnight. Night one the ship sails for a day at sea; night two it docks in Naples. */
  private sleep(late = false) {
    this.modal = null;
    this.hands = null;
    this.reminded.clear();
    if (this.phase === 'evening') {
      this.phase = 'arrival';
      this.port = NEXT_PORT.name;
      this.day = 3;
      this.clock = MARKET_OPEN;
      sfx('bell');
      return;
    }
    this.day = 2;
    this.port = 'at sea';
    this.clock = MARKET_OPEN;
    this.fishing.castsLeft = 3;
    this.phase = 'aboard';
    this.warp = { door: { x: 0, y: 0, to: 'cabin', sx: 3.5, sy: 3.4, dir: 'down' }, t: 0, swapped: false };
    this.toast(late
      ? 'Midnight! The purser walks you to your bunk. The ship slips out of Marseille.'
      : 'You sleep while the ship slips out of Marseille.');
    this.toast(`Day 2, at sea. The ship is yours until kitchen prep at 3 pm. ${GUESTS_TONIGHT} guests tonight.`);
    sfx('bell');
  }

  // ------------------------------------------------------------ service lifecycle

  private openService() {
    this.phase = 'service';
    this.clock = SERVICE_START;
    this.modal = null;
    this.spawnIn = 2;
    this.closingIn = -1;
    this.tickets = [];
    this.waiters = this.staff.crew.map((c, i) => ({
      name: c.name, look: c.look, x: i ? GALLEY.w - 1.4 : 1.4, y: STRIP_Y[i % 2], homeX: i ? GALLEY.w - 1.4 : 1.4,
      dir: 'down' as Dir, anim: 0, moving: false, task: null, stage: 'off' as const, carrying: null, carryingQ: 2,
    }));
    this.toast('Doors are open. Tickets will come in at the pass.');
    sfx('bell');
  }

  private endService() {
    this.phase = 'summary';
    this.modal = null;
    for (const t of this.tickets) {
      if (t.state !== 'open' && t.state !== 'pending') continue;
      t.state = 'missed';
      this.missed++;
    }
    this.rating = this.rate();
    sfx('start');
  }

  /** Stars reward care: good plates, a varied menu, regulars' favourites. Speed barely matters. */
  rate(): Rating {
    const done = this.tickets.filter((t) => t.state === 'done');
    const total = Math.max(GUESTS_TONIGHT, done.length + this.tickets.filter((t) => t.state === 'missed').length);
    const real = done.filter((t) => t.served !== SLOP.id);
    const plates = done.length ? real.reduce((s, t) => s + Math.min(1, (0.45 + recipe(t.served!)!.price / 90) * this.quality(t.served!) * this.plateFactor(t.quality ?? 2)), 0) / done.length : 0;
    const variety = Math.min(1, new Set(real.map((t) => t.served)).size / MENU_SIZE);
    const favourites = this.regularsTonight.size ? this.favouritesServed / this.regularsTonight.size : 0;
    const fed = total ? done.length / total : 0;
    const speed = done.length ? done.reduce((s, t) => s + (t.freshness ?? 0), 0) / done.length : 0;
    const staff = this.staff.skill / 5;
    const score = total ? 0.4 * plates + 0.15 * variety + 0.2 * favourites + 0.1 * fed + 0.05 * speed + 0.1 * staff : 0;
    const stars = Math.max(1, Math.min(5, Math.round((1 + 4 * score) * 2) / 2));
    return { stars, plates, variety, favourites, fed, speed, staff };
  }


  private reset() {
    this.money = BUDGET;
    this.stock.clear();
    this.grades.clear();
    this.crates.clear();
    this.crateFor = null;
    this.resetPlanters();
    this.fishing.castsLeft = 3;
    this.favours.clear();
    this.sellerStock.clear();
    this.known = new Set(STARTER_RECIPES);
    this.menu = [];
    this.picks = [];
    this.staff = STAFF_OPTIONS[0];
    this.owned.clear();
    this.spent = this.earned = this.served = this.missed = this.grumbles = this.favouritesServed = 0;
    this.regularsTonight.clear();
    this.rating = null;
    this.tickets = [];
    this.waiters = [];
    this.hands = null;
    this.port = 'Marseille';
    this.day = 1;
    this.clock = MARKET_OPEN;
    this.reminded.clear();
    for (const s of this.stations) Object.assign(s, { items: [], grades: [], recipe: null, t: 0, result: null, resultQ: 2, doneT: 0 });
    for (const p of this.pass) Object.assign(p, { dish: null, q: 2, claimed: false });
    for (const k of this.counters) Object.assign(k, { item: null, q: 2 });
    this.phase = 'port';
    this.enterMap(MARKET, 13.5, 10.5, 'up');
  }

  // ------------------------------------------------------------ update

  update(dt: number, ix: number, iy: number) {
    this.time += dt;
    this.roomBanner = Math.max(0, this.roomBanner - dt);
    for (const f of this.floaters) {
      f.t -= dt;
      f.y -= dt * 0.4;
    }
    this.floaters = this.floaters.filter((f) => f.t > 0);
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    this.updateNpcs(dt);
    if (this.modal?.kind === 'fish' && this.fishing.result === null) this.fishing.t += dt;
    if (this.warp) return this.updateWarp(dt);
    if (!this.roaming) return;

    const rate = MINUTES_PER_SECOND[this.phase] ?? 0;
    this.clock += dt * rate;
    if (this.phase === 'port') {
      this.remind(18 * 60, `The ship sails overnight. Tomorrow at sea you cook for ${GUESTS_TONIGHT} guests, so shop today.`);
      this.remind(LIGHTS_OUT - 60, 'An hour to midnight. Your bunk is in the cabin.');
      if (this.clock >= LIGHTS_OUT && !this.warp) this.sleep(true);
    } else if (this.phase === 'evening') {
      this.remind(LIGHTS_OUT - 30, 'Half an hour to midnight. Time for bed, chef.');
      if (this.clock >= LIGHTS_OUT && !this.warp) this.sleep(true);
    } else if (this.phase === 'aboard') {
      this.remind(PREP_START - 30, 'Half an hour until kitchen prep at 3.');
      if (this.clock >= PREP_START && !this.warp) this.startPrep();
    } else if (this.phase === 'prep') {
      this.remind(SERVICE_START - 30, 'Half an hour until the dining room opens.');
      if (this.clock >= SERVICE_START && !this.warp) this.openService();
    }

    if (!this.modal) this.moveChef(dt, ix, iy);
    else this.moving = false;
    this.target = this.modal ? null : this.findTarget();

    if (this.phase === 'service') {
      this.updateStations(dt);
      this.updateTickets(dt);
      this.updateWaiters(dt);
      // the doors close at 11 but the last tables still get their food
      const waiting = this.tickets.some((t) => t.state === 'open' || t.state === 'pending' || t.state === 'taken');
      const allSeated = this.tickets.length >= GUESTS_TONIGHT || this.clock >= LAST_SEATING;
      if ((allSeated && !waiting) || this.clock >= SERVICE_END + 45) this.endService();
      else if (this.closingIn > 0) {
        this.closingIn -= dt;
        if (this.closingIn <= 0) this.endService();
      }
    }
  }

  private updateWarp(dt: number) {
    const w = this.warp!;
    w.t += dt;
    this.moving = false;
    if (!w.swapped && w.t >= 0.25) {
      w.swapped = true;
      this.enterMap(MAPS[w.door.to as MapId], w.door.sx, w.door.sy, w.door.dir);
    }
    if (w.t >= 0.5) this.warp = null;
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
    const px = this.x;
    const py = this.y;
    if (!this.blocked(this.x + wx * speed, this.y, r) && !this.bumpsNpc(this.x + wx * speed, this.y)) this.x += wx * speed;
    if (!this.blocked(this.x, this.y + wy * speed, r) && !this.bumpsNpc(this.x, this.y + wy * speed)) this.y += wy * speed;
    this.anim += dt;
    const door = doorAt(this.map, Math.floor(this.x), Math.floor(this.y));
    if (door && !this.useDoor(door)) {
      this.x = px;
      this.y = py;
    }
  }

  private bumpsNpc(x: number, y: number) {
    return this.npcs.some((n) => Math.hypot(n.x - x, n.y - y) < 0.55 && Math.hypot(n.x - this.x, n.y - this.y) >= Math.hypot(n.x - x, n.y - y));
  }

  private updateNpcs(dt: number) {
    const talking = this.modal?.kind === 'talk' ? this.modal.speaker : null;
    for (const n of this.npcs) {
      if (talking === n.def.name) {
        n.moving = false;
        continue;
      }
      if (!n.def.stroll) continue;
      if (n.wait > 0) {
        n.wait -= dt;
        n.moving = false;
        if (n.wait <= 0) {
          n.tx = n.x + (rand() - 0.5) * 8;
          n.ty = n.y + (rand() - 0.5) * 6;
        }
        continue;
      }
      const dx = n.tx - n.x;
      const dy = n.ty - n.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.1) {
        n.wait = 1 + rand() * 4;
        continue;
      }
      const sp = Math.min(d, 1.2 * dt);
      const nx = n.x + (dx / d) * sp;
      const ny = n.y + (dy / d) * sp;
      const tile = charAt(this.map, Math.floor(nx), Math.floor(ny));
      if (this.blocked(nx, ny, 0.3) || tile !== this.map.strollOn || Math.hypot(nx - this.x, ny - this.y) < 0.7) {
        n.wait = 0.5 + rand();
        continue;
      }
      n.x = nx;
      n.y = ny;
      n.moving = true;
      n.anim += dt;
      n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
  }

  private updateStations(dt: number) {
    for (const s of this.stations) {
      if (s.recipe) {
        s.t += dt;
        if (s.t >= s.dur) {
          s.result = s.recipe.id;
          // slop is slop; everything else is as good as what went in
          s.resultQ = s.recipe.id === SLOP.id ? 1 : Math.round(s.grades.reduce((a, b) => a + b, 0) / Math.max(1, s.grades.length));
          s.recipe = null;
          s.items = [];
          s.grades = [];
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

  // ------------------------------------------------------------ tickets and waiters

  /** Menu dishes that can still be cooked once every outstanding ticket is accounted for. */
  orderable(): Recipe[] {
    const left = new Map(this.stock);
    const give = (id: string) => left.set(id, (left.get(id) ?? 0) + 1);
    const givePrep = (id: string, n = 1) => {
      for (let k = 0; k < n; k++) for (const inp of prepOf(id)!.inputs) give(inp);
    };
    for (const [id, n] of this.stock) if (isPrep(id)) givePrep(id, n);
    if (this.hands && ingredient(this.hands)) give(this.hands);
    if (this.hands && isPrep(this.hands)) givePrep(this.hands);
    const ready: string[] = [];
    if (this.hands && recipe(this.hands)) ready.push(this.hands);
    for (const s of this.stations) {
      s.items.forEach(give);
      if (s.recipe) ready.push(s.recipe.id);
      if (s.result && s.result !== BURNT) ready.push(s.result);
    }
    for (const p of this.pass) if (p.dish && !p.claimed) ready.push(p.dish);
    for (const t of this.tickets) {
      if (t.state !== 'open' && t.state !== 'pending') continue;
      const i = ready.indexOf(t.dish);
      if (i >= 0) {
        ready.splice(i, 1);
        continue;
      }
      for (const id of recipe(t.dish)?.inputs ?? []) left.set(id, (left.get(id) ?? 0) - 1);
    }
    for (const id of ready) for (const inp of recipe(id)?.inputs ?? []) give(inp);
    return this.menu.map((id) => recipe(id)!).filter((r) => r.inputs.every((id) => (left.get(id) ?? 0) > 0));
  }

  /** Anything cooking, plated or in hand that could still go out. */
  private kitchenHasFood() {
    if (this.hands && this.hands !== BURNT) return true;
    if (this.pass.some((p) => p.dish)) return true;
    return this.stations.some((s) => s.recipe || s.items.length || (s.result && s.result !== BURNT));
  }

  private updateTickets(dt: number) {
    this.spawnIn -= dt;
    const open = this.tickets.filter((t) => t.state === 'open' || t.state === 'pending').length;
    if (this.spawnIn <= 0 && this.tickets.length < GUESTS_TONIGHT && this.clock < LAST_SEATING && this.closingIn < 0) {
      const options = this.orderable();
      const anything = this.basketCount() > 0 || this.pass.some((p) => p.dish && !p.claimed);
      if (open < MAX_TICKETS && (options.length || anything)) {
        // with nothing left on the menu, guests settle for whatever the kitchen has
        let dish = options.length ? pick(options).id : SLOP.id;
        // regulars come in early in the evening and ask for their favourite when they can
        const regular = REGULARS.find((r) => !this.regularsTonight.has(r.name));
        let guest: string | undefined;
        if (regular && options.length && rand() < 0.5) {
          guest = regular.name;
          this.regularsTonight.add(guest);
          if (options.some((o) => o.id === regular.dish)) dish = regular.dish;
        }
        this.tickets.push({ id: this.nextTicket++, dish, table: 1 + Math.floor(rand() * 12), patience: 90, max: 90, state: 'pending', guest });
      } else if (!options.length && !anything && !this.kitchenHasFood()) {
        this.toast('The pantry is bare. Henri sends the last tables home with dessert on the house.');
        this.closingIn = 3;
      }
      this.spawnIn = 7 + rand() * 6;
    }
    for (const t of this.tickets) {
      if (t.state !== 'open') continue;
      // guests never walk out; waiting only shrinks the tip
      t.patience = Math.max(0, t.patience - dt);
    }
    // send a waiter for every plate on the pass that answers a ticket
    for (const slot of this.pass) {
      if (!slot.dish || slot.claimed) continue;
      const opens = this.tickets.filter((t) => t.state === 'open');
      const ticket = opens.find((t) => t.dish === slot.dish) ?? (slot.dish === SLOP.id ? opens[0] : undefined);
      if (!ticket) continue;
      const w = this.waiters.find((x) => !x.task);
      if (!w) break;
      ticket.state = 'taken';
      ticket.freshness = ticket.patience / ticket.max;
      slot.claimed = true;
      this.assign(w, { kind: 'pickup', slot, ticket });
    }
    // and one to carry each new order in
    for (const t of this.tickets) {
      if (t.state !== 'pending' || this.waiters.some((w) => w.task?.ticket === t)) continue;
      const w = this.waiters.find((x) => !x.task);
      if (!w) break;
      this.assign(w, { kind: 'drop', ticket: t });
    }
  }

  private assign(w: Waiter, task: NonNullable<Waiter['task']>) {
    w.task = task;
    w.stage = 'going';
  }

  private updateWaiters(dt: number) {
    const speed = this.staff.speed * dt;
    for (const w of this.waiters) {
      if (!w.task || w.stage === 'off') continue;
      const goal = w.stage === 'going' ? (w.task.kind === 'pickup' ? w.task.slot.tx + 0.5 : 9 + (w.homeX > 9 ? 0.6 : -0.6)) : w.homeX;
      const goalY = w.stage === 'going' ? PASS_Y : STRIP_Y[w.homeX > 9 ? 1 : 0];
      const dx = goal - w.x;
      const dy = goalY - w.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.05) {
        const s = Math.min(d, speed);
        w.x += (dx / d) * s;
        w.y += (dy / d) * s;
        w.moving = true;
        w.anim += dt;
        w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        continue;
      }
      w.moving = false;
      if (w.stage === 'going') {
        w.dir = 'down';
        if (w.task.kind === 'drop') {
          w.task.ticket.state = 'open';
          this.toast(`${w.name}: "Table ${w.task.ticket.table}, one ${nameOf(w.task.ticket.dish)}!"`);
          sfx('bell');
        } else {
          w.carrying = w.task.slot.dish;
          w.carryingQ = w.task.slot.q;
          w.task.slot.dish = null;
          w.task.slot.claimed = false;
          sfx('pick');
        }
        w.stage = 'back';
      } else {
        if (w.task.kind === 'pickup') this.deliver(w.task.ticket, w.carrying!, w.carryingQ);
        w.carrying = null;
        w.task = null;
        w.stage = 'off';
      }
    }
  }

  /** Price and rating multiplier from the machine that cooks this dish. */
  quality(dish: string) {
    const r = recipe(dish);
    return r ? machineLevel(r.at, this.owned).quality : 1;
  }

  private startCooking(s: Station, r: Recipe) {
    s.recipe = r;
    s.t = 0;
    s.dur = r.time / machineLevel(s.kind, this.owned).speed;
  }

  private deliver(t: Ticket, dish: string, q: number) {
    t.state = 'done';
    t.served = dish;
    t.quality = q;
    this.served++;
    const at = { x: 9, y: 2.2 };
    if (dish === SLOP.id) {
      this.grumbles++;
      this.money += SLOP.price;
      this.earned += SLOP.price;
      this.float(at.x, at.y, `+${SLOP.price}g  (ugh)`, '#c9b58a');
      sfx('nope');
      return;
    }
    const r = recipe(dish)!;
    const favourite = !!t.guest && REGULARS.find((g) => g.name === t.guest)?.dish === dish;
    let pay = Math.round(r.price * this.quality(dish) * this.plateFactor(q)) + Math.round(r.price * 0.5 * (t.freshness ?? 0));
    if (favourite) {
      pay += Math.round(r.price * 0.5);
      this.favouritesServed++;
      this.toast(`${t.guest} got their favourite ${r.name.toLowerCase()}. They are delighted!`);
    }
    this.money += pay;
    this.earned += pay;
    this.float(at.x, at.y, favourite ? `+${pay}g  favourite!` : q >= 3 ? `+${pay}g  prime!` : `+${pay}g`, favourite ? '#ff9ec7' : q >= 3 ? '#9cf0ff' : '#ffe066');
    sfx('coin');
  }

  // ------------------------------------------------------------ targeting

  private findTarget(): Target | null {
    const px = this.x + this.faceX * 0.75;
    const py = this.y + this.faceY * 0.75;
    let best: Target | null = null;
    let bestD = 0.95;
    const consider = (t: Target, cx = t.tx + 0.5, cy = t.ty + 0.5) => {
      const d = Math.hypot(cx - px, cy - py);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    };
    for (const npc of this.npcs) consider({ kind: 'npc', tx: Math.floor(npc.x), ty: Math.floor(npc.y), npc }, npc.x, npc.y - 0.2);
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
        if (c === 'g') {
          if (this.phase === 'port') consider({ kind: 'ashore', tx, ty });
          else consider({ kind: 'locked', tx, ty, text: `The gangway is up. Next stop: ${NEXT_PORT.name}.` });
        }
        if (this.map === CABIN && (c === 'K' || c === 'b')) consider({ kind: 'bed', tx, ty });
        if (this.map === CABIN && c === 'j') consider({ kind: 'catalog', tx, ty });
        if (this.map === LIDO && c === '!') consider({ kind: 'rod', tx, ty });
        if (this.map === LIDO && c === '%') consider({ kind: 'planter', tx, ty, planter: this.planters.find((p) => p.tx === tx && p.ty === ty)! });
        if (this.map !== GALLEY) continue;
        if (PANTRY_CHARS.has(c)) consider({ kind: 'pantry', tx, ty });
        else if (c === 'W') consider({ kind: 'board', tx, ty });
        else if (c === 'B') consider({ kind: 'bin', tx, ty });
        else if (c === 'X') consider({ kind: 'pass', tx, ty, slot: this.pass.find((p) => p.tx === tx)! });
        else if (c === 'e') consider({ kind: 'counter', tx, ty, counter: this.counters.find((k) => k.tx === tx && k.ty === ty)! });
        else if (c === 'S' || c === 'C' || c === 'z' || c === 'v') {
          consider({ kind: 'station', tx, ty, station: this.stations.find((s) => s.tx === tx && s.ty === ty)! });
        }
      }
    }
    return best;
  }

  /** Label for the interaction prompt. */
  promptFor(t: Target): string {
    const held = this.hands ? nameOf(this.hands).toLowerCase() : '';
    const service = this.phase === 'service';
    switch (t.kind) {
      case 'npc':
        return `Talk to ${t.npc.def.name}`;
      case 'stall':
        return `Shop at the ${STALLS[t.stall].name}`;
      case 'gangway':
        return 'Board the Butter Moon';
      case 'ashore':
        return 'Go ashore';
      case 'bed':
        return this.phase === 'port' || this.phase === 'evening' ? 'Go to bed (ends the day)' : 'Your bunk';
      case 'locked':
        return 'Gangway';
      case 'board':
        return service ? "Tonight's menu" : "Plan tonight's menu";
      case 'catalog':
        return "Ship chandler's catalog";
      case 'rod':
        return this.fishing.castsLeft ? `Fish off the rail (${this.fishing.castsLeft} casts left)` : 'Rod stand';
      case 'planter': {
        const p = t.planter;
        if (this.ripe(p)) return `Harvest ${nameOf(p.crop).toLowerCase()}`;
        if (p.harvestedDay === this.day) return 'Harvested today';
        if (p.wateredDay === this.day) return `${nameOf(p.crop)} ripening in the sun`;
        return `Water the ${nameOf(p.crop).toLowerCase()}`;
      }
      case 'pantry':
        if (!service) return 'Pantry';
        if (this.hands && (ingredient(this.hands) || isPrep(this.hands))) return `Put back ${held}`;
        return this.hands ? 'Hands full' : 'Open the pantry';
      case 'bin':
        return this.hands ? `Toss ${held}` : 'Bin';
      case 'counter': {
        const k = t.counter;
        if (k.item) return this.hands ? 'Counter is taken' : `Pick up ${nameOf(k.item).toLowerCase()}`;
        return this.hands ? `Set down ${held}` : 'Counter';
      }
      case 'pass':
        if (t.slot.dish) return t.slot.claimed ? 'A waiter is on the way' : this.hands ? 'Pass is taken' : `Take back ${nameOf(t.slot.dish).toLowerCase()}`;
        return this.hands && recipe(this.hands) ? `Send out ${held}` : 'Pass window';
      case 'station': {
        const s = t.station;
        if (s.kind === 'oven' && !this.owned.has('oven')) return 'Empty machine slot';
        const name = s.kind === 'stove' ? 'stove' : s.kind === 'board' ? 'board' : s.kind === 'oven' ? 'oven' : 'slop pot';
        if (!service) return s.kind === 'stove' ? 'Stove' : s.kind === 'board' ? 'Prep for tonight (mise en place)' : s.kind === 'oven' ? 'Oven' : 'Slop pot';
        if (s.result) return this.hands ? 'Hands full' : `Take ${nameOf(s.result).toLowerCase()}`;
        if (s.recipe) return s.kind === 'board' ? 'Chopping...' : 'Cooking...';
        if (this.hands) return `Put in the ${name}`.replace('in the stove', 'on the stove').replace('in the board', 'on the board');
        if (s.items.length) return `Take back ${nameOf(s.items[s.items.length - 1]).toLowerCase()}`;
        return name[0].toUpperCase() + name.slice(1);
      }
    }
  }

  // ------------------------------------------------------------ input

  interact() {
    if (this.modal) return this.modalSelect();
    switch (this.phase) {
      case 'title':
        this.phase = 'port';
        this.toast(`Day 1 in Marseille. Explore the port, the city and the ship. Tomorrow's dinner at sea: ${GUESTS_TONIGHT} guests.`);
        sfx('start');
        return;
      case 'summary':
        this.phase = 'evening';
        this.toast('Service is over. The night is yours; your bunk is in the cabin. The day ends at midnight.');
        sfx('bell');
        return;
      case 'arrival':
        this.reset();
        return;
    }
    const t = this.target;
    if (!t || this.warp) return;
    switch (t.kind) {
      case 'npc':
        return this.talk(t.npc);
      case 'stall':
        return this.openStall(t.stall);
      case 'gangway':
        return this.board();
      case 'ashore':
        return this.goAshore();
      case 'bed':
        if (this.phase === 'port' || this.phase === 'evening') return this.openBed();
        return this.toast('No napping today, chef. Dinner is at six.');
      case 'locked':
        return this.toast(t.text);
      case 'board':
        return this.free || this.phase === 'prep' ? this.openWorkbench() : this.openMenuCard();
      case 'catalog':
        return this.openCatalog();
      case 'rod':
        return this.openFishing();
      case 'planter':
        return this.tendPlanter(t.planter);
      case 'pantry':
        if (this.phase !== 'service') return this.toast('The pantry opens when dinner service starts.');
        if (this.hands && (ingredient(this.hands) || isPrep(this.hands))) {
          this.add(this.hands, 1, this.handsQ);
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
      case 'pass':
        return this.usePass(t.slot);
      case 'counter':
        return this.useCounter(t.counter);
      case 'station':
        if (t.station.kind === 'oven' && !this.owned.has('oven')) return this.toast('An oven would fit here. Order one from the catalog in your cabin.');
        if ((this.free || this.phase === 'prep') && t.station.kind === 'board') return this.openPrep();
        if (this.phase !== 'service') return this.toast('The stoves are lit at 6. Prep at the cutting board in the meantime.');
        return this.useStation(t.station);
    }
  }

  private useCounter(k: Counter) {
    if (k.item && !this.hands) {
      this.hands = k.item;
      this.handsQ = k.q;
      k.item = null;
      sfx('pick');
    } else if (!k.item && this.hands) {
      k.item = this.hands;
      k.q = this.handsQ;
      this.hands = null;
      sfx('place');
    } else if (k.item) this.toast('Your hands are full.');
  }

  cancel() {
    if (this.modal?.kind === 'shop' && this.crateFor) return this.closeCrate();
    if (this.modal) {
      this.modal = null;
      sfx('toss');
    }
  }

  openRecipeBook() {
    if (!this.roaming) return;
    if (this.modal) return this.cancel();
    this.modal = {
      kind: 'list',
      title: 'Recipe book',
      subtitle: () => `${this.known.size} of ${RECIPES.length} recipes discovered. Try combinations at the galley chalkboard.`,
      index: 0,
      rows: () => [
        { label: `${SLOP.name}  ${SLOP.price}g`, detail: 'any one ingredient, slop pot', icon: SLOP.id, enabled: true },
        ...(this.known.size
          ? [...this.known].map((id) => {
            const r = recipe(id)!;
            return { label: `${r.name}  ${r.price}g`, detail: `${r.inputs.map(nameOf).join(' + ')}  (${r.at})`, icon: id, enabled: true };
          })
          : [{ label: 'No recipes yet. Combine ingredients during menu planning.', heading: true }]),
        { label: 'Close', enabled: true, action: () => this.cancel() },
      ],
    };
  }

  moveSelection(d: number) {
    const m = this.modal;
    if (!m) return;
    const rows = m.rows();
    if (rows.length < 2) return;
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

  // ------------------------------------------------------------ talking

  private talk(npc: Npc) {
    if (npc.def.seller) return this.openSeller(npc, SECRET_SELLERS[npc.def.seller]);
    const lines = npc.def.lines;
    let page = 0;
    const dx = this.x - npc.x;
    const dy = this.y - npc.y;
    npc.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    const isHenri = npc.def.name === 'Henri' && this.free;
    const teach = npc.def.teaches && !this.known.has(npc.def.teaches) ? npc.def.teaches : null;
    this.modal = {
      kind: 'talk',
      title: npc.def.name,
      speaker: npc.def.name,
      look: npc.def.look,
      subtitle: () => '',
      line: () => lines[page],
      index: 0,
      rows: () => [{
        label: page < lines.length - 1 ? 'Next' : isHenri ? 'Talk about tonight\'s crew' : teach ? `Learn ${nameOf(teach)}` : 'Goodbye',
        enabled: true,
        action: () => {
          if (page < lines.length - 1) {
            page++;
            sfx('pick');
          } else if (isHenri) this.openStaff(npc);
          else if (teach) {
            this.known.add(teach);
            this.cancel();
            this.toast(`${npc.def.name} taught you ${nameOf(teach)}. It's in your recipe book.`);
            sfx('coin');
          } else this.cancel();
        },
      }],
    };
    sfx('pick');
  }

  private openStaff(npc: Npc) {
    let said = `Tonight you have ${this.staff.label}. Choose who works the floor; it shows in the guests' reviews.`;
    this.modal = {
      kind: 'talk',
      title: 'Hire tonight\'s waiters',
      speaker: npc.def.name,
      look: npc.def.look,
      subtitle: () => '',
      line: () => said,
      index: 0,
      rows: () => [
        ...STAFF_OPTIONS.map((o) => ({
          label: `${o.label}  ${o.cost ? `${o.cost}g` : 'free'}`,
          detail: `skill ${o.skill}/5  ${o.blurb}`,
          checked: this.staff === o,
          enabled: this.staff === o || this.money + this.staff.cost >= o.cost,
          action: () => {
            if (this.staff === o) return;
            this.money += this.staff.cost - o.cost;
            this.spent += o.cost - this.staff.cost;
            this.staff = o;
            said = `${o.label} it is. ${o.blurb}`;
            sfx('coin');
          },
        })),
        { label: 'Done', enabled: true, action: () => this.cancel() },
      ],
    };
  }

  // ------------------------------------------------------------ market

  private openStall(id: StallId) {
    const stall = STALLS[id];
    this.shopLine = stall.greeting;
    this.crateFor = null;
    const m: Modal = {
      kind: 'shop',
      title: stall.name,
      speaker: stall.merchant,
      look: MERCHANT_LOOKS[id],
      line: () => this.shopLine,
      subtitle: () => `Purse ${this.money}g   Basket ${this.basketCount()}/${BASKET_SIZE}`,
      index: 0,
      rows: () => (this.crateFor ? this.crateRows(this.crateFor) : this.stallRows(id)),
    };
    this.modal = m;
  }

  /** A hidden seller: everything prime, market price, small stock. Some want a favour first. */
  private openSeller(npc: Npc, seller: SecretSeller) {
    const dx = this.x - npc.x;
    const dy = this.y - npc.y;
    npc.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    if (seller.favour && !this.favours.has(seller.id)) {
      const f = seller.favour;
      this.modal = {
        kind: 'talk',
        title: npc.def.name,
        speaker: npc.def.name,
        look: npc.def.look,
        subtitle: () => '',
        line: () => f.ask,
        index: 0,
        rows: () => [
          this.count(f.item)
            ? { label: `Give ${npc.def.name} a ${nameOf(f.item).toLowerCase()}`, enabled: true, action: () => {
              this.add(f.item, -1);
              this.favours.add(seller.id);
              sfx('ding');
              this.openSeller(npc, seller);
              this.shopLine = f.thanks;
            } }
            : { label: `You have no ${nameOf(f.item).toLowerCase()} yet`, enabled: false },
          { label: "I'll be back", enabled: true, action: () => this.cancel() },
        ],
      };
      sfx('pick');
      return;
    }
    this.shopLine = seller.greeting;
    this.crateFor = null;
    const left = (id: string) => this.sellerStock.get(`${seller.id}:${id}`) ?? seller.items.find((i) => i.id === id)!.stock;
    this.modal = {
      kind: 'shop',
      title: seller.name,
      speaker: seller.merchant,
      look: npc.def.look,
      line: () => this.shopLine,
      subtitle: () => `Purse ${this.money}g   Basket ${this.basketCount()}/${BASKET_SIZE}`,
      index: 0,
      rows: () => [
        ...seller.items.map(({ id }) => {
          const ing = ingredient(id)!;
          const n = left(id);
          return {
            label: `${ing.name}  ${ing.price}g  prime`,
            detail: n ? `${n} left` : 'sold out',
            icon: id,
            grade: 3,
            enabled: n > 0,
            action: () => {
              if (this.basketCount() >= BASKET_SIZE) {
                this.shopLine = 'Your basket is full, chef.';
                return sfx('nope');
              }
              if (this.money < ing.price) {
                this.shopLine = `That one is ${ing.price}g. Come back when your purse is heavier.`;
                return sfx('nope');
              }
              this.money -= ing.price;
              this.spent += ing.price;
              this.add(id, 1, 3);
              this.sellerStock.set(`${seller.id}:${id}`, n - 1);
              this.shopLine = pick(['The best you will find in Marseille.', 'Treat it well, chef.', 'Merci. Not a word to the stallholders, eh?']);
              sfx('coin');
            },
          };
        }),
        { label: 'Say goodbye', enabled: true, action: () => this.cancel() },
      ],
    };
    sfx('pick');
  }

  private stallRows(id: StallId): MenuRow[] {
    const rows: MenuRow[] = INGREDIENTS.filter((i) => i.stall === id).map((ing) => ({
      label: `${ing.name}  ${ing.price}g`,
      detail: this.count(ing.id) ? `x${this.count(ing.id)}` : undefined,
      icon: ing.id,
      enabled: true,
      action: () => {
        this.crateFor = ing.id;
        this.modal!.index = 1;
        this.shopLine = pick(['Take your pick from the crate, same price for any of them.', 'Have a look and choose, chef. They are all the same price.', 'Go on, pick the one you like.']);
        sfx('pick');
      },
    }));
    const inBasket = INGREDIENTS.filter((i) => i.stall === id && this.count(i.id));
    if (inBasket.length) {
      rows.push({ label: 'Hand back', heading: true });
      for (const ing of inBasket) {
        rows.push({
          label: `${ing.name}  +${ing.price}g`,
          icon: ing.id,
          enabled: true,
          action: () => {
            this.money += ing.price;
            this.spent -= ing.price;
            this.add(ing.id, -1);
            this.shopLine = 'No trouble, I\'ll put it back.';
            sfx('toss');
          },
        });
      }
    }
    rows.push({ label: 'Leave the stall', enabled: true, action: () => this.cancel() });
    return rows;
  }

  /** The crate for one ingredient: same price, mixed quality. Reading the cues is the skill. */
  private crateRows(id: string): MenuRow[] {
    const ing = ingredient(id)!;
    const crate = this.crate(id);
    const rows: MenuRow[] = [{ label: `${ing.name} crate, ${ing.price}g each`, heading: true }];
    crate.forEach((grade, slot) => {
      rows.push({
        label: cueFor(id, grade, slot + this.crateSeed(id)),
        icon: id,
        grade,
        enabled: true,
        action: () => {
          if (this.basketCount() >= BASKET_SIZE) {
            this.shopLine = 'Your basket is overflowing, chef! Hand something back first.';
            return sfx('nope');
          }
          if (this.money < ing.price) {
            this.shopLine = `${ing.name} is ${ing.price}g, and you have ${this.money}g. Maybe something cheaper?`;
            return sfx('nope');
          }
          this.money -= ing.price;
          this.spent += ing.price;
          this.add(id, 1, grade);
          crate[slot] = rollGrade();
          this.shopLine = grade >= 3
            ? pick(['Ooh, you have a good eye. That was the best of the lot.', 'The pick of the crate! You know your stuff.'])
            : grade <= 1
              ? pick([`That one? Well, it's your ${ing.name.toLowerCase()}.`, 'Hmm, I would have chosen another, but merci!'])
              : pick([`One ${ing.name.toLowerCase()}, merci! Anything else?`, `${ing.name}, wrapped and ready.`]);
          sfx(grade >= 3 ? 'ding' : 'coin');
        },
      });
    });
    rows.push({ label: 'Back to the stall', enabled: true, action: () => this.closeCrate() });
    return rows;
  }

  private crateSeed(id: string) {
    return id.length + (this.crates.get(id)?.reduce((a, b) => a + b, 0) ?? 0);
  }

  private closeCrate() {
    this.crateFor = null;
    if (this.modal) this.modal.index = 0;
    this.shopLine = 'Anything else?';
    sfx('pick');
  }

  private openBed() {
    this.modal = {
      kind: 'list',
      title: 'Turn in for the night?',
      subtitle: () => this.phase === 'evening'
        ? `The ship docks in ${NEXT_PORT.name} in the morning.`
        : `The ship sails overnight; you can't come back ashore. Tomorrow at sea: dinner for ${GUESTS_TONIGHT} guests. Basket ${this.basketCount()}/${BASKET_SIZE}.`,
      index: 0,
      rows: () => [
        { label: 'Not yet', enabled: true, action: () => this.cancel() },
        { label: 'Sleep until morning', detail: this.phase === 'port' && !this.basketCount() ? 'Your basket is empty!' : undefined, enabled: true, action: () => this.sleep() },
      ],
    };
  }

  // ------------------------------------------------------------ menu planning

  private openWorkbench() {
    this.modal = {
      kind: 'list',
      title: "Tonight's dinner menu",
      subtitle: () => `Tick 2 or 3 ingredients and taste them. Discoveries go in your recipe book. Menu ${this.menu.length}/${MENU_SIZE}.`,
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
        if (rows.length === 1) rows.push({ label: 'Nothing in the pantry. Slop it is.', heading: true });
        rows.push({
          label: this.picks.length ? `Taste: ${this.picks.map(nameOf).join(' + ')}` : 'Taste the combination',
          enabled: this.picks.length >= 2,
          action: () => this.taste(),
        });
        rows.push({ label: 'On the menu (slop is always available)', heading: true });
        if (!this.known.size) rows.push({ label: 'No dishes discovered yet.', heading: true });
        for (const id of this.known) {
          const r = recipe(id)!;
          const on = this.menu.includes(id);
          rows.push({
            label: `${r.name}  ${r.price}g`,
            detail: this.canCook(r) ? `${r.inputs.map(nameOf).join(' + ')}  (${r.at})` : 'needs an oven',
            icon: id,
            checked: on,
            enabled: on || (this.menu.length < MENU_SIZE && this.canCook(r)),
            action: () => {
              if (on) this.menu = this.menu.filter((m) => m !== id);
              else if (!this.canCook(r)) return this.toast(`${r.name} needs an oven. Order one from the catalog in your cabin.`);
              else this.menu.push(id);
              sfx('place');
            },
          });
        }
        if (this.phase !== 'port') rows.push({
          label: 'Start dinner service now',
          detail: this.menu.length ? this.menu.map(nameOf).join(', ') : 'Only slop tonight?',
          enabled: true,
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
      this.toast(`${r.name} is already in your recipe book.`);
    } else {
      this.known.add(r.id);
      this.toast(`New recipe: ${r.name}! Added to your recipe book.`);
      sfx('ding');
      if (this.menu.length < MENU_SIZE && this.canCook(r)) this.menu.push(r.id);
      else if (!this.canCook(r)) this.toast(`${r.name} needs an oven before it can go on the menu.`);
    }
    this.picks = [];
  }

  canCook(r: Recipe) {
    return r.at !== 'oven' || this.owned.has('oven');
  }

  // ------------------------------------------------------------ catch and grow your own

  /** Where the float sits on the bar right now, 0..1. */
  floatPos() {
    const f = this.fishing;
    return Math.min(1, Math.max(0, 0.5 + 0.42 * Math.sin(f.t * f.speed) + 0.06 * Math.sin(f.t * f.speed * 2.7 + 1)));
  }

  private cast() {
    const f = this.fishing;
    f.t = rand() * 6;
    f.speed = 1.6 + rand() * 1.4;
    f.zone = 0.2 + rand() * 0.6;
    f.result = null;
    this.clock = Math.min(17 * 60 + 55, this.clock + 20);
    sfx('toss');
  }

  private openFishing() {
    if (!this.free) return this.toast('No time for fishing now, chef.');
    const f = this.fishing;
    if (!f.castsLeft) return this.toast('The fish have stopped biting today. Try again tomorrow.');
    this.cast();
    this.modal = {
      kind: 'fish',
      title: 'Fishing off the lido',
      subtitle: () => (f.result === null
        ? 'Reel in while the float is over the gold for the best catch.'
        : f.result === 3 ? 'A beauty! Clear eyes, bright gills. Prime rockfish.'
          : f.result === 2 ? 'A decent rockfish. Into the ice box it goes.'
            : f.result === 1 ? 'A scrawny one, but it counts.'
              : 'It got away.'),
      index: 0,
      rows: () => (f.result === null
        ? [{ label: 'Reel in!', enabled: true, action: () => this.reel() }]
        : [
          f.castsLeft ? { label: `Cast again (${f.castsLeft} left)`, enabled: true, action: () => this.cast() } : { label: 'The fish have stopped biting', heading: true },
          { label: 'Put the rod away', enabled: true, action: () => this.cancel() },
        ]),
    };
  }

  private reel() {
    const f = this.fishing;
    const d = Math.abs(this.floatPos() - f.zone);
    f.result = d < 0.05 ? 3 : d < 0.12 ? 2 : d < 0.18 ? 1 : 0;
    f.castsLeft--;
    if (f.result) {
      this.add('fish', 1, f.result);
      sfx(f.result === 3 ? 'ding' : 'coin');
    } else sfx('nope');
    this.modal!.index = 0;
  }

  private tendPlanter(p: Planter) {
    if (!this.free) return this.toast('The garden can wait until tomorrow.');
    if (this.ripe(p)) {
      p.harvestedDay = this.day;
      this.add(p.crop, 1, 3);
      this.add(p.crop, 1, 3);
      this.toast(`Picked two prime ${nameOf(p.crop).toLowerCase()} for the pantry.`);
      sfx('ding');
      return;
    }
    if (p.harvestedDay === this.day) return this.toast('Already picked today. Water it again tomorrow.');
    if (p.wateredDay === this.day) return this.toast(`Give it about an hour in the sun.`);
    p.wateredDay = this.day;
    p.wateredAt = this.clock;
    this.toast(`Watered the ${nameOf(p.crop).toLowerCase()}. It will be ready in about an hour.`);
    sfx('place');
  }

  /** Mise en place: chop and portion a dish's ingredients in the afternoon so service is just cooking and plating. */
  private openPrep() {
    this.modal = {
      kind: 'list',
      title: 'Mise en place',
      subtitle: () => 'Prepare tonight\'s dishes ahead. A prep goes straight on its machine tonight and cooks faster. Each takes 15 minutes.',
      index: 0,
      rows: () => {
        const rows: MenuRow[] = [];
        if (!this.menu.length) rows.push({ label: 'Put dishes on the menu at the chalkboard first.', heading: true });
        for (const id of this.menu) {
          const r = recipe(id)!;
          const have = r.inputs.every((inp) => this.count(inp) >= r.inputs.filter((x) => x === inp).length);
          const ready = this.count(PREP + id);
          rows.push({
            label: `Prep ${r.name}`,
            detail: have ? `${r.inputs.map(nameOf).join(' + ')}${ready ? `  (${ready} ready)` : ''}` : `missing ingredients${ready ? `  (${ready} ready)` : ''}`,
            icon: PREP + id,
            enabled: have && this.clock < SERVICE_START - 15,
            action: () => {
              // the best of each ingredient goes into the prep
              const qs = r.inputs.map((inp) => this.add(inp, -1, (this.grades.get(inp) ?? [2])[0]));
              const q = Math.round(qs.reduce((a, b) => a + b, 0) / qs.length);
              this.add(PREP + id, 1, q);
              this.clock = Math.min(SERVICE_START - 1, this.clock + 15);
              sfx('place');
            },
          });
        }
        const ready = [...this.stock.keys()].filter(isPrep);
        if (ready.length) rows.push({ label: `Ready: ${ready.map((id) => `${this.count(id)} ${nameOf(id).replace(' prep', '').toLowerCase()}`).join(', ')}`, heading: true });
        rows.push({ label: 'Done for now', enabled: true, action: () => this.cancel() });
        return rows;
      },
    };
  }

  private openCatalog() {
    if (!this.free) return this.toast('The chandler only takes orders before prep.');
    this.modal = {
      kind: 'list',
      title: "Ship chandler's catalog",
      subtitle: () => `Machines are installed in the galley before dinner. Purse ${this.money}g.`,
      index: 0,
      rows: () => [
        ...UPGRADES.map((u) => {
          const has = this.owned.has(u.id);
          const blocked = u.needs && !this.owned.has(u.needs);
          return {
            label: has ? `${u.name}  installed` : `${u.name}  ${u.cost}g`,
            detail: blocked ? `needs the ${UPGRADES.find((x) => x.id === u.needs)!.name.toLowerCase()} first` : u.blurb,
            checked: has,
            enabled: !has && !blocked && this.money >= u.cost,
            action: () => {
              this.money -= u.cost;
              this.spent += u.cost;
              this.owned.add(u.id);
              this.toast(`${u.name} installed in the galley.`);
              sfx('coin');
            },
          };
        }),
        { label: 'Close the catalog', enabled: true, action: () => this.cancel() },
      ],
    };
  }

  private openMenuCard() {
    this.modal = {
      kind: 'list',
      title: "Tonight's menu",
      subtitle: () => 'Guests order from the menu while the pantry lasts. Slop answers any ticket, badly.',
      index: 0,
      rows: () => [
        ...[...this.menu, SLOP.id].map((id) => {
          const r = recipe(id)!;
          return { label: `${r.name}  ${r.price}g`, detail: id === SLOP.id ? 'any one ingredient (pot)' : `${r.inputs.map(nameOf).join(' + ')}  (${r.at})`, icon: id, enabled: true };
        }),
        { label: 'Back to work', enabled: true, action: () => this.cancel() },
      ],
    };
  }

  // ------------------------------------------------------------ service

  private openPantry() {
    this.modal = {
      kind: 'list',
      title: 'Pantry',
      subtitle: () => 'Take one ingredient at a time. Better ingredients make better plates.',
      index: 0,
      rows: () => {
        const rows: MenuRow[] = [];
        for (const id of [...this.stock.keys()].filter(isPrep)) {
          const grades = this.grades.get(id) ?? [];
          for (const g of [3, 2, 1]) {
            const n = grades.filter((x) => x === g).length;
            if (!n) continue;
            rows.push({
              label: `${nameOf(id)}  ${GRADE_NAMES[g]}`,
              detail: `x${n}`,
              icon: id,
              grade: g,
              enabled: true,
              action: () => {
                this.handsQ = this.add(id, -1, g);
                this.hands = id;
                this.modal = null;
                sfx('pick');
              },
            });
          }
        }
        for (const ing of INGREDIENTS) {
          const grades = this.grades.get(ing.id) ?? [];
          for (const g of [3, 2, 1]) {
            const n = grades.filter((x) => x === g).length;
            if (!n) continue;
            rows.push({
              label: `${ing.name}  ${GRADE_NAMES[g]}`,
              detail: `x${n}`,
              icon: ing.id,
              grade: g,
              enabled: true,
              action: () => {
                this.handsQ = this.add(ing.id, -1, g);
                this.hands = ing.id;
                this.modal = null;
                sfx('pick');
              },
            });
          }
        }
        if (!rows.length) rows.push({ label: 'The pantry is empty.', heading: true });
        rows.push({ label: 'Close', enabled: true, action: () => this.cancel() });
        return rows;
      },
    };
  }

  private usePass(slot: PassSlot) {
    if (this.phase !== 'service') return this.toast('The pass opens at 6 for dinner service.');
    if (slot.dish) {
      if (slot.claimed || this.hands) return;
      this.hands = slot.dish;
      this.handsQ = slot.q;
      slot.dish = null;
      sfx('pick');
      return;
    }
    if (!this.hands) return;
    if (this.hands === BURNT) return this.toast('Nobody is eating that. Bin it.');
    if (!recipe(this.hands)) return this.toast('Only finished plates go on the pass.');
    slot.dish = this.hands;
    slot.q = this.handsQ;
    this.hands = null;
    sfx('place');
  }

  private useStation(s: Station) {
    if (s.result) {
      if (this.hands) return this.toast('Your hands are full.');
      this.hands = s.result;
      this.handsQ = s.resultQ;
      s.result = null;
      sfx('pick');
      return;
    }
    if (s.recipe) return;
    if (!this.hands) {
      const back = s.items.pop();
      if (back) {
        this.hands = back;
        this.handsQ = s.grades.pop() ?? 2;
        sfx('pick');
      }
      return;
    }
    const prepped = prepOf(this.hands);
    if (prepped) {
      if (s.kind !== prepped.at) return this.toast(`That prep goes on the ${prepped.at}.`);
      if (s.items.length) return this.toast('Clear the station first.');
      s.items = [this.hands];
      s.grades = [this.handsQ];
      this.hands = null;
      this.startCooking(s, prepped);
      s.dur *= 0.6; // the chopping is already done
      sfx('place');
      return;
    }
    if (!ingredient(this.hands)) return this.toast('Plates go on the pass window. Burnt food goes in the bin.');
    if (s.kind === 'pot') {
      s.items = [this.hands];
      s.grades = [this.handsQ];
      this.hands = null;
      this.startCooking(s, SLOP);
      sfx('place');
      return;
    }
    const next = [...s.items, this.hands];
    const fits = this.menu.map((id) => recipe(id)!).filter((r) => r.at === s.kind && isSubset(next, r.inputs));
    if (!fits.length) {
      sfx('nope');
      return this.toast(next.length > 1 ? "That doesn't make anything on tonight's menu." : `Nothing on the menu starts with ${nameOf(this.hands).toLowerCase()} here. The slop pot takes anything.`);
    }
    s.items = next;
    s.grades.push(this.handsQ);
    this.hands = null;
    sfx('place');
    const exact = fits.find((r) => r.inputs.length === next.length);
    if (exact) this.startCooking(s, exact);
  }
}

function pick<T>(a: T[]): T {
  return a[Math.floor(rand() * a.length)];
}

const PASSENGER_LINES = [
  'What a view. I could sail forever.',
  'Is it true the new chef shops at the market himself? Herself? Themselves? Anyway, I hope so.',
  'I hear tonight is French night.',
  'Have you tried the pool? Freezing!',
  'My cabin has a porthole. I keep counting the waves.',
];
const LOCAL_LINES = [
  'The Vieux-Port has fed sailors for two thousand years.',
  'Haggle? At the poissonnerie? Never. Odette would throw a fish at you.',
  'You cook on that big ship? Make them something proper.',
  'The saffron at the epicerie is the real thing.',
];

export type { Look };
