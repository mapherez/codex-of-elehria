import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const port = process.env.PORT || (mode === 'public' ? process.env.PUBLIC_PORT || '3000' : process.env.ADMIN_PORT || '3001');
  const target = `http://127.0.0.1:${port}`;
  return {
    root: 'apps/web',
    base: './',
    plugins: [svelte({ configFile: path.resolve('svelte.config.js') })],
    resolve: {
      alias: {
        '@entry': path.resolve(`apps/web/src/entries/${mode === 'admin' ? 'admin' : 'public'}.ts`)
      }
    },
    build: { outDir: path.resolve(`build/${mode}`), emptyOutDir: true },
    server: { port: 5173, strictPort: true, proxy: { '/api': target, '/media': target } }
  };
});
