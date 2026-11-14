import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { join } from 'node:path';
import { config } from './config.ts';

export const books = sqliteTable('books', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  foreignId: text('foreign_id').notNull(),
  metadataSource: text('metadata_source').notNull(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  year: integer('year'),
  coverUrl: text('cover_url'),
  description: text('description'),
  isbn: text('isbn', { mode: 'json' }).$type<string[]>(),
  language: text('language'),
  series: text('series'),
  seriesIndex: real('series_index'),
  mediaType: text('media_type').$type<'ebook' | 'audiobook'>().notNull(),
  monitored: integer('monitored', { mode: 'boolean' }).notNull().default(true),
  status: text('status').$type<'wanted' | 'grabbed' | 'downloaded'>().notNull().default('wanted'),
  path: text('path'),
  files: text('files', { mode: 'json' }).$type<string[]>(),
  addedAt: integer('added_at').notNull(),
});

export const providers = sqliteTable('providers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').$type<ProviderKind>().notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  priority: integer('priority').notNull().default(25),
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const downloads = sqliteTable('downloads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookId: integer('book_id').notNull(),
  clientId: integer('client_id').notNull(),
  indexerId: integer('indexer_id'),
  releaseTitle: text('release_title').notNull(),
  release: text('release', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  protocol: text('protocol').notNull(),
  clientItemId: text('client_item_id'),
  status: text('status').$type<'queued' | 'downloading' | 'paused' | 'completed' | 'importing' | 'imported' | 'failed' | 'warning'>().notNull(),
  progress: real('progress').notNull().default(0),
  size: integer('size'),
  eta: integer('eta'),
  outputPath: text('output_path'),
  message: text('message'),
  addedAt: integer('added_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const history = sqliteTable('history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookId: integer('book_id'),
  event: text('event').notNull(),
  title: text('title').notNull(),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
  date: integer('date').notNull(),
});

export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
});

export type ProviderKind = 'indexer' | 'downloadClient' | 'connection';
export type Book = typeof books.$inferSelect;
export type ProviderRow = typeof providers.$inferSelect;
export type DownloadRow = typeof downloads.$inferSelect;

const sqlite = new Database(join(config.dataDir, 'inkarr.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Schema migrations: append-only list, version tracked in user_version.
const migrations: string[] = [
  `
  CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    foreign_id TEXT NOT NULL,
    metadata_source TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    year INTEGER,
    cover_url TEXT,
    description TEXT,
    isbn TEXT,
    language TEXT,
    series TEXT,
    series_index REAL,
    media_type TEXT NOT NULL,
    monitored INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'wanted',
    path TEXT,
    files TEXT,
    added_at INTEGER NOT NULL,
    UNIQUE (foreign_id, media_type)
  );
  CREATE TABLE providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 25,
    settings TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL,
    indexer_id INTEGER,
    release_title TEXT NOT NULL,
    release TEXT NOT NULL,
    protocol TEXT NOT NULL,
    client_item_id TEXT,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    size INTEGER,
    eta INTEGER,
    output_path TEXT,
    message TEXT,
    added_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER REFERENCES books(id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    title TEXT NOT NULL,
    data TEXT,
    date INTEGER NOT NULL
  );
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT);
  `,
];

const current = sqlite.pragma('user_version', { simple: true }) as number;
for (let v = current; v < migrations.length; v++) {
  sqlite.transaction(() => {
    sqlite.exec(migrations[v]!);
    sqlite.pragma(`user_version = ${v + 1}`);
  })();
}

export const db = drizzle(sqlite, { schema: { books, providers, downloads, history, kv } });
