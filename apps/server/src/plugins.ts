import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { InkarrPlugin, PluginContext } from '@inkarr/sdk';
import { config } from './config.ts';
import { createLogger } from './log.ts';
import { events } from './events.ts';
import { registry, type LoadedPlugin } from './registry.ts';
import { kvGet, kvSet } from './settings.ts';

const log = createLogger('plugins');

interface PluginPackage {
  name: string;
  version?: string;
  description?: string;
  inkarr?: { id?: string; name?: string; server?: string; web?: string };
}

function discover(): { dir: string; pkg: PluginPackage }[] {
  const found: { dir: string; pkg: PluginPackage }[] = [];
  for (const base of config.pluginDirs) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(base, entry.name);
      const pkgPath = join(dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PluginPackage;
        if (pkg.inkarr) found.push({ dir, pkg });
      } catch (err) {
        log.warn(`invalid package.json in ${dir}`, err);
      }
    }
  }
  return found;
}

function disabledPlugins(): string[] {
  return kvGet<string[]>('core.disabledPlugins') ?? [];
}

export function setPluginEnabled(id: string, enabled: boolean) {
  const set = new Set(disabledPlugins());
  enabled ? set.delete(id) : set.add(id);
  kvSet('core.disabledPlugins', [...set]);
}

export async function loadPlugins() {
  const disabled = new Set(disabledPlugins());
  for (const { dir, pkg } of discover()) {
    const id = pkg.inkarr?.id ?? pkg.name.replace(/^@inkarr\/plugin-/, '');
    const info: LoadedPlugin = {
      id,
      name: pkg.inkarr?.name ?? pkg.name,
      version: pkg.version ?? '0.0.0',
      description: pkg.description,
      dir,
      hasServer: !!pkg.inkarr?.server,
      hasWeb: !!pkg.inkarr?.web,
      contributes: [],
    };
    registry.plugins.push(info);
    if (!pkg.inkarr?.server) continue;
    if (disabled.has(id)) {
      info.error = 'disabled';
      continue;
    }
    try {
      const mod = await import(pathToFileURL(resolve(dir, pkg.inkarr.server)).href);
      const plugin: InkarrPlugin = mod.default;
      if (!plugin?.setup) throw new Error('plugin has no default export with setup()');
      info.name = plugin.name;
      info.version = plugin.version;
      info.description = plugin.description ?? info.description;
      await plugin.setup(createContext(info));
      log.info(`loaded ${plugin.name} ${plugin.version}${info.contributes.length ? ` (${info.contributes.join(', ')})` : ''}`);
    } catch (err) {
      info.error = err instanceof Error ? err.message : String(err);
      log.error(`failed to load plugin ${id}`, err);
    }
  }
}

function createContext(info: LoadedPlugin): PluginContext {
  const pluginLog = createLogger(info.id);
  const note = (what: string) => info.contributes.push(what);
  return {
    pluginId: info.id,
    log: pluginLog,
    dataDir: config.dataDir,
    events,
    store: {
      get: (key) => kvGet(`plugin.${info.id}.${key}`),
      set: (key, value) => kvSet(`plugin.${info.id}.${key}`, value),
    },
    registerIndexer(def) {
      registry.definitions.indexer.set(def.type, { ...def, pluginId: info.id });
      note(`indexer:${def.type}`);
    },
    registerDownloadClient(def) {
      registry.definitions.downloadClient.set(def.type, { ...def, pluginId: info.id });
      note(`downloadClient:${def.type}`);
    },
    registerConnection(def) {
      registry.definitions.connection.set(def.type, { ...def, pluginId: info.id });
      note(`connection:${def.type}`);
    },
    registerMetadataProvider(provider) {
      registry.metadata.set(provider.id, { ...provider, pluginId: info.id });
      note(`metadata:${provider.id}`);
    },
    registerTask(task) {
      registry.tasks.set(task.id, { ...task, pluginId: info.id });
      note(`task:${task.id}`);
    },
    registerRoutes(fn) {
      registry.routes.push({ pluginId: info.id, fn });
      note('routes');
    },
  };
}
