import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/** In development and preview, serve the app for any /app/... address, as the live host does (see public/_redirects). */
const rewriteAppPaths = (req: { url?: string }, _res: unknown, next: () => void) => {
  if (req.url && /^\/app(\/[^.]*)?(\?.*)?$/.test(req.url)) req.url = '/app/index.html';
  next();
};
const appFallback = (): Plugin => ({
  name: 'kita-app-fallback',
  configureServer: server => void server.middlewares.use(rewriteAppPaths),
  configurePreviewServer: server => void server.middlewares.use(rewriteAppPaths),
});

export default defineConfig({
  plugins: [react(), appFallback()],
  build: {
    rollupOptions: {
      input: { home: `${root}index.html`, app: `${root}app/index.html` },
    },
  },
});
