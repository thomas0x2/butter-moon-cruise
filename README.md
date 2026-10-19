# Butter Moon Cruise

Rough prototype of a top-down 2D, Stardew-style pixel game. You are the chef aboard the cruise ship
MS Butter Moon: shop the port market, roam the ship in the afternoon, then run dinner service from the galley.

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

## How it plays (one leg: Marseille to Naples)

1. **Marseille market (morning).** Walk the Vieux-Port quay and shop at four stalls. Each stall opens a shop
   screen: the merchant in the middle, the wares on the right, the merchant talking along the bottom. You have
   120g and room for 15 ingredients, and can hand things back for a refund. Board at the gangway.
2. **Afternoon on board.** The ship is a set of rooms joined by doors, Pokemon-style: the grand atrium, the
   galley, the restaurant, the lido deck (stairs from the atrium) and the chef's cabin. Walk around and talk to
   passengers and crew; many drop recipe hints.
   - **Waiters:** Henri, the maitre d' in the restaurant, lets you hire tonight's crew (free deckhands,
     25g seasoned waiters or a 50g A-team). Better waiters walk faster and raise the rating.
   - **Kitchen upgrades:** the catalog on your cabin desk sells machines. The bakery oven (40g) unlocks the
     oven dishes; copper stove tops, Japanese knives and a convection fan make their machine faster and its
     plates better (more pay, better menu score).
   - **Recipe book (N):** starts empty. At the galley chalkboard, tick 2 or 3 pantry ingredients and taste
     them. A real combination goes in the book. Put up to 3 discovered dishes on tonight's menu, then open
     the dining room.
3. **Dinner service (6 pm to 11 pm).** The chef stays in the galley. Waiters bring tickets to the pass
   (shown on the rail at the top: dish, table and patience). Take ingredients from the pantry, cook on the
   stoves, board or oven, and put finished plates on the pass window; a waiter carries each one to its table.
   Stove food burns if left. **Mystery slop**: any one ingredient in the slop pot makes a bowl that answers
   any ticket, for 5g and an unhappy guest. When nothing on the menu can still be made, guests order slop.
4. **Rating.** Every service ends with 1 to 5 stars in half steps: menu (dish quality and variety, machine
   upgrades), speed (how fresh plates reached guests), guests fed, and waiter skill. Then the ship docks in
   Naples, the end of the prototype leg.

### Ingredient quality

Every ingredient unit and plate is poor, fine or prime. Plate quality is the average of its ingredients, and it
scales the pay and the menu part of the star rating. Better ingredients come from skill and effort, never from
paying more:

- **Crate picking:** each stall sells from a crate of mixed units at one price. Each unit shows cues (clear eyes
  or cloudy, taut skin or soft spots, this morning's batch or yesterday's) and a subtle look on its icon.
- **Catch and grow your own:** the rod stand on the lido gives three casts per afternoon; reel in while the
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
| `src/game.ts` | Rules and phases: market, afternoon, service, rating, arrival; doors, tickets, waiters, modals |
| `src/render.ts` | Row-sorted world render, rooms and walls, HUD, shop and dialogue screens, star summary |
| `src/sound.ts` | WebAudio blips |
| `src/main.ts` | Canvas scaling, keyboard/touch input, game loop |

The world renders at roughly 420x240 game pixels and is upscaled by an integer factor, so real sprite
sheets can replace `art.ts` without touching the rest. `window.game` is exposed for console debugging.
