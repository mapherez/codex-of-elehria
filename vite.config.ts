import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  root: 'apps/web',
  base: './',
  plugins: [svelte({ configFile: path.resolve('svelte.config.js') })],
  resolve: {
    alias: {
      '@entry': path.resolve(`apps/web/src/entries/${mode === 'admin' ? 'admin' : 'public'}.ts`)
    }
  },
  build: { outDir: path.resolve(`build/${mode}`), emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:3001', '/media': 'http://127.0.0.1:3001' } }
}));
