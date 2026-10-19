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
  keeper: string;
}

export const STALLS: Record<StallId, Stall> = {
  fish: { id: 'fish', name: 'Poissonnerie du Vieux-Port', keeper: 'Fresh off the morning boats!' },
  produce: { id: 'produce', name: 'Primeur de Provence', keeper: 'Sun-ripened, picked yesterday.' },
  epicerie: { id: 'epicerie', name: 'Epicerie fine', keeper: 'Spices from every port.' },
  dairy: { id: 'dairy', name: 'Fromagerie & boulangerie', keeper: 'Still warm from the oven.' },
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

export interface Recipe {
  id: string;
  name: string;
  inputs: string[];
  at: 'stove' | 'board';
  time: number;
  price: number;
  hint: string;
}

export const RECIPES: Recipe[] = [
  { id: 'bouillabaisse', name: 'Bouillabaisse', inputs: ['fish', 'tomato', 'saffron'], at: 'stove', time: 7, price: 40, hint: "Marseille's fish stew, golden with saffron and tomato." },
  { id: 'croissant', name: 'Croissant', inputs: ['flour', 'butter', 'eggs'], at: 'stove', time: 6, price: 16, hint: 'Flaky pastry: flour folded with plenty of butter, glazed with egg.' },
  { id: 'moules', name: 'Moules marinieres', inputs: ['mussels', 'garlic'], at: 'stove', time: 5, price: 24, hint: 'Mussels steamed open with a heap of garlic.' },
  { id: 'grilled', name: 'Poisson grille', inputs: ['fish', 'lemon'], at: 'stove', time: 5, price: 26, hint: 'Whole fish off the grill with a squeeze of lemon.' },
  { id: 'ratatouille', name: 'Ratatouille', inputs: ['tomato', 'courgette', 'herbs'], at: 'stove', time: 6, price: 22, hint: 'Provencal vegetables, tomato and courgette, stewed with herbs.' },
  { id: 'onionsoup', name: "Soupe a l'oignon", inputs: ['onion', 'bread', 'cheese'], at: 'stove', time: 6, price: 20, hint: 'Onion soup under a crust of bread and melted cheese.' },
  { id: 'gratin', name: 'Gratin dauphinois', inputs: ['potato', 'cheese'], at: 'stove', time: 6, price: 18, hint: 'Sliced potatoes baked bubbling under cheese.' },
  { id: 'omelette', name: 'Omelette aux herbes', inputs: ['eggs', 'herbs'], at: 'stove', time: 4, price: 14, hint: 'Soft folded eggs with fresh herbs.' },
  { id: 'tarte', name: 'Tarte au citron', inputs: ['lemon', 'flour', 'butter'], at: 'stove', time: 6, price: 20, hint: 'A buttery crust filled with sharp lemon curd.' },
  { id: 'salade', name: 'Salade provencale', inputs: ['tomato', 'onion', 'oil'], at: 'board', time: 3, price: 14, hint: 'Sliced tomato and onion dressed in olive oil.' },
  { id: 'aioli', name: 'Aioli toast', inputs: ['garlic', 'oil', 'bread'], at: 'board', time: 3, price: 12, hint: 'Garlic pounded into olive oil, spread on bread.' },
];

export const BURNT = 'burnt';

export const BUDGET = 120;
export const BASKET_SIZE = 15;
export const MENU_SIZE = 3;

const NAMES = new Map<string, string>([
  ...INGREDIENTS.map((i) => [i.id, i.name] as [string, string]),
  ...RECIPES.map((r) => [r.id, r.name] as [string, string]),
  [BURNT, 'Burnt mess'],
]);

export function nameOf(id: string): string {
  return NAMES.get(id) ?? id;
}

export function ingredient(id: string): Ingredient | undefined {
  return INGREDIENTS.find((i) => i.id === id);
}

export function recipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
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
