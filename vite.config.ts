import { defineConfig } from 'vite';

export default defineConfig({
  // Files in public/ (including public/media) are served from the site root, e.g. /media/products/x.jpg
  publicDir: 'public',
  server: { port: 5173, open: true },
  build: { outDir: 'dist' },
});
