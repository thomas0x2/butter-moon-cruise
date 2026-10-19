# Butter Moon Cruise

Rough prototype of a top-down 2D, Stardew-style pixel game. You are the chef aboard the cruise ship
MS Butter Moon: guests sit down with an order, you fetch ingredients, cook, and serve before they lose patience.

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

WASD / arrows to move, E or Space to use, Esc to back out of a menu, N for the chef's notebook, M to mute.
On touch: drag on the left half to walk, tap the right half to use, tap menu rows to pick them.

## How it plays (one leg: Marseille to Naples)

1. **Marseille market (morning).** Walk the Vieux-Port quay and buy from four stalls (fish, produce, epicerie,
   dairy and bakery). You have 120g and room for 15 ingredients; you can hand things back for a refund.
   The chef's notebook (N) lists dishes worth trying, described in prose. Board the ship at the gangway.
2. **Menu planning (afternoon, on board).** At the galley chalkboard, tick 2 or 3 pantry ingredients and taste
   them. A real combination unlocks the recipe. Put up to 3 discovered dishes on tonight's menu.
3. **Dinner service (6 pm to 11 pm).** Guests only order menu dishes the pantry can still make, so your
   shopping caps the night. Take ingredients from the pantry (fridge, ice box, sacks or crates), cook on the
   stove or cutting board, serve. Tips scale with patience; stove food burns if left. Service closes early
   when the pantry runs dry.
4. **Arrival.** A night summary (spent, earned, profit, leftovers), then the ship docks in Naples. That is
   the end of the prototype leg.

Recipes and market prices live in `src/data.ts`:

| Dish | Ingredients | Station |
| --- | --- | --- |
| Bouillabaisse | rockfish + tomato + saffron | stove |
| Croissant | flour + butter + eggs | stove |
| Moules marinieres | mussels + garlic | stove |
| Poisson grille | rockfish + lemon | stove |
| Ratatouille | tomato + courgette + herbs | stove |
| Soupe a l'oignon | onion + baguette + cheese | stove |
| Gratin dauphinois | potato + cheese | stove |
| Omelette aux herbes | eggs + herbs | stove |
| Tarte au citron | lemon + flour + butter | stove |
| Salade provencale | tomato + onion + olive oil | board |
| Aioli toast | garlic + olive oil + baguette | board |

## Code map

| File | What it does |
| --- | --- |
| `src/data.ts` | Ingredients, prices, stalls, recipes, budget and basket size |
| `src/map.ts` | ASCII maps: the Marseille quay market and the ship (galley, dining room, pool deck, bow) |
| `src/grid.ts` | Square tile grid and the three-quarter-view block helper |
| `src/art.ts` | All placeholder pixel art, drawn from code (people, items, floors, props, hull) |
| `src/game.ts` | Rules and phases: market, menu planning, service, arrival; menus/modals |
| `src/render.ts` | Row-sorted world render to a low-res canvas, lighting, HUD |
| `src/sound.ts` | WebAudio blips |
| `src/main.ts` | Canvas scaling, keyboard/touch input, game loop |

The world renders at roughly 420x240 game pixels and is upscaled by an integer factor, so real sprite
sheets can replace `art.ts` without touching the rest. `window.game` is exposed for console debugging.
