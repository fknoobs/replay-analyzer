import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/replay-analyzer/' : '/',
  build: {
    outDir: 'site',
    emptyOutDir: true,
  },
  server: {
    open: true,
  },
});
