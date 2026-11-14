import { definePlugin, type MetadataBook } from '@inkarr/sdk';

interface OlDoc {
  key: string;
  title: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  language?: string[];
  number_of_pages_median?: number;
}

const UA = { 'User-Agent': 'Inkarr/0.1 (https://github.com/eliasthecactus/inkarr)' };

function toBook(d: OlDoc): MetadataBook {
  return {
    foreignId: d.key,
    title: d.subtitle ? `${d.title}: ${d.subtitle}` : d.title,
    author: d.author_name?.[0] ?? 'Unknown',
    year: d.first_publish_year ?? null,
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    isbn: (d.isbn ?? []).slice(0, 10),
    language: d.language?.[0] ?? null,
    pageCount: d.number_of_pages_median ?? null,
  };
}

export default definePlugin({
  id: 'openlibrary',
  name: 'Open Library',
  version: '0.1.0',
  description: 'Book metadata and covers from openlibrary.org.',
  setup(ctx) {
    ctx.registerMetadataProvider({
      id: 'openlibrary',
      name: 'Open Library',
      async search(term) {
        const url = new URL('https://openlibrary.org/search.json');
        const isbn = term.replace(/[-\s]/g, '');
        if (/^(97[89])?\d{9}[\dX]$/i.test(isbn)) url.searchParams.set('isbn', isbn);
        else url.searchParams.set('q', term);
        url.searchParams.set('limit', '30');
        url.searchParams.set('fields', 'key,title,subtitle,author_name,first_publish_year,cover_i,isbn,language,number_of_pages_median');
        const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`Open Library HTTP ${res.status}`);
        const data = (await res.json()) as { docs: OlDoc[] };
        return data.docs.map(toBook);
      },
      async get(foreignId) {
        const res = await fetch(`https://openlibrary.org${foreignId}.json`, { headers: UA });
        if (!res.ok) return null;
        const w = (await res.json()) as { title: string; description?: string | { value: string }; covers?: number[] };
        return {
          foreignId,
          title: w.title,
          author: 'Unknown',
          description: typeof w.description === 'string' ? w.description : w.description?.value ?? null,
          coverUrl: w.covers?.[0] ? `https://covers.openlibrary.org/b/id/${w.covers[0]}-L.jpg` : null,
        };
      },
    });
    ctx.log.debug('Open Library metadata provider ready');
  },
});
