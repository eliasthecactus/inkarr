import { and, desc, eq, inArray } from 'drizzle-orm';
import type { BookRef, Release } from '@inkarr/sdk';
import { books, db, downloads, history, type Book } from './db.ts';
import { clientForProtocol, enabledInstances, getRow, getInstance } from './providers.ts';
import { getSettings } from './settings.ts';
import { rankReleases, type ScoredRelease } from './parser.ts';
import { createLogger } from './log.ts';
import { events } from './events.ts';

const log = createLogger('library');

export function toRef(book: Book): BookRef {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    year: book.year,
    isbn: book.isbn ?? [],
    language: book.language,
    mediaType: book.mediaType,
  };
}

export function getBook(id: number): Book | undefined {
  return db.select().from(books).where(eq(books.id, id)).get();
}

export function addHistory(bookId: number | null, event: string, title: string, data?: Record<string, unknown>) {
  db.insert(history).values({ bookId, event, title, data, date: Date.now() }).run();
}

/** Search every enabled indexer that supports the book's media type. */
export async function searchBook(book: Book): Promise<{ releases: ScoredRelease[]; errors: string[] }> {
  const ref = toRef(book);
  const term = `${book.author} ${book.title.split(':')[0]}`.trim();
  const errors: string[] = [];
  const indexers = enabledInstances('indexer').filter(
    ({ row, instance }) => row.settings._search !== false && instance.mediaTypes.includes(book.mediaType),
  );
  const results = await Promise.all(
    indexers.map(async ({ row, instance }) => {
      try {
        const found = await instance.search({ term, mediaType: book.mediaType, book: ref });
        return found.map((r) => ({ ...r, indexerId: row.id, indexerName: row.name }));
      } catch (err) {
        const msg = `${row.name}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        log.warn(`search failed on ${msg}`);
        return [] as Release[];
      }
    }),
  );
  return { releases: rankReleases(ref, results.flat(), getSettings()), errors };
}

export async function grab(book: Book, release: Release): Promise<number> {
  const client = clientForProtocol(release.protocol);
  if (!client) throw new Error(`No enabled download client handles ${release.protocol} downloads`);
  const now = Date.now();
  const row = db
    .insert(downloads)
    .values({
      bookId: book.id,
      clientId: client.row.id,
      indexerId: release.indexerId ?? null,
      releaseTitle: release.title,
      release: release as unknown as Record<string, unknown>,
      protocol: release.protocol,
      status: 'queued',
      size: release.size ?? null,
      addedAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  try {
    const itemId = await client.instance.add(release, { tag: `inkarr-${row.id}`, mediaType: book.mediaType });
    db.update(downloads).set({ clientItemId: itemId, status: 'downloading', updatedAt: Date.now() }).where(eq(downloads.id, row.id)).run();
  } catch (err) {
    db.delete(downloads).where(eq(downloads.id, row.id)).run();
    throw err;
  }
  db.update(books).set({ status: 'grabbed' }).where(eq(books.id, book.id)).run();
  addHistory(book.id, 'grabbed', release.title, { indexer: release.indexerName, client: client.row.name, protocol: release.protocol });
  log.info(`grabbed "${release.title}" for ${book.author} – ${book.title} via ${client.row.name}`);
  events.emit('book.grabbed', { book: toRef(book), release });
  return row.id;
}

/** Automatic search: grab the best acceptable release, if any. */
export async function autoSearch(book: Book): Promise<ScoredRelease | null> {
  if (activeDownloadFor(book.id)) return null;
  const { releases } = await searchBook(book);
  for (const best of releases.filter((r) => r.rejections.length === 0)) {
    if (!clientForProtocol(best.protocol)) continue;
    await grab(book, best);
    return best;
  }
  log.info(`no acceptable release found for ${book.author} – ${book.title}`);
  return null;
}

export function activeDownloadFor(bookId: number) {
  return db
    .select()
    .from(downloads)
    .where(and(eq(downloads.bookId, bookId), inArray(downloads.status, ['queued', 'downloading', 'paused', 'completed', 'importing', 'warning'])))
    .get();
}

export function wantedBooks(): Book[] {
  return db.select().from(books).where(and(eq(books.monitored, true), eq(books.status, 'wanted'))).orderBy(desc(books.addedAt)).all();
}

export async function removeDownload(id: number, deleteData: boolean) {
  const row = db.select().from(downloads).where(eq(downloads.id, id)).get();
  if (!row) return;
  const clientRow = getRow(row.clientId);
  if (clientRow && row.clientItemId) {
    const client = getInstance(clientRow as typeof clientRow & { kind: 'downloadClient' });
    await client.remove?.(row.clientItemId, deleteData).catch((err) => log.warn('client remove failed', err));
  }
  db.delete(downloads).where(eq(downloads.id, id)).run();
  const book = getBook(row.bookId);
  if (book && book.status === 'grabbed') db.update(books).set({ status: 'wanted' }).where(eq(books.id, book.id)).run();
}
