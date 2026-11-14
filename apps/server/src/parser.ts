import { AUDIO_EXTENSIONS, EBOOK_EXTENSIONS, type BookRef, type MediaType, type Release } from '@inkarr/sdk';
import { formatList, type CoreSettings } from './settings-defaults.ts';

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'der', 'die', 'das', 'und', 'le', 'la', 'les', 'el', 'de']);
const AUDIO_HINTS = /\b(audiobook|audio ?book|unabridged|abridged|narrated|read by|hörbuch|horbuch|m4b|mp3|aac|flac|kbps)\b/i;

export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter((t) => t && !STOPWORDS.has(t));
}

export function detectFormat(title: string): string | undefined {
  const all = [...EBOOK_EXTENSIONS, ...AUDIO_EXTENSIONS];
  const m = normalize(title).split(' ').find((t) => all.includes(t));
  return m;
}

export function detectMediaType(release: Release): MediaType | undefined {
  if (release.mediaType) return release.mediaType;
  const fmt = release.format ?? detectFormat(release.title);
  if (fmt && AUDIO_EXTENSIONS.includes(fmt)) return 'audiobook';
  if (fmt && EBOOK_EXTENSIONS.includes(fmt)) return 'ebook';
  if (AUDIO_HINTS.test(release.title)) return 'audiobook';
  return undefined;
}

export interface ScoredRelease extends Release {
  score: number;
  rejections: string[];
  detectedFormat?: string;
  detectedMediaType?: MediaType;
}

/** Main title without subtitle / series suffix, which release names often drop. */
function mainTitle(title: string): string {
  return title.split(/[:(\[]/)[0]!.trim() || title;
}

export function titleMatches(book: BookRef, releaseTitle: string): { title: number; author: boolean } {
  const rel = new Set(tokens(releaseTitle));
  const want = tokens(mainTitle(book.title));
  const hit = want.filter((t) => rel.has(t)).length;
  const title = want.length ? hit / want.length : 0;
  const authorTokens = tokens(book.author).filter((t) => t.length > 1);
  const last = authorTokens[authorTokens.length - 1];
  const author = !!last && rel.has(last);
  return { title, author };
}

export function scoreRelease(book: BookRef, release: Release, settings: CoreSettings): ScoredRelease {
  const rejections: string[] = [];
  const detectedFormat = (release.format ?? detectFormat(release.title))?.toLowerCase();
  const detectedMediaType = detectMediaType(release);
  const allowed = formatList(book.mediaType === 'audiobook' ? settings.audiobookFormats : settings.ebookFormats);

  if (detectedMediaType && detectedMediaType !== book.mediaType) rejections.push(`Looks like an ${detectedMediaType}, wanted ${book.mediaType}`);
  if (detectedFormat && allowed.length && !allowed.includes(detectedFormat) && book.mediaType === 'ebook') rejections.push(`Format ${detectedFormat} is not allowed`);

  const { title, author } = titleMatches(book, release.title);
  const titleLen = tokens(mainTitle(book.title)).length;
  if (title < 0.8) rejections.push(`Title mismatch (${Math.round(title * 100)}% of words found)`);
  if (!author && titleLen <= 2) rejections.push('Author not found in release name (title too generic to match alone)');

  if (release.protocol === 'torrent' && release.seeders != null && release.seeders < settings.minSeeders) {
    rejections.push(`Not enough seeders (${release.seeders} < ${settings.minSeeders})`);
  }
  if (settings.language && release.language && normalize(release.language) !== normalize(settings.language)) {
    rejections.push(`Language ${release.language} is not ${settings.language}`);
  }

  let score = 0;
  score += Math.round(title * 100);
  if (author) score += 50;
  if (detectedFormat) {
    const idx = allowed.indexOf(detectedFormat);
    score += idx >= 0 ? (allowed.length - idx) * 20 : 0;
  }
  if (release.protocol === 'torrent') score += Math.min(60, Math.round(Math.log2((release.seeders ?? 0) + 1) * 10));
  else score += 30; // DDL has no seeders; give it a fixed, reasonable weight

  return { ...release, score, rejections, detectedFormat, detectedMediaType };
}

export function rankReleases(book: BookRef, releases: Release[], settings: CoreSettings): ScoredRelease[] {
  const seen = new Set<string>();
  return releases
    .filter((r) => {
      const key = `${r.indexerId}:${r.guid}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => scoreRelease(book, r, settings))
    .sort((a, b) => (a.rejections.length === 0 ? 0 : 1) - (b.rejections.length === 0 ? 0 : 1) || b.score - a.score);
}
