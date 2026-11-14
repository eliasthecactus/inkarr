import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { config } from './config.ts';
import './db.ts';
import { loadPlugins } from './plugins.ts';
import { createApi } from './api.ts';
import { startScheduler } from './core-tasks.ts';
import { wireConnections } from './connections.ts';
import { createLogger } from './log.ts';

const log = createLogger('core');

await loadPlugins();
wireConnections();

const app = new Hono();
app.get('/ping', (c) => c.text('pong'));
app.route('/api', createApi());

if (existsSync(config.webDist)) {
  const root = relative(process.cwd(), config.webDist) || '.';
  const indexHtml = readFileSync(join(config.webDist, 'index.html'), 'utf8');
  app.use('/*', serveStatic({ root }));
  app.get('*', (c) => c.html(indexHtml)); // SPA fallback
} else {
  app.get('/', (c) => c.text('Inkarr API is running. Start the web UI with `npm run dev:web` (no built UI found).'));
}

startScheduler();

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  log.info(`Inkarr ${config.version} listening on http://${config.host}:${info.port} (data: ${config.dataDir})`);
});
