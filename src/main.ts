import { Game } from './game';
import { makeCanvas } from './grid';
import { modalHits, notebookHit, renderHud, renderWorld } from './render';
import { toggleMute, unlockAudio } from './sound';

const screen = document.getElementById('game') as HTMLCanvasElement;
const ctx = screen.getContext('2d')!;
let [low, lowCtx] = makeCanvas(1, 1);
let scale = 2;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  screen.width = Math.round((screen.clientWidth || window.innerWidth) * dpr);
  screen.height = Math.round((screen.clientHeight || window.innerHeight) * dpr);
  // integer upscale so pixels stay square; aim for roughly 420x240 game pixels
  scale = Math.max(2, Math.round(Math.min(screen.width / 420, screen.height / 240)));
  [low, lowCtx] = makeCanvas(Math.ceil(screen.width / scale), Math.ceil(screen.height / scale));
}
window.addEventListener('resize', resize);
resize();

const game = new Game();
(window as unknown as { game: Game }).game = game; // handy for debugging in the console

// ------------------------------------------------------------ input

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  unlockAudio();
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (!e.repeat && (k === 'e' || k === ' ' || k === 'enter')) game.interact();
  if (!e.repeat && (k === 'escape' || k === 'q' || k === 'backspace')) game.cancel();
  if (!e.repeat && k === 'n') game.openNotebook();
  if (game.modal && (k === 'arrowup' || k === 'w')) game.moveSelection(-1);
  if (game.modal && (k === 'arrowdown' || k === 's')) game.moveSelection(1);
  if (!e.repeat && k === 'm') game.toast(toggleMute() ? 'Sound off' : 'Sound on');
  keys.add(k);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

// touch: drag on the left half to walk, tap the right half to interact
let stick: { id: number; x0: number; y0: number; dx: number; dy: number } | null = null;
screen.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const r = screen.getBoundingClientRect();
  const dpr = screen.width / r.width;
  const px = (e.clientX - r.left) * dpr;
  const py = (e.clientY - r.top) * dpr;
  const inside = (b: { x: number; y: number; w: number; h: number }) => px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h;
  if (game.modal) {
    const hit = modalHits.find(inside);
    if (hit) game.selectRow(hit.i);
    else game.cancel();
    return;
  }
  if (inside(notebookHit)) {
    game.openNotebook();
    return;
  }
  const walkable = game.phase === 'market' || game.phase === 'prep' || game.phase === 'service';
  if (!walkable || e.clientX > screen.getBoundingClientRect().left + screen.clientWidth / 2) {
    game.interact();
    return;
  }
  stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
  screen.setPointerCapture(e.pointerId);
});
screen.addEventListener('pointermove', (e) => {
  if (!stick || e.pointerId !== stick.id) return;
  stick.dx = e.clientX - stick.x0;
  stick.dy = e.clientY - stick.y0;
});
const release = (e: PointerEvent) => {
  if (stick && e.pointerId === stick.id) stick = null;
};
screen.addEventListener('pointerup', release);
screen.addEventListener('pointercancel', release);

function inputVector(): [number, number] {
  let ix = 0;
  let iy = 0;
  if (game.modal) return [0, 0];
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  if (keys.has('w') || keys.has('arrowup')) iy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iy += 1;
  if (stick && Math.hypot(stick.dx, stick.dy) > 12) {
    const a = Math.atan2(stick.dy, stick.dx);
    // snap to 8 directions so the sprite facing reads cleanly
    const snap = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
    ix = Math.round(Math.cos(snap));
    iy = Math.round(Math.sin(snap));
  }
  return [ix, iy];
}

// ------------------------------------------------------------ loop

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const [ix, iy] = inputVector();
  game.update(dt, ix, iy);
  const view = renderWorld(game, lowCtx, low.width, low.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(low, 0, 0, low.width * scale, low.height * scale);
  renderHud(game, ctx, view, scale, screen.width, screen.height);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
