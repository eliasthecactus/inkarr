import { XMLParser } from 'fast-xml-parser';
import { definePlugin, str, trimSlash, type Indexer, type MediaType, type Release, type SearchQuery, type Settings } from '@inkarr/sdk';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });
const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

class Torznab implements Indexer {
  protocol = 'torrent' as const;
  mediaTypes: MediaType[];
  private base: string;

  constructor(private s: Settings) {
    const mt = str(s.mediaTypes, 'both');
    this.mediaTypes = mt === 'both' ? ['ebook', 'audiobook'] : [mt as MediaType];
    // Accept both ".../api" and the base URL Prowlarr shows.
    this.base = trimSlash(str(s.url)).replace(/\/api$/, '');
  }

  private categories(mediaType?: MediaType): string {
    if (mediaType === 'audiobook') return str(this.s.audiobookCategories, '3030');
    if (mediaType === 'ebook') return str(this.s.ebookCategories, '7000,7020,8010');
    return [str(this.s.ebookCategories, '7000,7020,8010'), str(this.s.audiobookCategories, '3030')].join(',');
  }

  private async fetchFeed(params: Record<string, string>): Promise<Release[]> {
    const url = new URL(`${this.base}/api`);
    for (const [k, v] of Object.entries({ ...params, apikey: str(this.s.apiKey) })) if (v) url.searchParams.set(k, v);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const xml = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = parser.parse(xml);
    if (doc.error) throw new Error(doc.error['@description'] ?? 'indexer error');
    const items = asArray(doc.rss?.channel?.item);
    const audioCats = str(this.s.audiobookCategories, '3030').split(',');
    return items.map((item: any): Release => {
      const attrs: Record<string, string> = {};
      for (const a of asArray(item['torznab:attr'])) attrs[(a as any)['@name']] = String((a as any)['@value']);
      const cats = asArray(item.category).map(String).concat(attrs.category ? [attrs.category] : []);
      const enclosure = asArray(item.enclosure)[0] as any;
      const downloadUrl = attrs.magneturl || enclosure?.['@url'] || item.link;
      return {
        guid: String(item.guid?.['#text'] ?? item.guid ?? downloadUrl),
        title: String(item.title),
        protocol: 'torrent',
        downloadUrl,
        infoUrl: typeof item.comments === 'string' ? item.comments : undefined,
        size: Number(attrs.size ?? item.size ?? enclosure?.['@length']) || undefined,
        seeders: attrs.seeders != null ? Number(attrs.seeders) : undefined,
        leechers: attrs.peers != null ? Math.max(0, Number(attrs.peers) - Number(attrs.seeders ?? 0)) : undefined,
        publishDate: item.pubDate,
        mediaType: cats.some((c) => audioCats.includes(c) || c.startsWith('3')) ? 'audiobook' : cats.some((c) => /^[78]/.test(c)) ? 'ebook' : undefined,
      };
    });
  }

  async test() {
    try {
      const res = await fetch(`${this.base}/api?t=caps&apikey=${encodeURIComponent(str(this.s.apiKey))}`, { signal: AbortSignal.timeout(15_000) });
      const doc = parser.parse(await res.text());
      if (doc.error) return { ok: false, message: doc.error['@description'] };
      if (!doc.caps) return { ok: false, message: `Not a Torznab endpoint (HTTP ${res.status})` };
      return { ok: true, message: `Connected to ${doc.caps.server?.['@title'] ?? 'Torznab indexer'}` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  search(q: SearchQuery) {
    return this.fetchFeed({ t: 'search', q: q.term, cat: this.categories(q.mediaType), limit: '100' });
  }

  recent() {
    return this.fetchFeed({ t: 'search', cat: this.categories(), limit: '100' });
  }
}

export default definePlugin({
  id: 'torznab',
  name: 'Torznab',
  version: '0.1.0',
  description: 'Search any Torznab-compatible indexer, e.g. those configured in Prowlarr or Jackett.',
  setup(ctx) {
    ctx.registerIndexer({
      type: 'torznab',
      name: 'Torznab',
      description: 'In Prowlarr, copy an indexer\'s Torznab URL (or add Inkarr as a generic Torznab app).',
      docsUrl: 'https://torznab.github.io/spec-1.3-draft/',
      fields: [
        { key: 'url', label: 'URL', type: 'url', required: true, placeholder: 'http://prowlarr:9696/1/' },
        { key: 'apiKey', label: 'API key', type: 'password' },
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
        { key: 'ebookCategories', label: 'Ebook categories', type: 'text', default: '7000,7020,8010', advanced: true },
        { key: 'audiobookCategories', label: 'Audiobook categories', type: 'text', default: '3030', advanced: true },
      ],
      create: (settings) => new Torznab(settings),
    });
  },
});
