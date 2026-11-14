import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '../../..');

export const config = {
  port: Number(process.env.INKARR_PORT ?? process.env.PORT ?? 8585),
  host: process.env.INKARR_HOST ?? '0.0.0.0',
  dataDir: resolve(process.env.INKARR_DATA ?? resolve(repoRoot, 'data')),
  /** Colon-separated list of extra directories that contain plugin folders. */
  pluginDirs: [resolve(repoRoot, 'plugins'), ...(process.env.INKARR_PLUGIN_DIRS?.split(':').filter(Boolean) ?? [])],
  webDist: resolve(process.env.INKARR_WEB_DIST ?? resolve(repoRoot, 'apps/web/dist')),
  apiKey: process.env.INKARR_API_KEY ?? '',
  version: process.env.INKARR_VERSION ?? '0.1.0-dev',
};

mkdirSync(config.dataDir, { recursive: true });
