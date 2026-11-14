import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { desc, eq, inArray } from 'drizzle-orm';
import { books, db, downloads, history, type ProviderKind } from './db.ts';
import { registry } from './registry.ts';
import { deleteRow, getRow, instantiate, listRows, saveRow, schemaFor } from './providers.ts';
import { getSettings, saveSettings, defaultSettings } from './settings.ts';
import { autoSearch, getBook, grab, removeDownload, searchBook, addHistory } from './library.ts';
import { allTasks, runTask, taskState } from './core-tasks.ts';
import { setPluginEnabled } from './plugins.ts';
import { createLogger, recentLogs } from './log.ts';
import { config } from './config.ts';
import { events } from './events.ts';
import type { MediaType, MetadataBook, Release } from '@inkarr/sdk';

const KINDS: ProviderKind[] = ['indexer', 'downloadClient', 'connection'];
const startedAt = Date.now();
const log = createLogger('api');

function kindParam(k: string): ProviderKind {
  if (!KINDS.includes(k as ProviderKind)) throw new HTTPException(404, { message: `unknown provider kind ${k}` });
  return k as ProviderKind;
}

function maskSecrets(kind: ProviderKind, type: string, settings: Record<string, unknown>) {
  const fields = schemaFor(kind).find((s) => s.type === type)?.fields ?? [];
  const out = { ...settings };
  for (const f of fields) if (f.type === 'password' && out[f.key]) out[f.key] = '********';
  return out;
}

function unmaskSecrets(id: number | undefined, settings: Record<string, unknown>) {
  if (!id) return settings;
  const prev = getRow(id)?.settings ?? {};
  const out = { ...settings };
  for (const [k, v] of Object.entries(out)) if (v === '********') out[k] = prev[k];
  return out;
}

export function createApi() {
  const api = new Hono();

  api.use('*', async (c, next) => {
    if (config.apiKey) {
      const key = c.req.header('x-api-key') ?? c.req.query('apikey');
      if (key !== config.apiKey) return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });

  api.onError((err, c) => {
    const status = err instanceof HTTPException ? err.status : 500;
    if (status >= 500) log.error(`${c.req.method} ${c.req.path} failed`, err);
    return c.json({ error: err.message }, status);
  });

  // --- system ---------------------------------------------------------------
  api.get('/system/status', (c) =>
    c.json({ version: config.version, startedAt, dataDir: config.dataDir, node: process.version, platform: process.platform, authEnabled: !!config.apiKey }),
  );
  api.get('/system/plugins', (c) => c.json(registry.plugins.map(({ dir, ...p }) => ({ ...p, enabled: p.error !== 'disabled' }))));
  api.put('/system/plugins/:id', async (c) => {
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    setPluginEnabled(c.req.param('id'), enabled);
    return c.json({ ok: true, restartRequired: true });
  });
  api.get('/system/tasks', (c) => c.json(allTasks().map(({ run, ...t }) => ({ ...t, ...(taskState.get(t.id) ?? { running: false }) }))));
  api.post('/system/tasks/:id/run', async (c) => {
    void runTask(c.req.param('id'));
    return c.json({ ok: true });
  });
  api.get('/system/logs', (c) => c.json(recentLogs()));

  // --- settings -------------------------------------------------------------
  api.get('/settings', (c) => c.json({ settings: getSettings(), defaults: defaultSettings, metadataProviders: [...registry.metadata.values()].map((m) => ({ id: m.id, name: m.name })) }));
  api.put('/settings', async (c) => c.json(saveSettings(await c.req.json())));

  // --- providers (indexers, download clients, connections) ------------------
  api.get('/schema/:kind', (c) => c.json(schemaFor(kindParam(c.req.param('kind')))));
  api.get('/providers/:kind', (c) => {
    const kind = kindParam(c.req.param('kind'));
    return c.json(listRows(kind).map((r) => ({ ...r, settings: maskSecrets(kind, r.type, r.settings), available: !!registry.definitions[kind].get(r.type) })));
  });
  api.post('/providers/:kind', async (c) => {
    const kind = kindParam(c.req.param('kind'));
    const body = await c.req.json();
    return c.json(saveRow(kind, { ...body, id: undefined }));
  });
  api.put('/providers/:kind/:id', async (c) => {
    const kind = kindParam(c.req.param('kind'));
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    return c.json(saveRow(kind, { ...body, id, settings: unmaskSecrets(id, body.settings ?? {}) }));
  });
  api.delete('/providers/:kind/:id', (c) => {
    deleteRow(Number(c.req.param('id')));
    return c.json({ ok: true });
  });
  api.post('/providers/:kind/test', async (c) => {
    const kind = kindParam(c.req.param('kind'));
    const body = await c.req.json<{ id?: number; type: string; name?: string; settings: Record<string, unknown> }>();
    try {
      const inst = instantiate(kind, body.type, unmaskSecrets(body.id, body.settings ?? {}), body.name);
      return c.json(await inst.test());
    } catch (err) {
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- metadata ---------------------------------------------------------------
  api.get('/metadata/search', async (c) => {
    const term = c.req.query('term')?.trim();
    if (!term) return c.json([]);
    const id = c.req.query('provider') || getSettings().metadataProvider;
    const provider = registry.metadata.get(id) ?? [...registry.metadata.values()][0];
    if (!provider) throw new HTTPException(400, { message: 'No metadata provider plugin is installed' });
    const results = await provider.search(term);
    const existing = db.select({ foreignId: books.foreignId, mediaType: books.mediaType, id: books.id }).from(books).all();
    return c.json(
      results.map((r) => ({
        ...r,
        source: provider.id,
        inLibrary: existing.filter((e) => e.foreignId === r.foreignId).map((e) => ({ id: e.id, mediaType: e.mediaType })),
      })),
    );
  });

  // --- books -------------------------------------------------------------------
  api.get('/books', (c) => c.json(db.select().from(books).orderBy(books.author, books.title).all()));
  api.get('/books/:id', (c) => {
    const book = getBook(Number(c.req.param('id')));
    if (!book) throw new HTTPException(404, { message: 'book not found' });
    return c.json(book);
  });
  api.post('/books', async (c) => {
    const body = await c.req.json<{ book: MetadataBook & { source: string }; mediaTypes: MediaType[]; monitored?: boolean; search?: boolean }>();
    const created = [];
    for (const mediaType of body.mediaTypes?.length ? body.mediaTypes : (['ebook'] as MediaType[])) {
      const row = db
        .insert(books)
        .values({
          foreignId: body.book.foreignId,
          metadataSource: body.book.source,
          title: body.book.title,
          author: body.book.author,
          year: body.book.year ?? null,
          coverUrl: body.book.coverUrl ?? null,
          description: body.book.description ?? null,
          isbn: body.book.isbn ?? [],
          language: body.book.language ?? null,
          series: body.book.series ?? null,
          seriesIndex: body.book.seriesIndex ?? null,
          mediaType,
          monitored: body.monitored ?? true,
          addedAt: Date.now(),
        })
        .onConflictDoNothing()
        .returning()
        .get();
      if (!row) continue;
      created.push(row);
      addHistory(row.id, 'added', `${row.author} – ${row.title}`, { mediaType });
      events.emit('book.added', { bookId: row.id });
      if (body.search ?? getSettings().searchOnAdd) void autoSearch(row).catch(() => {});
    }
    return c.json(created);
  });
  api.put('/books/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const body = await c.req.json<{ monitored?: boolean; status?: 'wanted' | 'downloaded' }>();
    db.update(books).set({ ...(body.monitored != null && { monitored: body.monitored }), ...(body.status && { status: body.status }) }).where(eq(books.id, id)).run();
    return c.json(getBook(id));
  });
  api.delete('/books/:id', (c) => {
    db.delete(books).where(eq(books.id, Number(c.req.param('id')))).run();
    return c.json({ ok: true });
  });
  api.post('/books/:id/search', async (c) => {
    const book = getBook(Number(c.req.param('id')));
    if (!book) throw new HTTPException(404, { message: 'book not found' });
    return c.json(await searchBook(book));
  });
  api.post('/books/:id/auto-search', async (c) => {
    const book = getBook(Number(c.req.param('id')));
    if (!book) throw new HTTPException(404, { message: 'book not found' });
    const grabbed = await autoSearch(book);
    return c.json({ grabbed: grabbed?.title ?? null });
  });
  api.get('/books/:id/history', (c) =>
    c.json(db.select().from(history).where(eq(history.bookId, Number(c.req.param('id')))).orderBy(desc(history.date)).all()),
  );

  api.post('/grab', async (c) => {
    const { bookId, release } = await c.req.json<{ bookId: number; release: Release }>();
    const book = getBook(bookId);
    if (!book) throw new HTTPException(404, { message: 'book not found' });
    const id = await grab(book, release);
    return c.json({ id });
  });

  // --- activity ------------------------------------------------------------------
  api.get('/queue', (c) => {
    const rows = db.select().from(downloads).where(inArray(downloads.status, ['queued', 'downloading', 'paused', 'completed', 'importing', 'warning', 'failed'])).orderBy(desc(downloads.addedAt)).all();
    const bookMap = new Map(db.select().from(books).all().map((b) => [b.id, b]));
    return c.json(rows.map((r) => ({ ...r, book: bookMap.get(r.bookId) ?? null, clientName: getRow(r.clientId)?.name })));
  });
  api.delete('/queue/:id', async (c) => {
    await removeDownload(Number(c.req.param('id')), c.req.query('deleteData') === 'true');
    return c.json({ ok: true });
  });
  api.get('/history', (c) => {
    const rows = db.select().from(history).orderBy(desc(history.date)).limit(Number(c.req.query('limit') ?? 200)).all();
    const bookMap = new Map(db.select().from(books).all().map((b) => [b.id, b]));
    return c.json(rows.map((r) => ({ ...r, book: r.bookId ? bookMap.get(r.bookId) ?? null : null })));
  });

  // --- plugin routes ---------------------------------------------------------------
  for (const { pluginId, fn } of registry.routes) {
    const sub = new Hono();
    fn(sub);
    api.route(`/plugins/${pluginId}`, sub);
  }

  return api;
}
