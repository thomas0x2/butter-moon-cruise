# Butter Moon Cruise

Rough prototype of a top-down 2D, Stardew-style pixel game. You are the chef aboard the cruise ship
MS Butter Moon: shop the port market in the morning, prep the galley in the afternoon, then run dinner service in the evening.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (works from any web host or file://)
```

## Standalone app later

The build uses relative paths, so `dist/` can be wrapped as a desktop app as-is.

- **Electron** (wrapper included): `npm i -D electron`, then `npm run desktop`. Package with electron-builder when needed.
- **Tauri** (smaller binaries): `npm create tauri-app` in a sibling folder and point `frontendDist` at `../dist`.

## Controls

WASD / arrows to move, E or Space to use or talk, Esc to back out of a menu, N for the recipe book, M to mute.
On touch: drag on the left half to walk, tap the right half to use, tap menu rows to pick them.

## How it plays (one leg: Marseille, a day at sea, Naples)

A day ends only when you go to bed in your cabin, or at midnight wherever you are.

1. **Day 1: a free day in Marseille.** Come and go between the port, the city and the ship as you like
   (gangway on the quay, hatch in the atrium).
   - **Vieux-Port market:** four stalls, each with a shop screen (merchant in the middle, wares on the right,
     their words along the bottom). 160g and room for 30 ingredients. There is no market at sea, so shop
     here for tomorrow's dinner: the panel top right always shows the guest count (12).
   - **The city:** Le Panier (hidden sellers) and La Canebiere through the open house doors, and the steps
     up to the Notre-Dame de la Garde lookout. Some locals teach you a recipe: Cesaire at his cafe (soupe a
     l'oignon) and Meme Rose by the fountain (ratatouille).
   - **The ship:** grand atrium, galley, restaurant, lido deck and your cabin. Hire waiters from Henri, order
     machines from the cabin catalog, fish off the lido, water the garden, taste combinations at the
     chalkboard. Go to bed to end the day early; the ship sails overnight.
2. **Day 2: at sea.** Free time aboard until 3 pm. Then kitchen prep until 6: you stay in the galley, set up
   to 3 dishes as tonight's menu at the chalkboard and prep trays at the cutting boards (15 minutes each).
3. **Dinner service (from 6 pm).** The chef stays in the galley. Waiters bring tickets to the pass; take
   ingredients or prep trays from the stores, cook on the hot line, and put plates on the pass window. The
   steel counters hold one thing each, so you can set things down. Twelve guests come in; they wait as long
   as it takes, and the night ends once the last one is fed. Regulars (pink corner) order their favourite and
   pay half again for it. **Mystery slop**: any one ingredient in the slop pot answers any ticket, unhappily.
4. **Rating.** 1 to 5 stars in half steps, scored on care: plate quality, menu variety, regulars'
   favourites, guests fed, a little for speed and waiters. Then the evening is yours until bed or
   midnight, and you wake up in Naples, the end of the prototype leg.

The recipe book starts with three basics (omelette aux herbes, salade provencale, moules marinieres).

**The galley** is laid out like a real line kitchen: stores (walk-in fridge, ice, sacks, crates) by the crew
door, one long island with the hot line (four burners, oven slot, slop pot) back to back with the cold line
(two cutting boards, sink), and the pass with its heat lamps across a narrow aisle.

### Ingredient quality

Every ingredient unit and plate is poor, fine or prime. Plate quality is the average of its ingredients, and it
scales the pay and the menu part of the star rating. Better ingredients come from skill and effort, never from
paying more:

- **Crate picking:** each stall sells from a crate of mixed units at one price. Each unit shows cues (clear eyes
  or cloudy, taut skin or soft spots, this morning's batch or yesterday's) and a subtle look on its icon.
- **Catch and grow your own:** the rod stand on the lido gives three casts per day; reel in while the
  float is over the gold for a prime rockfish. The sun-deck planters (herbs, tomato, courgette) give two prime
  units an hour after you water them, once a day.
- **Hidden sellers:** the open door at the end of the market's house row leads up into Le Panier. Mathilde
  sells prime produce from her roof garden; Raymond sells prime fish once you bring him a baguette.

Freshness loss between ports is decided but not built yet, since the prototype ends on arrival in Naples.

Recipes and market prices live in `src/data.ts`:

| Dish | Ingredients | Machine |
| --- | --- | --- |
| Bouillabaisse | rockfish + tomato + saffron | stove |
| Moules marinieres | mussels + garlic | stove |
| Poisson grille | rockfish + lemon | stove |
| Ratatouille | tomato + courgette + herbs | stove |
| Soupe a l'oignon | onion + baguette + cheese | stove |
| Omelette aux herbes | eggs + herbs | stove |
| Croissant | flour + butter + eggs | oven |
| Gratin dauphinois | potato + cheese | oven |
| Tarte au citron | lemon + flour + butter | oven |
| Salade provencale | tomato + onion + olive oil | board |
| Aioli toast | garlic + olive oil + baguette | board |
| Mystery slop | any one ingredient | slop pot |

## Code map

| File | What it does |
| --- | --- |
| `src/data.ts` | Ingredients, stalls, recipes, slop, kitchen upgrades, budget and basket size |
| `src/map.ts` | ASCII maps: the Marseille market, Le Panier and the ship's rooms, joined by doors |
| `src/npcs.ts` | People to talk to, merchants, and the waiter crews you can hire |
| `src/grid.ts` | Square tile grid and the three-quarter-view block helper |
| `src/art.ts` | All placeholder pixel art, drawn from code (people, items, floors, props, hull) |
| `src/game.ts` | Rules and phases: port day, aboard, prep, service, evening, arrival; doors, tickets, waiters, modals |
| `src/render.ts` | Row-sorted world render, rooms and walls, HUD, shop and dialogue screens, star summary |
| `src/sound.ts` | WebAudio blips |
| `src/main.ts` | Canvas scaling, keyboard/touch input, game loop |

The world renders at roughly 420x240 game pixels and is upscaled by an integer factor, so real sprite
sheets can replace `art.ts` without touching the rest. `window.game` is exposed for console debugging.
