import { and, asc, eq } from 'drizzle-orm';
import type { Connection, DownloadClient, Field, Indexer, Protocol } from '@inkarr/sdk';
import { db, providers, type ProviderKind, type ProviderRow } from './db.ts';
import { getDefinition, registry } from './registry.ts';
import { createLogger } from './log.ts';
import { config } from './config.ts';

type InstanceOf<K extends ProviderKind> = K extends 'indexer' ? Indexer : K extends 'downloadClient' ? DownloadClient : Connection;

/** Fields the core adds to every provider of a kind (shown before the plugin's own fields). */
export const coreFields: Record<ProviderKind, Field[]> = {
  indexer: [
    { key: '_rss', label: 'Enable RSS', type: 'boolean', default: true, help: 'Check this indexer for new releases periodically.' },
    { key: '_search', label: 'Enable search', type: 'boolean', default: true, help: 'Use for automatic and interactive searches.' },
  ],
  downloadClient: [],
  connection: [
    { key: '_onGrab', label: 'On grab', type: 'boolean', default: false },
    { key: '_onImport', label: 'On import', type: 'boolean', default: true },
  ],
};

const cache = new Map<number, { updatedAt: number; instance: unknown }>();

export function listRows(kind: ProviderKind): ProviderRow[] {
  return db.select().from(providers).where(eq(providers.kind, kind)).orderBy(asc(providers.priority), asc(providers.id)).all();
}

export function getRow(id: number): ProviderRow | undefined {
  return db.select().from(providers).where(eq(providers.id, id)).get();
}

export function instantiate<K extends ProviderKind>(kind: K, type: string, settings: Record<string, unknown>, name = type): InstanceOf<K> {
  const def = getDefinition(kind, type);
  if (!def) throw new Error(`No ${kind} plugin of type "${type}" is installed`);
  return def.create(settings, { log: createLogger(`${type}:${name}`), dataDir: config.dataDir }) as InstanceOf<K>;
}

export function getInstance<K extends ProviderKind>(row: ProviderRow & { kind: K }): InstanceOf<K> {
  const hit = cache.get(row.id);
  if (hit && hit.updatedAt === row.updatedAt) return hit.instance as InstanceOf<K>;
  const instance = instantiate(row.kind as K, row.type, row.settings, row.name);
  cache.set(row.id, { updatedAt: row.updatedAt, instance });
  return instance;
}

export function enabledInstances<K extends ProviderKind>(kind: K): { row: ProviderRow; instance: InstanceOf<K> }[] {
  const out: { row: ProviderRow; instance: InstanceOf<K> }[] = [];
  for (const row of db.select().from(providers).where(and(eq(providers.kind, kind), eq(providers.enabled, true))).orderBy(asc(providers.priority)).all()) {
    if (!getDefinition(kind, row.type)) continue; // plugin removed/disabled
    try {
      out.push({ row, instance: getInstance(row as ProviderRow & { kind: K }) });
    } catch (err) {
      createLogger('providers').error(`cannot create ${kind} "${row.name}"`, err);
    }
  }
  return out;
}

export function clientForProtocol(protocol: Protocol) {
  return enabledInstances('downloadClient').find(({ instance }) => instance.protocols.includes(protocol));
}

export function saveRow(kind: ProviderKind, body: { id?: number; type: string; name: string; enabled?: boolean; priority?: number; settings: Record<string, unknown> }) {
  const values = {
    kind,
    type: body.type,
    name: body.name,
    enabled: body.enabled ?? true,
    priority: body.priority ?? 25,
    settings: body.settings ?? {},
    updatedAt: Date.now(),
  };
  if (body.id) {
    db.update(providers).set(values).where(eq(providers.id, body.id)).run();
    return getRow(body.id)!;
  }
  return db.insert(providers).values(values).returning().get();
}

export function deleteRow(id: number) {
  cache.delete(id);
  db.delete(providers).where(eq(providers.id, id)).run();
}

export function schemaFor(kind: ProviderKind) {
  return [...registry.definitions[kind].values()].map((def) => ({
    type: def.type,
    name: def.name,
    description: def.description,
    docsUrl: def.docsUrl,
    pluginId: def.pluginId,
    fields: [...coreFields[kind], ...def.fields],
  }));
}
