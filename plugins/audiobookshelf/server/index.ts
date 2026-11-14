import { definePlugin, str, trimSlash, type Connection, type ImportEvent, type Settings } from '@inkarr/sdk';

interface AbsLibrary {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
}

class Audiobookshelf implements Connection {
  private base: string;

  constructor(private s: Settings) {
    this.base = trimSlash(str(s.url));
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}/api${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${str(this.s.apiToken)}`, ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Audiobookshelf ${path} → HTTP ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async libraries(): Promise<AbsLibrary[]> {
    const data = await this.api<{ libraries: AbsLibrary[] }>('/libraries');
    const wanted = str(this.s.libraryIds).split(',').map((s) => s.trim()).filter(Boolean);
    const books = data.libraries.filter((l) => l.mediaType === 'book');
    return wanted.length ? books.filter((l) => wanted.includes(l.id) || wanted.includes(l.name)) : books;
  }

  async test() {
    try {
      const libs = await this.libraries();
      return { ok: true, message: libs.length ? `Will scan: ${libs.map((l) => l.name).join(', ')}` : 'Connected, but no matching book libraries found' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async onImport(e: ImportEvent) {
    const scope = str(this.s.trigger, 'audiobook');
    if (scope !== 'both' && scope !== e.book.mediaType) return;
    for (const lib of await this.libraries()) await this.api(`/libraries/${lib.id}/scan`, { method: 'POST' });
  }
}

export default definePlugin({
  id: 'audiobookshelf',
  name: 'Audiobookshelf',
  version: '0.1.0',
  description: 'Triggers an Audiobookshelf library scan after an import.',
  setup(ctx) {
    ctx.registerConnection({
      type: 'audiobookshelf',
      name: 'Audiobookshelf',
      description: 'Create an API token in Audiobookshelf → Settings → API Keys (or use a user token).',
      docsUrl: 'https://api.audiobookshelf.org',
      fields: [
        { key: 'url', label: 'URL', type: 'url', required: true, placeholder: 'http://audiobookshelf:13378' },
        { key: 'apiToken', label: 'API token', type: 'password', required: true },
        { key: 'libraryIds', label: 'Libraries', type: 'text', placeholder: 'Audiobooks', help: 'Names or IDs, comma-separated. Empty = all book libraries.' },
        {
          key: 'trigger',
          label: 'Scan after',
          type: 'select',
          default: 'audiobook',
          options: [
            { value: 'audiobook', label: 'Audiobook imports' },
            { value: 'ebook', label: 'Ebook imports' },
            { value: 'both', label: 'Both' },
          ],
        },
      ],
      create: (settings) => new Audiobookshelf(settings),
    });
  },
});
