import { XMLParser } from 'fast-xml-parser';
import { definePlugin, str, trimSlash, type Indexer, type Release, type SearchQuery, type Settings } from '@inkarr/sdk';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });
const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** "Shelley, Mary Wollstonecraft" -> "Mary Wollstonecraft Shelley" */
const displayName = (n: string) => (n.includes(',') ? n.split(',').reverse().map((s) => s.trim()).join(' ') : n);

/**
 * Uses gutenberg.org's own OPDS search feed (fast and official) and its
 * stable per-book download URLs.
 */
class Gutenberg implements Indexer {
  protocol = 'ddl' as const;
  mediaTypes = ['ebook' as const];
  private base: string;

  constructor(private s: Settings) {
    this.base = trimSlash(str(s.url, 'https://www.gutenberg.org'));
  }

  private async query(term: string): Promise<Release[]> {
    const url = new URL(`${this.base}/ebooks/search.opds/`);
    url.searchParams.set('query', term);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Inkarr/0.1 (+https://github.com/eliasthecactus/inkarr)' } });
    if (!res.ok) throw new Error(`gutenberg.org HTTP ${res.status}`);
    const feed = parser.parse(await res.text()).feed;
    const formats = str(this.s.formats, 'epub').split(',').map((f) => f.trim()).filter(Boolean);
    const releases: Release[] = [];
    for (const entry of asArray<any>(feed?.entry)) {
      const id = String(entry.id ?? '').match(/ebooks\/(\d+)/)?.[1];
      if (!id) continue; // navigation entries ("sort by…") have no book id
      const title = String(entry.title?.['#text'] ?? entry.title ?? '').trim();
      const author = displayName(String(entry.content?.['#text'] ?? entry.content ?? 'Unknown').trim());
      for (const format of formats) {
        const path = format === 'azw3' ? 'kf8.images' : format === 'epub' ? 'epub3.images' : null;
        if (!path) continue;
        releases.push({
          guid: `gutenberg-${id}-${format}`,
          title: `${author} - ${title} (${format})`,
          protocol: 'ddl',
          downloadUrl: `${this.base}/ebooks/${id}.${path}`,
          infoUrl: `${this.base}/ebooks/${id}`,
          format,
          mediaType: 'ebook',
        });
      }
    }
    return releases;
  }

  async test() {
    try {
      const r = await this.query('pride and prejudice');
      return { ok: r.length > 0, message: r.length ? `gutenberg.org reachable (${r.length} test results)` : 'No results — is the URL right?' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  search(q: SearchQuery) {
    return this.query(q.book ? `${q.book.title.split(':')[0]} ${q.book.author.split(' ').pop()}` : q.term);
  }
}

export default definePlugin({
  id: 'gutenberg',
  name: 'Project Gutenberg',
  version: '0.1.0',
  description: '70,000+ public-domain ebooks from gutenberg.org, downloaded directly (DDL).',
  setup(ctx) {
    ctx.registerIndexer({
      type: 'gutenberg',
      name: 'Project Gutenberg',
      description: 'Free public-domain ebooks via gutenberg.org’s OPDS catalog. Needs a DDL download client (Direct Download or JDownloader).',
      docsUrl: 'https://www.gutenberg.org/ebooks/offline_catalogs.html',
      fields: [
        {
          key: 'formats',
          label: 'Formats',
          type: 'select',
          default: 'epub',
          options: [
            { value: 'epub', label: 'EPUB' },
            { value: 'azw3', label: 'Kindle (AZW3)' },
            { value: 'epub,azw3', label: 'Both' },
          ],
        },
        { key: 'url', label: 'Mirror URL', type: 'url', default: 'https://www.gutenberg.org', advanced: true },
      ],
      create: (settings) => new Gutenberg(settings),
    });
  },
});
