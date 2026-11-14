import { definePlugin, type Indexer, type Release, type SearchQuery } from '@inkarr/sdk';

interface LvBook {
  id: string;
  title: string;
  language: string;
  url_zip_file?: string;
  url_librivox?: string;
  totaltimesecs?: number;
  authors?: { first_name: string; last_name: string }[];
}

class LibriVox implements Indexer {
  protocol = 'ddl' as const;
  mediaTypes = ['audiobook' as const];

  private async query(params: Record<string, string>): Promise<Release[]> {
    const url = new URL('https://librivox.org/api/feed/audiobooks');
    url.searchParams.set('format', 'json');
    url.searchParams.set('extended', '1');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) return []; // LibriVox answers 404 for "no results"
    if (!res.ok) throw new Error(`LibriVox HTTP ${res.status}`);
    const data = (await res.json()) as { books?: LvBook[] };
    return (data.books ?? [])
      .filter((b) => b.url_zip_file)
      .map((b) => {
        const author = (b.authors ?? []).map((a) => `${a.first_name} ${a.last_name}`.trim()).join(', ') || 'Unknown';
        return {
          guid: `librivox-${b.id}`,
          title: `${author} - ${b.title} [${b.language}] (audiobook mp3)`,
          protocol: 'ddl' as const,
          downloadUrl: b.url_zip_file!,
          infoUrl: b.url_librivox,
          format: 'mp3',
          language: b.language,
          mediaType: 'audiobook' as const,
        };
      });
  }

  async test() {
    try {
      await this.query({ title: '^dracula', limit: '1' });
      return { ok: true, message: 'LibriVox reachable' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async search(q: SearchQuery) {
    // The API only filters by title ("^" = starts with); free text is not supported.
    const title = (q.book?.title ?? q.term).split(/[:;,(]/)[0]!.trim();
    return this.query({ title: `^${title}`, limit: '25' });
  }
}

export default definePlugin({
  id: 'librivox',
  name: 'LibriVox',
  version: '0.1.0',
  description: 'Free public-domain audiobooks read by volunteers (DDL, zip of MP3s).',
  setup(ctx) {
    ctx.registerIndexer({
      type: 'librivox',
      name: 'LibriVox',
      description: 'Public-domain audiobooks. Downloads are zip files which Inkarr extracts on import.',
      docsUrl: 'https://librivox.org/api/info',
      fields: [],
      create: () => new LibriVox(),
    });
  },
});
