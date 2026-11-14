import { definePlugin, num, str, type Indexer, type MediaType, type Release, type SearchQuery, type Settings } from '@inkarr/sdk';

const BASE = 'https://archive.org';
const UA = { 'User-Agent': 'Inkarr/0.1 (+https://github.com/eliasthecactus/inkarr)' };

/**
 * Only search collections that hold public-domain library scans or openly
 * licensed recordings, plus items that carry an explicit CC / public-domain
 * license. Borrow-only ("lending library") items are always excluded.
 */
const CURATED_COLLECTIONS = ['americana', 'toronto', 'cdl', 'europeanlibraries', 'library_of_congress', 'gutenberg', 'librivoxaudio', 'biodiversity'];

const AUDIO_QUALITIES: Record<string, string> = {
  '64': '64Kbps MP3',
  '128': '128Kbps MP3',
  vbr: 'VBR MP3',
};

const EBOOK_FORMATS: Record<string, { iaFormat: string; ext: string }> = {
  epub: { iaFormat: 'EPUB', ext: 'epub' },
  pdf: { iaFormat: 'Text PDF', ext: 'pdf' },
};

interface SearchDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
  date?: string;
  language?: string | string[];
  downloads?: number;
}

interface IaFile {
  name: string;
  format?: string;
  size?: string;
  source?: string;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Library-catalog names → display names: "[Shelley, Mary Wollstonecraft], 1797-1851" → "Mary Wollstonecraft Shelley". */
export function displayAuthor(raw: string): string {
  const name = raw
    .replace(/[\[\]]/g, '')
    .replace(/,?\s*(author|editor|translator|narrator)\.?$/i, '')
    .replace(/,?\s*\(?\b\d{3,4}\??-(\d{3,4})?\??\)?\.?\s*$/, '') // life dates
    .trim();
  const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
}

/** Strip characters with meaning in IA's Lucene query syntax. */
const clean = (s: string) => s.replace(/[():"\\\[\]{}^~*?!+\-&|/]/g, ' ').replace(/\s+/g, ' ').trim();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`archive.org HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Run async work over items with limited parallelism. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

class InternetArchive implements Indexer {
  protocol = 'ddl' as const;
  mediaTypes: MediaType[];

  constructor(private s: Settings) {
    const mt = str(s.mediaTypes, 'both');
    this.mediaTypes = mt === 'both' ? ['ebook', 'audiobook'] : [mt as MediaType];
  }

  private scopeQuery(): string {
    const extra = str(this.s.extraCollections)
      .split(',')
      .map((c) => clean(c))
      .filter(Boolean);
    const collections = [...CURATED_COLLECTIONS, ...extra].join(' OR ');
    return `(collection:(${collections}) OR licenseurl:*creativecommons* OR licenseurl:*publicdomain*)`;
  }

  private buildQuery(q: SearchQuery): string {
    const mediatype = q.mediaType === 'audiobook' ? 'audio' : 'texts';
    let what: string;
    if (q.book) {
      const title = clean(q.book.title.split(/[:;(]/)[0]!);
      const lastName = clean(q.book.author.split(',')[0]!.split(' ').pop() ?? '');
      what = lastName ? `title:(${title}) AND creator:(${lastName})` : `title:(${title})`;
    } else {
      what = clean(q.term);
    }
    return `${what} AND mediatype:(${mediatype}) AND NOT access-restricted-item:true AND ${this.scopeQuery()}`;
  }

  private async searchDocs(query: string, rows: number): Promise<SearchDoc[]> {
    const params = new URLSearchParams({ q: query, rows: String(rows), output: 'json' });
    params.append('sort[]', 'downloads desc');
    for (const f of ['identifier', 'title', 'creator', 'date', 'language', 'downloads']) params.append('fl[]', f);
    const data = await getJson<{ response: { docs: SearchDoc[] } }>(`${BASE}/advancedsearch.php?${params}`);
    return data.response.docs;
  }

  private async releasesFor(doc: SearchDoc, mediaType: MediaType): Promise<Release[]> {
    const meta = await getJson<{ files?: IaFile[] }>(`${BASE}/metadata/${encodeURIComponent(doc.identifier)}`).catch(() => ({ files: [] as IaFile[] }));
    const files = meta.files ?? [];
    const author = displayAuthor(first(doc.creator) ?? 'Unknown');
    const year = doc.date?.slice(0, 4);
    const lang = first(doc.language);
    const label = `${author} - ${doc.title ?? doc.identifier}${year ? ` (${year})` : ''}${lang ? ` [${lang}]` : ''}`;
    const infoUrl = `${BASE}/details/${encodeURIComponent(doc.identifier)}`;

    if (mediaType === 'audiobook') {
      const quality = AUDIO_QUALITIES[str(this.s.audioQuality, '64')] ?? AUDIO_QUALITIES['64']!;
      const tracks = files.filter((f) => f.format === quality);
      if (!tracks.length) return [];
      const size = tracks.reduce((sum, f) => sum + num(f.size), 0);
      const id = encodeURIComponent(doc.identifier);
      return [
        {
          guid: `ia-${doc.identifier}-${quality}`,
          title: `${label} (audiobook mp3, ${tracks.length} tracks)`,
          protocol: 'ddl',
          // archive.org zips the chosen track format on the fly; the importer extracts it.
          downloadUrl: `${BASE}/compress/${id}/formats=${encodeURIComponent(quality)}&file=/${id}.zip`,
          infoUrl,
          size: size || undefined,
          format: 'mp3',
          language: lang,
          mediaType: 'audiobook',
        },
      ];
    }

    const wanted = str(this.s.ebookFormats, 'epub,pdf').split(',').map((f) => f.trim()).filter((f) => f in EBOOK_FORMATS);
    const releases: Release[] = [];
    for (const key of wanted) {
      const { iaFormat, ext } = EBOOK_FORMATS[key]!;
      const file = files.find((f) => f.format === iaFormat);
      if (!file) continue;
      // EPUBs derived from page scans are OCR output; say so in the name.
      const ocr = ext === 'epub' && file.source === 'derivative' ? ', OCR' : '';
      releases.push({
        guid: `ia-${doc.identifier}-${ext}`,
        title: `${label} (${ext}${ocr})`,
        protocol: 'ddl',
        downloadUrl: `${BASE}/download/${encodeURIComponent(doc.identifier)}/${file.name.split('/').map(encodeURIComponent).join('/')}`,
        infoUrl,
        size: num(file.size) || undefined,
        format: ext,
        language: lang,
        mediaType: 'ebook',
      });
    }
    return releases;
  }

  async test() {
    try {
      const docs = await this.searchDocs(`title:(frankenstein) AND mediatype:(texts) AND NOT access-restricted-item:true AND ${this.scopeQuery()}`, 1);
      return { ok: docs.length > 0, message: docs.length ? 'archive.org reachable' : 'archive.org answered, but returned no results' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async search(q: SearchQuery) {
    const rows = Math.min(50, Math.max(1, num(this.s.maxResults, 12)));
    const docs = await this.searchDocs(this.buildQuery(q), rows);
    const nested = await mapLimit(docs, 4, (d) => this.releasesFor(d, q.mediaType));
    return nested.flat();
  }
}

export default definePlugin({
  id: 'internetarchive',
  name: 'Internet Archive',
  version: '0.1.0',
  description: 'Public-domain library scans and openly licensed audiobooks from archive.org (DDL).',
  setup(ctx) {
    ctx.registerIndexer({
      type: 'internetarchive',
      name: 'Internet Archive',
      description:
        'Searches public-domain library collections (American/Canadian libraries, Gutenberg, LibriVox, …) and items with a Creative Commons or public-domain license. Borrow-only lending-library books are never included. Needs a DDL download client.',
      docsUrl: 'https://archive.org/developers/',
      fields: [
        {
          key: 'mediaTypes',
          label: 'Use for',
          type: 'select',
          default: 'both',
          options: [
            { value: 'both', label: 'Ebooks & audiobooks' },
            { value: 'ebook', label: 'Ebooks only' },
            { value: 'audiobook', label: 'Audiobooks only' },
          ],
        },
        {
          key: 'ebookFormats',
          label: 'Ebook formats',
          type: 'select',
          default: 'epub,pdf',
          options: [
            { value: 'epub,pdf', label: 'EPUB and PDF' },
            { value: 'epub', label: 'EPUB only' },
            { value: 'pdf', label: 'PDF only (scans, best fidelity)' },
          ],
          help: 'EPUBs made from page scans are OCR output and can contain errors; PDFs keep the original page images.',
        },
        {
          key: 'audioQuality',
          label: 'Audio quality',
          type: 'select',
          default: '64',
          options: [
            { value: '64', label: '64 kbps MP3 (smallest)' },
            { value: '128', label: '128 kbps MP3' },
            { value: 'vbr', label: 'VBR MP3 (best)' },
          ],
        },
        { key: 'maxResults', label: 'Items per search', type: 'number', default: 12, advanced: true, help: 'Each item needs one extra request to list its files.' },
        {
          key: 'extraCollections',
          label: 'Extra collections',
          type: 'text',
          advanced: true,
          placeholder: 'my_collection',
          help: 'Comma-separated archive.org collection ids to include in addition to the built-in public-domain ones. Only add collections you are allowed to download from.',
        },
      ],
      create: (settings) => new InternetArchive(settings),
    });
  },
});
