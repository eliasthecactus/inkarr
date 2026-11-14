import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname } from 'node:path';
import { definePlugin, EBOOK_EXTENSIONS, str, type Connection, type ImportEvent, type Settings } from '@inkarr/sdk';

const run = promisify(execFile);

class Calibre implements Connection {
  constructor(private s: Settings) {}

  private args(extra: string[]): string[] {
    const args = [...extra, '--with-library', str(this.s.library)];
    if (this.s.username) args.push('--username', str(this.s.username));
    if (this.s.password) args.push('--password', str(this.s.password));
    return args;
  }

  private bin() {
    return str(this.s.calibredb) || 'calibredb';
  }

  async test() {
    try {
      await run(this.bin(), this.args(['list', '--limit', '1', '--fields', 'title']), { timeout: 30_000 });
      return { ok: true, message: 'calibredb can read the library' };
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      if (e.code === 'ENOENT') return { ok: false, message: `"${this.bin()}" not found. Install Calibre or set the calibredb path.` };
      return { ok: false, message: e.stderr?.trim() || e.message };
    }
  }

  async onImport(e: ImportEvent) {
    if (e.book.mediaType !== 'ebook') return;
    const files = e.files.filter((f) => EBOOK_EXTENSIONS.includes(extname(f).slice(1).toLowerCase()));
    if (!files.length) return;
    // Calibre merges multiple formats of the same book when added together.
    const extra = ['add', ...files, '--authors', e.book.author, '--title', e.book.title];
    if (this.s.duplicates) extra.push('--duplicates');
    if (this.s.tags) extra.push('--tags', str(this.s.tags));
    await run(this.bin(), this.args(extra), { timeout: 120_000 });
  }
}

export default definePlugin({
  id: 'calibre',
  name: 'Calibre',
  version: '0.1.0',
  description: 'Adds imported ebooks to a Calibre library via calibredb.',
  setup(ctx) {
    ctx.registerConnection({
      type: 'calibre',
      name: 'Calibre',
      description:
        'Runs calibredb add. Library can be a local folder (Calibre must be closed) or a Calibre content server URL like http://calibre:8080/#books. For Calibre-Web-Automated, point your library root at its ingest folder instead.',
      docsUrl: 'https://manual.calibre-ebook.com/generated/en/calibredb.html',
      fields: [
        { key: 'library', label: 'Library', type: 'text', required: true, placeholder: '/books/calibre or http://calibre:8080/#books' },
        { key: 'username', label: 'Username', type: 'text', help: 'Only for content server URLs.' },
        { key: 'password', label: 'Password', type: 'password' },
        { key: 'tags', label: 'Tags', type: 'text', placeholder: 'inkarr', help: 'Comma-separated tags added to new books.' },
        { key: 'duplicates', label: 'Allow duplicates', type: 'boolean', default: false, advanced: true },
        { key: 'calibredb', label: 'calibredb path', type: 'path', default: 'calibredb', advanced: true, help: 'macOS: /Applications/calibre.app/Contents/MacOS/calibredb' },
      ],
      create: (settings) => new Calibre(settings),
    });
  },
});
