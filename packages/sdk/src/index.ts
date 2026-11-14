/**
 * @inkarr/sdk — the contract between the Inkarr core and its plugins.
 *
 * Everything that talks to the outside world (indexers, download clients,
 * library connections, metadata sources, background tasks, extra API routes)
 * is contributed by a plugin through the PluginContext below. The core only
 * orchestrates: it never knows about qBittorrent, Calibre or any site.
 */

export type Protocol = 'torrent' | 'ddl';
export type MediaType = 'ebook' | 'audiobook';
export const MEDIA_TYPES: MediaType[] = ['ebook', 'audiobook'];
export const PROTOCOLS: Protocol[] = ['torrent', 'ddl'];

// ---------------------------------------------------------------------------
// Settings schema: plugins describe their settings, the UI renders the form.
// ---------------------------------------------------------------------------

export type FieldType = 'text' | 'password' | 'url' | 'number' | 'boolean' | 'select' | 'multiselect' | 'path';

export interface FieldOption {
  value: string;
  label: string;
}

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: unknown;
  help?: string;
  placeholder?: string;
  options?: FieldOption[];
  /** Hidden behind "Show advanced" in the UI. */
  advanced?: boolean;
}

export type Settings = Record<string, unknown>;

export interface TestResult {
  ok: boolean;
  message?: string;
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export interface ProviderContext {
  log: Logger;
  /** Absolute path of Inkarr's data directory (config, db, temp downloads). */
  dataDir: string;
}

/**
 * A provider definition is a *type* of thing users can add several instances
 * of (e.g. two qBittorrent servers). Each instance has its own settings.
 */
export interface ProviderDefinition<I> {
  /** Unique type id, e.g. "qbittorrent". */
  type: string;
  name: string;
  description?: string;
  /** Link shown in the UI next to the form. */
  docsUrl?: string;
  fields: Field[];
  create(settings: Settings, ctx: ProviderContext): I;
}

// ---------------------------------------------------------------------------
// Books & releases
// ---------------------------------------------------------------------------

export interface BookRef {
  id?: number;
  title: string;
  author: string;
  year?: number | null;
  isbn?: string[];
  language?: string | null;
  mediaType: MediaType;
}

export interface Release {
  /** Stable id within the indexer. */
  guid: string;
  title: string;
  protocol: Protocol;
  /** Magnet link, .torrent URL, or direct/hoster URL for DDL. */
  downloadUrl: string;
  infoUrl?: string;
  size?: number;
  seeders?: number;
  leechers?: number;
  publishDate?: string;
  /** e.g. "epub", "m4b". Detected from the title when omitted. */
  format?: string;
  language?: string;
  mediaType?: MediaType;
  /** Filled by the core. */
  indexerId?: number;
  indexerName?: string;
}

export interface SearchQuery {
  /** Free text, usually "author title". */
  term: string;
  mediaType: MediaType;
  book?: BookRef;
}

export interface Indexer {
  protocol: Protocol;
  mediaTypes: MediaType[];
  test(): Promise<TestResult>;
  search(query: SearchQuery): Promise<Release[]>;
  /** Latest releases, used by RSS sync. Optional. */
  recent?(): Promise<Release[]>;
}

// ---------------------------------------------------------------------------
// Download clients
// ---------------------------------------------------------------------------

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'warning';

export interface DownloadItem {
  /** The id returned by DownloadClient.add(). */
  id: string;
  name: string;
  status: DownloadStatus;
  /** 0..1 */
  progress: number;
  size?: number;
  /** Seconds remaining. */
  eta?: number;
  /** Local path (file or folder) of the finished download, as Inkarr sees it. */
  outputPath?: string;
  message?: string;
}

export interface AddOptions {
  /** Unique tag the core uses to find the item again, e.g. "inkarr-42". */
  tag: string;
  mediaType: MediaType;
}

export interface DownloadClient {
  protocols: Protocol[];
  test(): Promise<TestResult>;
  /** Returns an id the client can later be queried with. */
  add(release: Release, opts: AddOptions): Promise<string>;
  /** Status of the given ids. Unknown ids may be omitted. */
  getItems(ids: string[]): Promise<DownloadItem[]>;
  remove?(id: string, deleteData: boolean): Promise<void>;
}

// ---------------------------------------------------------------------------
// Connections (Calibre, Audiobookshelf, Kavita, webhooks, ...)
// ---------------------------------------------------------------------------

export interface GrabEvent {
  book: BookRef;
  release: Release;
}

export interface ImportEvent {
  book: BookRef;
  /** Folder the book was imported into. */
  folder: string;
  /** Absolute paths of imported files. */
  files: string[];
}

export interface Connection {
  test(): Promise<TestResult>;
  onGrab?(event: GrabEvent): Promise<void>;
  onImport?(event: ImportEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export interface MetadataBook {
  foreignId: string;
  title: string;
  author: string;
  year?: number | null;
  coverUrl?: string | null;
  description?: string | null;
  isbn?: string[];
  language?: string | null;
  series?: string | null;
  seriesIndex?: number | null;
  pageCount?: number | null;
}

export interface MetadataProvider {
  id: string;
  name: string;
  description?: string;
  /** Optional settings (e.g. an API key), edited under Settings → General. */
  fields?: Field[];
  /** Link to the book on the provider's website, shown on the book page. */
  bookUrl?(foreignId: string): string | null;
  search(term: string, settings: Settings): Promise<MetadataBook[]>;
  get?(foreignId: string, settings: Settings): Promise<MetadataBook | null>;
}

// ---------------------------------------------------------------------------
// Tasks & events
// ---------------------------------------------------------------------------

export interface TaskDefinition {
  id: string;
  name: string;
  /** 0 = manual only. */
  intervalSeconds: number;
  run(): Promise<void>;
}

export interface InkarrEvents {
  'book.added': { bookId: number };
  'book.grabbed': GrabEvent;
  'book.imported': ImportEvent;
  'download.failed': { bookId: number; message: string };
}

export interface EventBus {
  on<K extends keyof InkarrEvents>(event: K, fn: (payload: InkarrEvents[K]) => void | Promise<void>): () => void;
  emit<K extends keyof InkarrEvents>(event: K, payload: InkarrEvents[K]): void;
}

/** Minimal route-registration surface (a Hono app under /api/plugins/<id>). */
export interface RouteApp {
  get(path: string, handler: (c: any) => any): unknown;
  post(path: string, handler: (c: any) => any): unknown;
  put(path: string, handler: (c: any) => any): unknown;
  delete(path: string, handler: (c: any) => any): unknown;
}

export interface KeyValueStore {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}

export interface PluginContext {
  pluginId: string;
  log: Logger;
  dataDir: string;
  events: EventBus;
  /** Plugin-private persistent key/value storage. */
  store: KeyValueStore;
  registerIndexer(def: ProviderDefinition<Indexer>): void;
  registerDownloadClient(def: ProviderDefinition<DownloadClient>): void;
  registerConnection(def: ProviderDefinition<Connection>): void;
  registerMetadataProvider(provider: MetadataProvider): void;
  registerTask(task: TaskDefinition): void;
  registerRoutes(fn: (app: RouteApp) => void): void;
}

export interface InkarrPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  setup(ctx: PluginContext): void | Promise<void>;
}

export function definePlugin(plugin: InkarrPlugin): InkarrPlugin {
  return plugin;
}

// ---------------------------------------------------------------------------
// Small helpers plugins tend to need
// ---------------------------------------------------------------------------

/** Translate a path reported by a remote client (e.g. inside Docker) to a local one. */
export function mapRemotePath(path: string, remote?: unknown, local?: unknown): string {
  const r = typeof remote === 'string' ? remote.trim() : '';
  const l = typeof local === 'string' ? local.trim() : '';
  if (!r || !l) return path;
  const norm = (p: string) => (p.endsWith('/') ? p : p + '/');
  if (path === r || path.startsWith(norm(r))) return norm(l) + path.slice(norm(r).length);
  return path;
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v);
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : v == null ? fallback : v === 'true' || v === 1 || v === '1';
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export const AUDIO_EXTENSIONS = ['m4b', 'mp3', 'm4a', 'flac', 'ogg', 'opus', 'aac', 'wma'];
export const EBOOK_EXTENSIONS = ['epub', 'azw3', 'azw', 'mobi', 'pdf', 'fb2', 'djvu', 'cbz', 'cbr', 'txt', 'kepub'];
