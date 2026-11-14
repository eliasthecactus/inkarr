import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRemotePath } from '@inkarr/sdk';

// parser.ts only depends on the SDK + settings types, import it without booting the db.
const { scoreRelease, detectFormat, normalize, rankReleases } = await import('../src/parser.ts');
import { defaultSettings } from '../src/settings-defaults.ts';

const book = { title: 'Frankenstein: Or, The Modern Prometheus', author: 'Mary Shelley', mediaType: 'ebook' as const };
const torrent = (title: string, seeders = 10) => ({ guid: title, title, protocol: 'torrent' as const, downloadUrl: 'magnet:?', seeders });

test('normalize strips accents and punctuation', () => {
  assert.equal(normalize('Les Misérables — Hugo!'), 'les miserables hugo');
});

test('detects formats from release names', () => {
  assert.equal(detectFormat('Mary Shelley - Frankenstein (retail) [EPUB]'), 'epub');
  assert.equal(detectFormat('Frankenstein Unabridged M4B 64kbps'), 'm4b');
  assert.equal(detectFormat('Frankenstein'), undefined);
});

test('accepts a matching ebook release', () => {
  const r = scoreRelease(book, torrent('Mary Shelley - Frankenstein (epub)'), defaultSettings);
  assert.deepEqual(r.rejections, []);
});

test('rejects audiobooks when an ebook is wanted', () => {
  const r = scoreRelease(book, torrent('Mary Shelley - Frankenstein [Unabridged] m4b'), defaultSettings);
  assert.ok(r.rejections.some((x) => x.includes('audiobook')));
});

test('rejects title mismatches and low seeders', () => {
  const r = scoreRelease(book, torrent('Bram Stoker - Dracula epub', 0), defaultSettings);
  assert.ok(r.rejections.some((x) => x.startsWith('Title mismatch')));
  assert.ok(r.rejections.some((x) => x.startsWith('Not enough seeders')));
});

test('prefers epub over pdf', () => {
  const ranked = rankReleases(book, [torrent('Mary Shelley - Frankenstein pdf'), torrent('Mary Shelley - Frankenstein epub')], defaultSettings);
  assert.equal(ranked[0]!.detectedFormat, 'epub');
});

test('maps remote paths', () => {
  assert.equal(mapRemotePath('/downloads/x/y.epub', '/downloads', '/data/torrents'), '/data/torrents/x/y.epub');
  assert.equal(mapRemotePath('/other/y.epub', '/downloads', '/data/torrents'), '/other/y.epub');
});
