import { eq } from 'drizzle-orm';
import { db, kv } from './db.ts';

import { defaultSettings, type CoreSettings } from './settings-defaults.ts';
export { defaultSettings, formatList, type CoreSettings } from './settings-defaults.ts';

export function kvGet<T>(key: string): T | undefined {
  const row = db.select().from(kv).where(eq(kv.key, key)).get();
  return row ? (row.value as T) : undefined;
}

export function kvSet(key: string, value: unknown) {
  db.insert(kv).values({ key, value }).onConflictDoUpdate({ target: kv.key, set: { value } }).run();
}

export function getSettings(): CoreSettings {
  return { ...defaultSettings, ...(kvGet<Partial<CoreSettings>>('core.settings') ?? {}) };
}

export function saveSettings(patch: Partial<CoreSettings>): CoreSettings {
  const next = { ...getSettings(), ...patch };
  kvSet('core.settings', next);
  return next;
}

