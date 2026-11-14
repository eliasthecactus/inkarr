import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBook, fold, rankResults } from '../src/metadata-rank.ts';

const book = (title: string, author = 'X') => ({ foreignId: title, title, author });

test('fold ignores accents, decomposed umlauts and punctuation', () => {
  assert.equal(fold('Die Hütte'), 'die hutte');
  assert.equal(fold('Die Hütte'), 'die hutte');
  assert.equal(fold('Straße!'), 'strasse');
});

test('cleanBook composes decomposed unicode', () => {
  const b = cleanBook(book('Die Hütte', 'Jürgen  Müller'));
  assert.equal(b.title, 'Die Hütte');
  assert.equal(b.title.length, 9);
  assert.equal(b.author, 'Jürgen Müller');
});

test('exact title matches outrank popular partial matches', () => {
  const ranked = rankResults('die hütte', [book('Star Wars - The Hutt Gambit'), book('The long Arctic night'), book('Die Hütte', 'W. P. Young')]);
  assert.equal(ranked[0]!.author, 'W. P. Young');
});

test('a title damaged by a stray space still matches when spaces are ignored', () => {
  const ranked = rankResults('die hütte', [book('Hütten der Welt'), book('Die Hu tte', 'William P. Young')]);
  assert.equal(ranked[0]!.author, 'William P. Young');
});

test('ISBN searches keep the provider order', () => {
  const list = [book('B'), book('A')];
  assert.deepEqual(rankResults('978-3-548-28403-3', list), list);
});
