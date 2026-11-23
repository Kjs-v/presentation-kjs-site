import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

/**
 * Runs the API (server/router.ts) inside `npm run dev` and `npm run preview`, so the whole site works locally.
 * It uses the dev database from .env. On Vercel the same router runs as the function api/[...path].ts.
 */
function localApi(): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next();
    try {
      const { handle } = await import('./server/router');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(', '));
      }
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const response = await handle(
        new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        }),
      );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key === 'set-cookie') return;
        res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error('[api]', error);
      res.statusCode = 500;
      res.end('{"error":"Local API failed to start. Check .env."}');
    }
  };
  const loadEnv = () => {
    if (fs.existsSync('.env')) process.loadEnvFile('.env');
  };
  return {
    name: 'kjs-local-api',
    configureServer(server) {
      loadEnv();
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      loadEnv();
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  // Files in public/ (including public/media) are served from the site root, e.g. /media/products/x.jpg
  publicDir: 'public',
  server: { port: 5173, open: true },
  build: { outDir: 'dist' },
  plugins: [localApi()],
});
