// Content tables: what the Marseille market sells and what the chef can cook with it.

export interface Ingredient {
  id: string;
  name: string;
  price: number;
  stall: StallId;
}

export type StallId = 'fish' | 'produce' | 'epicerie' | 'dairy';

export interface Stall {
  id: StallId;
  name: string;
  merchant: string;
  /** what the merchant says when you walk up */
  greeting: string;
}

export const STALLS: Record<StallId, Stall> = {
  fish: { id: 'fish', name: 'Poissonnerie du Vieux-Port', merchant: 'Odette', greeting: 'Fresh off the morning boats, chef! Rockfish for the soup, mussels for the pot.' },
  produce: { id: 'produce', name: 'Primeur de Provence', merchant: 'Baptiste', greeting: 'Sun-ripened, picked yesterday. Smell that tomato!' },
  epicerie: { id: 'epicerie', name: 'Epicerie fine', merchant: 'Yasmina', greeting: 'Spices from every port, oil from my cousin\'s grove. The saffron is worth every coin.' },
  dairy: { id: 'dairy', name: 'Fromagerie & boulangerie', merchant: 'Jules', greeting: 'Still warm from the oven. Butter, eggs, cheese, the good baguette.' },
};

export const INGREDIENTS: Ingredient[] = [
  { id: 'fish', name: 'Rockfish', price: 8, stall: 'fish' },
  { id: 'mussels', name: 'Mussels', price: 6, stall: 'fish' },
  { id: 'tomato', name: 'Tomato', price: 2, stall: 'produce' },
  { id: 'onion', name: 'Onion', price: 1, stall: 'produce' },
  { id: 'garlic', name: 'Garlic', price: 1, stall: 'produce' },
  { id: 'potato', name: 'Potato', price: 1, stall: 'produce' },
  { id: 'courgette', name: 'Courgette', price: 2, stall: 'produce' },
  { id: 'lemon', name: 'Lemon', price: 2, stall: 'produce' },
  { id: 'saffron', name: 'Saffron', price: 9, stall: 'epicerie' },
  { id: 'herbs', name: 'Herbes de Provence', price: 2, stall: 'epicerie' },
  { id: 'oil', name: 'Olive oil', price: 4, stall: 'epicerie' },
  { id: 'flour', name: 'Flour', price: 1, stall: 'epicerie' },
  { id: 'butter', name: 'Butter', price: 3, stall: 'dairy' },
  { id: 'cheese', name: 'Comte cheese', price: 4, stall: 'dairy' },
  { id: 'eggs', name: 'Eggs', price: 2, stall: 'dairy' },
  { id: 'bread', name: 'Baguette', price: 2, stall: 'dairy' },
];

export type Machine = 'stove' | 'board' | 'oven' | 'pot';

export interface Recipe {
  id: string;
  name: string;
  inputs: string[];
  at: Machine;
  time: number;
  price: number;
  hint: string;
}

export const RECIPES: Recipe[] = [
  { id: 'bouillabaisse', name: 'Bouillabaisse', inputs: ['fish', 'tomato', 'saffron'], at: 'stove', time: 7, price: 40, hint: "Marseille's fish stew, golden with saffron and tomato." },
  { id: 'croissant', name: 'Croissant', inputs: ['flour', 'butter', 'eggs'], at: 'oven', time: 6, price: 16, hint: 'Flaky pastry: flour folded with plenty of butter, glazed with egg.' },
  { id: 'moules', name: 'Moules marinieres', inputs: ['mussels', 'garlic'], at: 'stove', time: 5, price: 24, hint: 'Mussels steamed open with a heap of garlic.' },
  { id: 'grilled', name: 'Poisson grille', inputs: ['fish', 'lemon'], at: 'stove', time: 5, price: 26, hint: 'Whole fish off the grill with a squeeze of lemon.' },
  { id: 'ratatouille', name: 'Ratatouille', inputs: ['tomato', 'courgette', 'herbs'], at: 'stove', time: 6, price: 22, hint: 'Provencal vegetables, tomato and courgette, stewed with herbs.' },
  { id: 'onionsoup', name: "Soupe a l'oignon", inputs: ['onion', 'bread', 'cheese'], at: 'stove', time: 6, price: 20, hint: 'Onion soup under a crust of bread and melted cheese.' },
  { id: 'gratin', name: 'Gratin dauphinois', inputs: ['potato', 'cheese'], at: 'oven', time: 6, price: 18, hint: 'Sliced potatoes baked bubbling under cheese.' },
  { id: 'omelette', name: 'Omelette aux herbes', inputs: ['eggs', 'herbs'], at: 'stove', time: 4, price: 14, hint: 'Soft folded eggs with fresh herbs.' },
  { id: 'tarte', name: 'Tarte au citron', inputs: ['lemon', 'flour', 'butter'], at: 'oven', time: 6, price: 20, hint: 'A buttery crust filled with sharp lemon curd.' },
  { id: 'salade', name: 'Salade provencale', inputs: ['tomato', 'onion', 'oil'], at: 'board', time: 3, price: 14, hint: 'Sliced tomato and onion dressed in olive oil.' },
  { id: 'aioli', name: 'Aioli toast', inputs: ['garlic', 'oil', 'bread'], at: 'board', time: 3, price: 12, hint: 'Garlic pounded into olive oil, spread on bread.' },
];

export const BURNT = 'burnt';

export interface Upgrade {
  id: string;
  name: string;
  cost: number;
  blurb: string;
  needs?: string;
}

/** Kitchen machines bought from the ship's chandler catalog in the chef's cabin. */
export const UPGRADES: Upgrade[] = [
  { id: 'oven', name: 'Bakery oven', cost: 40, blurb: 'Installs an oven. Unlocks croissant, gratin and tarte au citron.' },
  { id: 'copper', name: 'Copper stove tops', cost: 30, blurb: 'Stoves cook 30% faster and plates come out better.' },
  { id: 'knives', name: 'Japanese knives', cost: 15, blurb: 'Board work is 40% faster and cleaner.' },
  { id: 'convection', name: 'Convection fan', cost: 30, blurb: 'The oven bakes 30% faster and more evenly.', needs: 'oven' },
];

/** How much faster and better each machine works with the upgrades owned. */
export function machineLevel(m: Machine, owned: Set<string>): { speed: number; quality: number } {
  const up = m === 'stove' ? owned.has('copper') : m === 'board' ? owned.has('knives') : m === 'oven' ? owned.has('convection') : false;
  return up ? { speed: m === 'board' ? 1 / 0.6 : 1 / 0.7, quality: 1.2 } : { speed: 1, quality: 1 };
}

/** The fallback dish: any single ingredient in the slop pot. Always available, never loved. */
export const SLOP: Recipe = { id: 'slop', name: 'Mystery slop', inputs: [], at: 'pot', time: 3, price: 5, hint: 'Throw any one ingredient in the slop pot. Guests will eat it, unhappily.' };

export const BUDGET = 120;
export const BASKET_SIZE = 15;
export const MENU_SIZE = 3;

const NAMES = new Map<string, string>([
  ...INGREDIENTS.map((i) => [i.id, i.name] as [string, string]),
  ...RECIPES.map((r) => [r.id, r.name] as [string, string]),
  [BURNT, 'Burnt mess'],
  [SLOP.id, SLOP.name],
]);

export function nameOf(id: string): string {
  return NAMES.get(id) ?? id;
}

export function ingredient(id: string): Ingredient | undefined {
  return INGREDIENTS.find((i) => i.id === id);
}

export function recipe(id: string): Recipe | undefined {
  return id === SLOP.id ? SLOP : RECIPES.find((r) => r.id === id);
}

/** The recipe whose inputs are exactly this set of ingredients (order ignored). */
export function matchRecipe(items: string[]): Recipe | undefined {
  const key = [...items].sort().join('+');
  return RECIPES.find((r) => [...r.inputs].sort().join('+') === key);
}

export function isSubset(a: string[], b: string[]): boolean {
  const pool = [...b];
  for (const x of a) {
    const i = pool.indexOf(x);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

export const NEXT_PORT = { name: 'Naples', dish: 'Pizza napoletana', greeting: 'Buongiorno!' };

// ------------------------------------------------------------ quality

/** Ingredient and plate quality grades. Better ones come from skill and effort, never from paying more. */
export const GRADE_NAMES = ['', 'poor', 'fine', 'prime'];

type CueGroup = 'fish' | 'shellfish' | 'produce' | 'pantry' | 'dairy';
const CUE_GROUP: Record<string, CueGroup> = {
  fish: 'fish', mussels: 'shellfish',
  tomato: 'produce', onion: 'produce', garlic: 'produce', potato: 'produce', courgette: 'produce', lemon: 'produce',
  saffron: 'pantry', herbs: 'pantry', oil: 'pantry', flour: 'pantry',
  butter: 'dairy', cheese: 'dairy', eggs: 'dairy', bread: 'dairy',
};

/** What a careful eye notices about one unit in the crate, by grade (index 1..3). Several phrasings each so the words alone don't give it away. */
const CUES: Record<CueGroup, string[][]> = {
  fish: [[], ['cloudy eyes, soft belly', 'dull scales, smells strong'], ['firm, smells of the sea', 'bright enough, a little dry'], ['clear eyes, bright red gills', 'stiff and glossy, smells of nothing but sea']],
  shellfish: [[], ['a few gaping open', 'light for its size'], ['closed, a few barnacles', 'mostly shut, a bit muddy'], ['tightly shut, glossy shells', 'heavy, snapped shut when tapped']],
  produce: [[], ['soft spot, dull skin', 'wrinkled at the stem'], ['decent, a little uneven', 'fine, picked a few days ago'], ['heavy, taut, deep colour', 'firm, still smells of the field']],
  pantry: [[], ['faded label, little aroma', 'dusty tin, flat smell'], ['nothing special', 'sealed, this season'], ['rich aroma through the wrap', 'deep colour, sealed this week']],
  dairy: [[], ['sweating a little, a bit stale', 'dry at the edges'], ["yesterday's batch", 'fine, a day old'], ["this morning's batch, still cool", 'fresh from the farm cart']],
};

export function cueFor(id: string, grade: number, variant: number): string {
  const list = CUES[CUE_GROUP[id] ?? 'produce'][grade];
  return list[variant % list.length];
}

/** A crate unit: mostly fine, some poor, a few prime. */
export function rollGrade(): number {
  const r = Math.random();
  return r < 0.35 ? 1 : r < 0.82 ? 2 : 3;
}

// ------------------------------------------------------------ hidden sellers

export interface SecretSeller {
  id: string;
  name: string;
  merchant: string;
  greeting: string;
  /** what they sell, always prime, at market price, while it lasts */
  items: { id: string; stock: number }[];
  /** asked before they will trade */
  favour?: { item: string; ask: string; thanks: string };
}

/** Sellers tucked away in Le Panier, behind the market. Finding them is the effort; their goods are all prime. */
export const SECRET_SELLERS: Record<string, SecretSeller> = {
  mathilde: {
    id: 'mathilde',
    name: "Mathilde's garden cart",
    merchant: 'Mathilde',
    greeting: 'You found my little cart! Everything here grew on my roof terrace. Picked at dawn, every one perfect.',
    items: [{ id: 'tomato', stock: 3 }, { id: 'herbs', stock: 3 }, { id: 'lemon', stock: 2 }, { id: 'courgette', stock: 2 }],
  },
  raymond: {
    id: 'raymond',
    name: "Raymond's boat",
    merchant: 'Raymond',
    greeting: 'Caught this morning past the Frioul islands. The market never sees fish like these.',
    items: [{ id: 'fish', stock: 3 }, { id: 'mussels', stock: 3 }],
    favour: {
      item: 'bread',
      ask: "My catch? Maybe. But I've been out since four and haven't eaten a thing. Bring me a baguette and we'll talk.",
      thanks: 'Ah, still warm! You are a good one, chef. Come, look at the catch.',
    },
  },
};
