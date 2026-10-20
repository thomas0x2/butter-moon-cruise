// The people the chef can talk to, room by room.

import { makeLook, type Look } from './art';
import type { StallId } from './data';
import type { MapId } from './map';

export interface NpcDef {
  name: string;
  map: MapId;
  x: number;
  y: number;
  look: Look;
  lines: string[];
  /** wanders around instead of standing at a post */
  stroll?: boolean;
  facing?: 'up' | 'down' | 'left' | 'right';
  /** a hidden seller: talking opens their wares */
  seller?: string;
}

const WAITER = { w: '#2b2b3a', g: '#1d1d2b', r: '#ffffff', b: '#1d1d2b' };

export const WAITER_LOOKS: Look[] = [
  makeLook('bun', { ...WAITER, s: '#c68642', S: '#a0652d', h: '#2b1b10' }),
  makeLook('short', { ...WAITER, s: '#ffdbac', S: '#e8b98a', h: '#121212' }),
];

export const NPCS: NpcDef[] = [
  // Marseille
  { name: 'Fanny', map: 'market', x: 13.5, y: 6.5, stroll: true, look: makeLook('bun', { w: '#3fb6c9', g: '#2a8899', h: '#a8461f' }),
    lines: ['Bonjour, chef! Buying for the big ship?', 'Bouillabaisse needs good rockfish, a ripe tomato and real saffron. Do not skimp on the saffron.'] },
  { name: 'Marius', map: 'market', x: 23.5, y: 10.5, stroll: true, look: makeLook('short', { w: '#e9e4d4', g: '#c8b38a', h: '#b5b5b5' }),
    lines: ['Forty years I have fished this harbour.', 'Mussels and garlic, a splash of the good stuff... that is supper.', 'Want the real thing? The open door at the end of the row goes up into Le Panier. The old-timers sell there.'] },

  // Le Panier, the old quarter behind the market
  { name: 'Mathilde', map: 'alley', x: 3.5, y: 3.6, facing: 'down', seller: 'mathilde', look: makeLook('sunhat', { w: '#b06a8a', g: '#8a4568', h: '#b5b5b5', s: '#f1c27d', S: '#d9a066' }), lines: [] },
  { name: 'Raymond', map: 'alley', x: 18.5, y: 3.6, facing: 'down', seller: 'raymond', look: makeLook('short', { w: '#2d3550', g: '#1d1d2b', r: '#e8452c', h: '#e9e4d4', s: '#c68642', S: '#a0652d' }), lines: [] },

  // Lido deck
  { name: 'Captain Margot', map: 'lido', x: 30.5, y: 6.5, facing: 'left', look: makeLook('short', { w: '#ffffff', g: '#c9d3dc', r: '#e3b54a', b: '#1c2d4a', h: '#5a3825' }),
    lines: ['Welcome aboard, chef. We sail for Naples tonight.', 'The dining room seats up to dinner at six. My passengers judge a ship by its galley, so no pressure.'] },
  { name: 'Mr. Okafor', map: 'lido', x: 20.5, y: 13.5, stroll: true, look: makeLook('sunhat', { w: '#ff7a59', g: '#d4573a', s: '#8d5524', S: '#6b3e18' }),
    lines: ['I came to Marseille for one thing: bouillabaisse.', 'If it is on the menu tonight, I will order two.'] },
  { name: 'Lucia', map: 'lido', x: 12.5, y: 11.5, stroll: true, look: makeLook('bun', { w: '#5fcf7a', g: '#3c9c55', h: '#121212' }),
    lines: ['Tomorrow is Naples! I grew up two streets from the best pizzeria in the world.', 'Tonight though, I want something French. A tarte au citron, all lemon and butter. That is my favourite.'] },
  { name: 'Theo', map: 'lido', x: 28.5, y: 9.5, stroll: true, look: makeLook('short', { w: '#f5c542', g: '#cc9c1f', h: '#c9a14a', s: '#ffdbac', S: '#e8b98a' }),
    lines: ['Are you the chef? Can you make croissants?', 'Flour, butter, eggs. Mum says that is all it is, but it is magic.'] },

  // Atrium
  { name: 'Amelie', map: 'lobby', x: 4.5, y: 3.6, facing: 'down', look: makeLook('bun', { w: '#2d6fb0', g: '#16365a', r: '#e3b54a', h: '#a8461f' }),
    lines: ['Guest services, how can I help?', 'The galley is through the crew door on the left. The restaurant is on the right, and the stairs go up to the lido deck.'] },
  { name: 'Mrs. Lindqvist', map: 'lobby', x: 14.5, y: 7.5, stroll: true, look: makeLook('short', { w: '#8e6fe0', g: '#6a4fb8', h: '#e9e4d4' }),
    lines: ['Forty-two cruises, dear, and I still dream of a proper poisson grille.', 'Just fish and lemon. Simplicity is the hardest thing.'] },

  // Restaurant
  { name: 'Henri', map: 'restaurant', x: 11.5, y: 7.5, facing: 'down', look: makeLook('short', { ...WAITER, r: '#c8323e', h: '#5a3825' }),
    lines: ['I am Henri, maitre d\'. Tonight is a full house.', 'During service you stay in the galley, chef. My waiters bring the tickets to the pass and carry your plates out. Nobody here is in a hurry; take your time and cook well.', 'A tip from an old hand: chop and prepare at the cutting board this afternoon. Tonight you just cook and plate.'] },
  { name: 'Sofia', map: 'restaurant', x: 4.5, y: 5.5, stroll: true, look: WAITER_LOOKS[0],
    lines: ['Put each finished plate on the pass window. If it matches a ticket, I take it straight out.'] },
  { name: 'Kenji', map: 'restaurant', x: 17.5, y: 3.5, stroll: true, look: WAITER_LOOKS[1],
    lines: ['The gold bar on each ticket is the tip. Quick plates earn a little extra, but nobody ever leaves hungry on the Butter Moon.'] },
];

export const MERCHANT_LOOKS: Record<StallId, Look> = {
  fish: makeLook('bun', { w: '#2d6fb0', g: '#16365a', r: '#ffffff', h: '#5a3825', s: '#ffdbac', S: '#e8b98a' }),
  produce: makeLook('sunhat', { w: '#3f8f3f', g: '#2a6a2a', r: '#f5c542', h: '#2b1b10' }),
  epicerie: makeLook('bun', { w: '#e8741c', g: '#b5520f', r: '#fff6d6', h: '#121212', s: '#c68642', S: '#a0652d' }),
  dairy: makeLook('short', { w: '#f4f4f0', g: '#c3c8d0', r: '#c8323e', h: '#c9a14a' }),
};

export interface StaffOption {
  label: string;
  cost: number;
  /** 1 to 5; feeds the end-of-night rating */
  skill: number;
  /** waiter walking speed along the pass, tiles per second */
  speed: number;
  blurb: string;
  crew: { name: string; look: Look }[];
}

const DECKHAND = { w: '#f4f7fa', g: '#c9d3dc', r: '#2d6fb0', b: '#2d3550' };

export const STAFF_OPTIONS: StaffOption[] = [
  { label: 'Deckhands Paul and Lou', cost: 0, skill: 2, speed: 2.0, blurb: 'Willing, but slow, and they never learned the table numbers.',
    crew: [{ name: 'Paul', look: makeLook('short', { ...DECKHAND, h: '#a8461f' }) }, { name: 'Lou', look: makeLook('bun', { ...DECKHAND, h: '#2b1b10', s: '#8d5524', S: '#6b3e18' }) }] },
  { label: 'Sofia and Kenji', cost: 25, skill: 4, speed: 2.8, blurb: 'Seasoned waiters. Quick, polite, never drop a plate.',
    crew: [{ name: 'Sofia', look: WAITER_LOOKS[0] }, { name: 'Kenji', look: WAITER_LOOKS[1] }] },
  { label: "Henri's A-team", cost: 50, skill: 5, speed: 3.6, blurb: 'Silver service from the best restaurant in Lyon.',
    crew: [{ name: 'Sofia', look: WAITER_LOOKS[0] }, { name: 'Kenji', look: WAITER_LOOKS[1] }, { name: 'Henri', look: makeLook('short', { ...WAITER, r: '#c8323e', h: '#5a3825' }) }] },
];
