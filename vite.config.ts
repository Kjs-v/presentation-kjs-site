import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

/**
 * Runs the API (server/router.ts) inside `npm run dev` and `npm run preview`, so the whole site works locally.
 * It uses the dev database from .env. On Vercel the same router runs as the function api/index.ts.
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

/**
 * The admin page lives at /admin (admin.html), and needs the list of files in public/media
 * to suggest image paths: `import mediaFiles from 'virtual:media-list'`.
 */
function adminPage(): Plugin {
  const VIRTUAL = 'virtual:media-list';
  const RESOLVED = '\0' + VIRTUAL; // Vite convention for generated modules
  const listMedia = (dir: string, prefix: string): string[] =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { withFileTypes: true })
          .flatMap((e) =>
            e.isDirectory()
              ? listMedia(`${dir}/${e.name}`, `${prefix}/${e.name}`)
              : /\.(jpe?g|png|webp|svg|gif|mp4|webm|pdf)$/i.test(e.name)
                ? [`${prefix}/${e.name}`]
                : [],
          )
      : [];
  const toAdmin = (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    if (req.url === '/admin' || req.url === '/admin/' || req.url?.startsWith('/admin?'))
      req.url = '/admin.html';
    next();
  };
  return {
    name: 'kjs-admin-page',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : undefined),
    load: (id) =>
      id === RESOLVED
        ? `export default ${JSON.stringify(listMedia('public/media', '/media').sort())};`
        : undefined,
    configureServer: (server) => void server.middlewares.use(toAdmin),
    configurePreviewServer: (server) => void server.middlewares.use(toAdmin),
  };
}

export default defineConfig({
  // Files in public/ (including public/media) are served from the site root, e.g. /media/products/x.jpg
  publicDir: 'public',
  server: { port: 5173, open: true },
  build: {
    outDir: 'dist',
    rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } },
  },
  plugins: [adminPage(), localApi()],
});
