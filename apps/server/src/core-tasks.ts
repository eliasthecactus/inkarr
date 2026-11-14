import { and, eq, inArray } from 'drizzle-orm';
import type { TaskDefinition } from '@inkarr/sdk';
import { books, db, downloads } from './db.ts';
import { enabledInstances, getInstance, getRow } from './providers.ts';
import { importDownload } from './importer.ts';
import { addHistory, autoSearch, getBook, grab, toRef, wantedBooks } from './library.ts';
import { getSettings } from './settings.ts';
import { rankReleases } from './parser.ts';
import { events } from './events.ts';
import { createLogger } from './log.ts';
import { registry } from './registry.ts';

const log = createLogger('tasks');

const ACTIVE = ['queued', 'downloading', 'paused', 'completed', 'warning'] as const;

/** Poll download clients, update the queue and import finished items. */
async function refreshDownloads() {
  const active = db.select().from(downloads).where(inArray(downloads.status, [...ACTIVE])).all();
  const byClient = Map.groupBy(active, (d) => d.clientId);
  for (const [clientId, rows] of byClient) {
    const clientRow = getRow(clientId);
    if (!clientRow) continue;
    let items;
    try {
      const client = getInstance(clientRow as typeof clientRow & { kind: 'downloadClient' });
      items = await client.getItems(rows.map((r) => r.clientItemId).filter((x): x is string => !!x));
    } catch (err) {
      log.warn(`cannot reach ${clientRow.name}`, err);
      continue;
    }
    for (const row of rows) {
      const item = items.find((i) => i.id === row.clientItemId);
      if (!item) {
        if (Date.now() - row.addedAt > 5 * 60_000) {
          db.update(downloads).set({ status: 'warning', message: 'Item not found in download client', updatedAt: Date.now() }).where(eq(downloads.id, row.id)).run();
        }
        continue;
      }
      db.update(downloads)
        .set({ status: item.status, progress: item.progress, size: item.size ?? row.size, eta: item.eta ?? null, outputPath: item.outputPath ?? row.outputPath, message: item.message ?? null, updatedAt: Date.now() })
        .where(eq(downloads.id, row.id))
        .run();
      if (item.status === 'failed') {
        db.update(books).set({ status: 'wanted' }).where(and(eq(books.id, row.bookId), eq(books.status, 'grabbed'))).run();
        addHistory(row.bookId, 'failed', row.releaseTitle, { message: item.message });
        events.emit('download.failed', { bookId: row.bookId, message: item.message ?? 'failed' });
      }
      if (item.status === 'completed') {
        const fresh = db.select().from(downloads).where(eq(downloads.id, row.id)).get()!;
        try {
          await importDownload(fresh);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn(`import failed for "${row.releaseTitle}": ${message}`);
          db.update(downloads).set({ status: 'warning', message: `Import failed: ${message}`, updatedAt: Date.now() }).where(eq(downloads.id, row.id)).run();
        }
      }
    }
  }
}

/** Match the newest releases of RSS-enabled indexers against wanted books. */
async function rssSync() {
  const wanted = wantedBooks();
  if (!wanted.length) return;
  const settings = getSettings();
  for (const { row, instance } of enabledInstances('indexer')) {
    if (row.settings._rss === false || !instance.recent) continue;
    let releases;
    try {
      releases = (await instance.recent()).map((r) => ({ ...r, indexerId: row.id, indexerName: row.name }));
    } catch (err) {
      log.warn(`RSS failed for ${row.name}`, err);
      continue;
    }
    for (const book of wanted) {
      if (!instance.mediaTypes.includes(book.mediaType)) continue;
      const current = getBook(book.id);
      if (!current || current.status !== 'wanted') continue;
      const best = rankReleases(toRef(book), releases, settings).find((r) => r.rejections.length === 0);
      if (best) await grab(current, best).catch((err) => log.warn(`RSS grab failed`, err));
    }
  }
}

async function searchAllWanted() {
  for (const book of wantedBooks()) {
    await autoSearch(book).catch((err) => log.warn(`search failed for ${book.title}`, err));
  }
}

export const coreTasks: TaskDefinition[] = [
  { id: 'refresh-downloads', name: 'Refresh download queue', intervalSeconds: 15, run: refreshDownloads },
  { id: 'rss-sync', name: 'RSS sync', intervalSeconds: 15 * 60, run: rssSync },
  { id: 'search-wanted', name: 'Search all wanted books', intervalSeconds: 0, run: searchAllWanted },
];

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export interface TaskState { lastRun?: number; lastDuration?: number; lastError?: string; running: boolean; nextRun?: number }
export const taskState = new Map<string, TaskState>();

export function allTasks() {
  const rss = getSettings().rssIntervalMinutes * 60;
  const core = coreTasks.map((t) => ({ ...t, pluginId: 'core', intervalSeconds: t.id === 'rss-sync' ? rss : t.intervalSeconds }));
  return [...core, ...registry.tasks.values()];
}

export async function runTask(id: string) {
  const task = allTasks().find((t) => t.id === id);
  if (!task) throw new Error(`unknown task ${id}`);
  const state = taskState.get(id) ?? { running: false };
  if (state.running) return;
  state.running = true;
  taskState.set(id, state);
  const start = Date.now();
  try {
    await task.run();
    state.lastError = undefined;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    log.error(`task ${id} failed`, err);
  } finally {
    state.running = false;
    state.lastRun = start;
    state.lastDuration = Date.now() - start;
    state.nextRun = task.intervalSeconds ? start + task.intervalSeconds * 1000 : undefined;
  }
}

export function startScheduler() {
  setInterval(() => {
    const now = Date.now();
    for (const task of allTasks()) {
      if (!task.intervalSeconds) continue;
      const state = taskState.get(task.id);
      if (state?.running) continue;
      if (!state?.lastRun || now - state.lastRun >= task.intervalSeconds * 1000) void runTask(task.id);
    }
  }, 5_000);
}
