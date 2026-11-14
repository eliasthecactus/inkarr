import type { Connection, DownloadClient, Indexer, MetadataProvider, ProviderDefinition, RouteApp, TaskDefinition } from '@inkarr/sdk';
import type { ProviderKind } from './db.ts';

export interface LoadedPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  dir: string;
  hasServer: boolean;
  hasWeb: boolean;
  error?: string;
  contributes: string[];
}

type AnyDef = ProviderDefinition<Indexer> | ProviderDefinition<DownloadClient> | ProviderDefinition<Connection>;

export const registry = {
  plugins: [] as LoadedPlugin[],
  definitions: {
    indexer: new Map<string, ProviderDefinition<Indexer> & { pluginId: string }>(),
    downloadClient: new Map<string, ProviderDefinition<DownloadClient> & { pluginId: string }>(),
    connection: new Map<string, ProviderDefinition<Connection> & { pluginId: string }>(),
  } as Record<ProviderKind, Map<string, AnyDef & { pluginId: string }>>,
  metadata: new Map<string, MetadataProvider & { pluginId: string }>(),
  tasks: new Map<string, TaskDefinition & { pluginId: string }>(),
  routes: [] as { pluginId: string; fn: (app: RouteApp) => void }[],
};

export function getDefinition(kind: ProviderKind, type: string) {
  return registry.definitions[kind].get(type);
}
