import { defineConfig } from 'vite';

// Relative base so the built game also loads from file:// (Electron/Tauri).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 100000 },
});
