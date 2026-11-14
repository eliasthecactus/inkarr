import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayAuthor } from '../../../plugins/internetarchive/server/index.ts';

test('library-catalog author names are turned into display names', () => {
  assert.equal(displayAuthor('Shelley, Mary Wollstonecraft, 1797-1851'), 'Mary Wollstonecraft Shelley');
  assert.equal(displayAuthor('[Shelley, Mary Wollstonecraft], 1797-1851'), 'Mary Wollstonecraft Shelley');
  assert.equal(displayAuthor('Austen, Jane, 1775-1817'), 'Jane Austen');
  assert.equal(displayAuthor('Mary Wollstonecraft Shelley'), 'Mary Wollstonecraft Shelley');
  assert.equal(displayAuthor('Twain, Mark, 1835-1910, author'), 'Mark Twain');
});
