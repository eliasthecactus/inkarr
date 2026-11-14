import type { MetadataBook } from '@inkarr/sdk';

/** Fold for comparison: no accents, no punctuation, lowercase. */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const nfc = (s: string | null | undefined) => (typeof s === 'string' ? s.normalize('NFC').replace(/\s+/g, ' ').trim() : s);

/** Providers sometimes send decomposed Unicode ("u" + combining "¨"); store composed text. */
export function cleanBook(b: MetadataBook): MetadataBook {
  return {
    ...b,
    title: nfc(b.title) || b.title,
    author: nfc(b.author) || b.author,
    description: nfc(b.description) ?? null,
    series: nfc(b.series) ?? null,
  };
}

export function isIsbn(term: string): boolean {
  return /^(97[89])?\d{9}[\dX]$/i.test(term.replace(/[-\s]/g, ''));
}

/**
 * Re-rank provider results by how well they match what the user typed:
 * exact titles first, then titles containing every word, then the provider's
 * own order. Comparison ignores accents, punctuation and spaces, so
 * "die hütte", "Die Hutte" and a damaged "Die Hu tte" all line up.
 */
export function rankResults(term: string, results: MetadataBook[]): MetadataBook[] {
  if (isIsbn(term)) return results;
  const q = fold(term);
  const qCompact = q.replace(/ /g, '');
  const qTokens = q.split(' ').filter(Boolean);
  const score = (b: MetadataBook) => {
    const title = fold(b.title.split(':')[0]!);
    const full = fold(`${b.title} ${b.author}`);
    const titleCompact = title.replace(/ /g, '');
    if (title === q || titleCompact === qCompact) return 100;
    if (title.startsWith(q) || titleCompact.startsWith(qCompact)) return 80;
    const words = new Set(full.split(' '));
    const hit = qTokens.filter((t) => words.has(t)).length / (qTokens.length || 1);
    if (hit === 1) return 60;
    if (full.replace(/ /g, '').includes(qCompact)) return 55;
    return Math.round(hit * 40);
  };
  return results
    .map((b, i) => ({ b, i, s: score(b) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.b);
}
