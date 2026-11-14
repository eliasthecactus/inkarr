import { copyFile, link, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import AdmZip from 'adm-zip';
import { eq } from 'drizzle-orm';
import { books, db, downloads, type Book, type DownloadRow } from './db.ts';
import { formatList, getSettings, type CoreSettings } from './settings.ts';
import { addHistory, getBook, toRef } from './library.ts';
import { events } from './events.ts';
import { createLogger } from './log.ts';

const log = createLogger('importer');

async function walk(path: string): Promise<string[]> {
  const s = await stat(path);
  if (s.isFile()) return [path];
  const out: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const ext = (f: string) => extname(f).slice(1).toLowerCase();

function sanitize(part: string): string {
  return part.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'Unknown';
}

export function renderPattern(pattern: string, book: Book, extra: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    Author: book.author,
    Title: book.title.split(':')[0]!.trim(),
    FullTitle: book.title,
    Year: book.year ? String(book.year) : '',
    Series: book.series ?? '',
    SeriesIndex: book.seriesIndex != null ? String(book.seriesIndex).padStart(2, '0') : '',
    ...extra,
  };
  return pattern
    .split('/')
    .map((segment) =>
      sanitize(
        segment
          .replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')
          .replace(/\(\s*\)|\[\s*\]/g, '')
          .replace(/\s+-\s*$/, ''),
      ),
    )
    .join('/');
}

async function placeFile(src: string, dest: string, mode: CoreSettings['importMode']) {
  await mkdir(dirname(dest), { recursive: true });
  if (existsSync(dest)) await unlink(dest);
  if (mode === 'move') {
    try {
      await rename(src, dest);
      return;
    } catch {
      await copyFile(src, dest);
      await unlink(src);
      return;
    }
  }
  if (mode === 'hardlink') {
    try {
      await link(src, dest);
      return;
    } catch {
      /* cross-device or unsupported: fall back to copy */
    }
  }
  await copyFile(src, dest);
}

/** Extract archives in place when a download contains no usable media files. */
async function extractArchives(files: string[], into: string): Promise<string[]> {
  const out: string[] = [];
  for (const f of files.filter((f) => ext(f) === 'zip')) {
    const target = join(into, `.inkarr-extract-${basename(f, '.zip')}`);
    new AdmZip(f).extractAllTo(target, true);
    out.push(...(await walk(target)));
  }
  return out;
}

export async function importDownload(dl: DownloadRow) {
  const book = getBook(dl.bookId);
  if (!book) throw new Error('book no longer exists');
  if (!dl.outputPath || !existsSync(dl.outputPath)) throw new Error(`download path not found: ${dl.outputPath ?? '(none)'} — check remote path mapping`);

  db.update(downloads).set({ status: 'importing', updatedAt: Date.now() }).where(eq(downloads.id, dl.id)).run();
  const settings = getSettings();
  const allowed = formatList(book.mediaType === 'audiobook' ? settings.audiobookFormats : settings.ebookFormats);
  let all = await walk(dl.outputPath);
  let media = all.filter((f) => allowed.includes(ext(f)));
  if (!media.length) {
    const base = (await stat(dl.outputPath)).isDirectory() ? dl.outputPath : dirname(dl.outputPath);
    all = await extractArchives(all, base);
    media = all.filter((f) => allowed.includes(ext(f)));
  }
  if (!media.length) throw new Error(`no ${book.mediaType} files (${allowed.join(', ')}) found in download`);

  // Torrents must keep seeding: never move their files.
  const mode = dl.protocol === 'torrent' && settings.importMode === 'move' ? 'hardlink' : settings.importMode;
  const root = book.mediaType === 'audiobook' ? settings.audiobookRoot : settings.ebookRoot;
  const folder = join(root, renderPattern(settings.folderPattern, book));
  const imported: string[] = [];

  if (book.mediaType === 'ebook') {
    // Best format according to preference order; keep one file per format.
    const byFormat = new Map<string, string>();
    for (const f of media.sort((a, b) => allowed.indexOf(ext(a)) - allowed.indexOf(ext(b)))) {
      if (!byFormat.has(ext(f))) byFormat.set(ext(f), f);
    }
    for (const [format, src] of byFormat) {
      const dest = join(folder, `${renderPattern(settings.fileNamePattern, book, { Format: format })}.${format}`);
      await placeFile(src, dest, mode);
      imported.push(dest);
    }
  } else {
    // Audiobooks: keep the track structure, plus cover art.
    const base = media.length === 1 ? dirname(media[0]!) : commonDir(media);
    const extras = all.filter((f) => ['jpg', 'jpeg', 'png', 'cue', 'nfo'].includes(ext(f)));
    for (const src of [...media, ...extras]) {
      const rel = media.length === 1 && media.includes(src)
        ? `${renderPattern(settings.fileNamePattern, book)}.${ext(src)}`
        : relative(base, src);
      const dest = join(folder, rel.startsWith('..') ? basename(src) : rel);
      await placeFile(src, dest, mode);
      imported.push(dest);
    }
  }

  db.update(books).set({ status: 'downloaded', path: folder, files: imported }).where(eq(books.id, book.id)).run();
  db.update(downloads).set({ status: 'imported', updatedAt: Date.now(), message: null }).where(eq(downloads.id, dl.id)).run();
  addHistory(book.id, 'imported', dl.releaseTitle, { folder, files: imported.length });
  log.info(`imported ${imported.length} file(s) for ${book.author} – ${book.title} into ${folder}`);
  events.emit('book.imported', { book: toRef(book), folder, files: imported });
}

function commonDir(paths: string[]): string {
  const parts = paths.map((p) => dirname(p).split('/'));
  const first = parts[0]!;
  let i = 0;
  while (i < first.length && parts.every((p) => p[i] === first[i])) i++;
  return first.slice(0, i).join('/') || '/';
}
