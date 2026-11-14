import type { MetadataProvider } from '@inkarr/sdk';
import { cleanBook, rankResults } from './metadata-rank.ts';
export { cleanBook, fold, isIsbn, rankResults } from './metadata-rank.ts';
import { registry } from './registry.ts';
import { getSettings, kvGet, kvSet } from './settings.ts';

export function metadataSettings(id: string): Record<string, unknown> {
  return kvGet<Record<string, unknown>>(`metadata.${id}`) ?? {};
}

export function saveMetadataSettings(id: string, settings: Record<string, unknown>) {
  const prev = metadataSettings(id);
  const next = { ...settings };
  for (const [k, v] of Object.entries(next)) if (v === '********') next[k] = prev[k];
  kvSet(`metadata.${id}`, next);
}

export function pickProvider(id?: string | null): (MetadataProvider & { pluginId: string }) | undefined {
  return registry.metadata.get(id || getSettings().metadataProvider) ?? [...registry.metadata.values()][0];
}

export function listProviders() {
  return [...registry.metadata.values()].map((p) => {
    const settings = { ...metadataSettings(p.id) };
    for (const f of p.fields ?? []) if (f.type === 'password' && settings[f.key]) settings[f.key] = '********';
    return { id: p.id, name: p.name, description: p.description, pluginId: p.pluginId, fields: p.fields ?? [], settings };
  });
}

export async function searchMetadata(term: string, providerId?: string | null) {
  const provider = pickProvider(providerId);
  if (!provider) throw new Error('No metadata provider plugin is installed');
  const results = (await provider.search(term, metadataSettings(provider.id))).map(cleanBook);
  return { provider, results: rankResults(term, results) };
}
