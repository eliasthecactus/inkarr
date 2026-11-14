import { definePlugin, str, type MetadataBook, type Settings } from '@inkarr/sdk';

interface Volume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    language?: string;
    pageCount?: number;
  };
}

function toBook(v: Volume): MetadataBook {
  const i = v.volumeInfo;
  const year = Number(i.publishedDate?.slice(0, 4));
  const thumb = i.imageLinks?.thumbnail ?? i.imageLinks?.smallThumbnail;
  return {
    foreignId: `gb:${v.id}`,
    title: i.subtitle ? `${i.title}: ${i.subtitle}` : i.title,
    author: i.authors?.join(', ') || 'Unknown',
    year: Number.isFinite(year) && year > 0 ? year : null,
    // Google serves http thumbnails; force https and a larger zoom level.
    coverUrl: thumb ? thumb.replace(/^http:/, 'https:').replace('&edge=curl', '').replace('zoom=5', 'zoom=1') : null,
    description: i.description ?? null,
    isbn: (i.industryIdentifiers ?? []).filter((x) => x.type.startsWith('ISBN')).map((x) => x.identifier),
    language: i.language ?? null,
    pageCount: i.pageCount ?? null,
  };
}

async function call(path: string, params: Record<string, string>, settings: Settings) {
  const url = new URL(`https://www.googleapis.com/books/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const key = str(settings.apiKey).trim();
  if (key) url.searchParams.set('key', key);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (res.status === 429) {
    throw new Error(key ? 'Google Books quota exceeded for this API key' : 'Google Books rejects anonymous requests (rate limit). Add a free API key under Settings → General → Metadata sources.');
  }
  if (!res.ok) throw new Error(`Google Books HTTP ${res.status}`);
  return res.json();
}

export default definePlugin({
  id: 'googlebooks',
  name: 'Google Books',
  version: '0.1.0',
  description: 'Book metadata from Google Books.',
  setup(ctx) {
    ctx.registerMetadataProvider({
      id: 'googlebooks',
      name: 'Google Books',
      description: 'Good coverage of German and other non-English editions. Needs a free API key in practice (Google Cloud console → enable "Books API" → create an API key).',
      fields: [
        { key: 'apiKey', label: 'API key', type: 'password', help: 'console.cloud.google.com → APIs & Services → enable “Books API” → Credentials → Create API key.' },
        { key: 'language', label: 'Prefer language', type: 'text', placeholder: 'de', help: 'Two-letter code. Restricts results to that language. Empty = any.' },
      ],
      bookUrl: (foreignId) => `https://books.google.com/books?id=${encodeURIComponent(foreignId.replace(/^gb:/, ''))}`,
      async search(term, settings) {
        const isbn = term.replace(/[-\s]/g, '');
        const q = /^(97[89])?\d{9}[\dX]$/i.test(isbn) ? `isbn:${isbn}` : term;
        const params: Record<string, string> = { q, maxResults: '30', printType: 'books' };
        const lang = str(settings.language).trim();
        if (lang && !q.startsWith('isbn:')) params.langRestrict = lang;
        const data = (await call('volumes', params, settings)) as { items?: Volume[] };
        return (data.items ?? []).map(toBook);
      },
      async get(foreignId, settings) {
        const data = (await call(`volumes/${encodeURIComponent(foreignId.replace(/^gb:/, ''))}`, {}, settings)) as Volume;
        return data?.volumeInfo ? toBook(data) : null;
      },
    });
  },
});
