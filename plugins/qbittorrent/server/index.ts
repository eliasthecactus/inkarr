import { definePlugin, mapRemotePath, str, trimSlash, type DownloadClient, type DownloadItem, type DownloadStatus, type Release, type Settings } from '@inkarr/sdk';

interface QbTorrent {
  hash: string;
  name: string;
  state: string;
  progress: number;
  size: number;
  eta: number;
  tags: string;
  category: string;
  content_path: string;
  save_path: string;
}

function mapState(state: string): DownloadStatus {
  switch (state) {
    case 'error':
    case 'missingFiles':
      return 'failed';
    case 'pausedDL':
    case 'stoppedDL':
      return 'paused';
    case 'queuedDL':
    case 'metaDL':
    case 'forcedMetaDL':
    case 'allocating':
      return 'queued';
    case 'uploading':
    case 'stalledUP':
    case 'pausedUP':
    case 'stoppedUP':
    case 'queuedUP':
    case 'forcedUP':
    case 'checkingUP':
      return 'completed';
    default:
      return 'downloading';
  }
}

class QBittorrent implements DownloadClient {
  protocols = ['torrent' as const];
  private cookie = '';
  private base: string;

  constructor(private s: Settings) {
    this.base = trimSlash(str(s.url, 'http://localhost:8080'));
  }

  private async login() {
    const res = await fetch(`${this.base}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: this.base },
      body: new URLSearchParams({ username: str(this.s.username), password: str(this.s.password) }),
    });
    const text = await res.text();
    if (!res.ok || text.trim() === 'Fails.') throw new Error(`login failed (${res.status} ${text.trim()})`);
    const sid = res.headers.get('set-cookie')?.match(/SID=[^;]+/)?.[0];
    this.cookie = sid ?? '';
  }

  private async request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    if (!this.cookie && (this.s.username || this.s.password)) await this.login();
    const res = await fetch(`${this.base}/api/v2${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Cookie: this.cookie, Referer: this.base },
    });
    if (res.status === 403 && retry) {
      await this.login();
      return this.request(path, init, false);
    }
    if (!res.ok) throw new Error(`qBittorrent ${path} → ${res.status} ${await res.text()}`);
    return res;
  }

  async test() {
    try {
      const version = await (await this.request('/app/version')).text();
      const api = await (await this.request('/app/webapiVersion')).text();
      return { ok: true, message: `qBittorrent ${version} (Web API ${api})` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg === 'fetch failed' ? `Cannot reach qBittorrent at ${this.base} — is the Web UI enabled and the URL right?` : msg };
    }
  }

  async add(release: Release, opts: { tag: string; mediaType: string }) {
    const category = str(opts.mediaType === 'audiobook' ? this.s.audiobookCategory : this.s.category) || str(this.s.category, 'inkarr');
    const form = new FormData();
    form.set('category', category);
    form.set('tags', `inkarr,${opts.tag}`);
    if (this.s.savePath) form.set('savepath', str(this.s.savePath));
    if (this.s.startPaused) form.set('paused', 'true'), form.set('stopped', 'true');

    let url = release.downloadUrl;
    if (!url.startsWith('magnet:')) {
      // Fetch the .torrent ourselves: indexer links are often only reachable
      // from Inkarr, and some redirect to a magnet link.
      const res = await fetch(url, { redirect: 'manual' });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        if (location.startsWith('magnet:')) url = location;
        else {
          const follow = await fetch(location);
          form.set('torrents', new Blob([await follow.arrayBuffer()], { type: 'application/x-bittorrent' }), 'release.torrent');
          url = '';
        }
      } else if (res.ok) {
        form.set('torrents', new Blob([await res.arrayBuffer()], { type: 'application/x-bittorrent' }), 'release.torrent');
        url = '';
      } else throw new Error(`could not fetch torrent file (${res.status})`);
    }
    if (url) form.set('urls', url);
    // qBittorrent only creates categories on demand when they exist; make sure it does.
    await this.request('/torrents/createCategory', { method: 'POST', body: new URLSearchParams({ category }) }).catch(() => {});
    const res = await this.request('/torrents/add', { method: 'POST', body: form });
    const text = (await res.text()).trim();
    if (text === 'Fails.') throw new Error('qBittorrent rejected the torrent');
    return opts.tag;
  }

  async getItems(ids: string[]): Promise<DownloadItem[]> {
    if (!ids.length) return [];
    const list = (await (await this.request('/torrents/info?tag=inkarr')).json()) as QbTorrent[];
    const out: DownloadItem[] = [];
    for (const t of list) {
      const tags = t.tags.split(',').map((x) => x.trim());
      const id = ids.find((i) => tags.includes(i));
      if (!id) continue;
      const status = mapState(t.state);
      out.push({
        id,
        name: t.name,
        status: t.progress >= 1 && status !== 'failed' ? 'completed' : status,
        progress: t.progress,
        size: t.size,
        eta: t.eta > 0 && t.eta < 8640000 ? t.eta : undefined,
        outputPath: mapRemotePath(t.content_path || t.save_path, this.s.remotePath, this.s.localPath),
        message: status === 'failed' ? `torrent state: ${t.state}` : undefined,
      });
    }
    return out;
  }

  async remove(id: string, deleteData: boolean) {
    const list = (await (await this.request(`/torrents/info?tag=${encodeURIComponent(id)}`)).json()) as QbTorrent[];
    if (!list.length) return;
    await this.request('/torrents/delete', {
      method: 'POST',
      body: new URLSearchParams({ hashes: list.map((t) => t.hash).join('|'), deleteFiles: String(deleteData) }),
    });
  }
}

export default definePlugin({
  id: 'qbittorrent',
  name: 'qBittorrent',
  version: '0.1.0',
  description: 'Send torrents to qBittorrent and track them by tag.',
  setup(ctx) {
    ctx.registerDownloadClient({
      type: 'qbittorrent',
      name: 'qBittorrent',
      description: 'Uses the qBittorrent Web API (v4.1+).',
      docsUrl: 'https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)',
      fields: [
        { key: 'url', label: 'URL', type: 'url', required: true, default: 'http://localhost:8080', placeholder: 'http://qbittorrent:8080' },
        { key: 'username', label: 'Username', type: 'text', default: 'admin' },
        { key: 'password', label: 'Password', type: 'password' },
        { key: 'category', label: 'Category (ebooks)', type: 'text', default: 'inkarr-books', help: 'Inkarr only looks at torrents tagged by itself, the category just keeps things tidy.' },
        { key: 'audiobookCategory', label: 'Category (audiobooks)', type: 'text', default: 'inkarr-audiobooks' },
        { key: 'savePath', label: 'Save path', type: 'path', advanced: true, help: 'Leave empty to use the category / default path.' },
        { key: 'startPaused', label: 'Add paused', type: 'boolean', default: false, advanced: true },
        { key: 'remotePath', label: 'Remote path', type: 'path', advanced: true, help: 'Path as qBittorrent sees it, e.g. /downloads (when running in another container).' },
        { key: 'localPath', label: 'Local path', type: 'path', advanced: true, help: 'The same folder as Inkarr sees it, e.g. /data/torrents.' },
      ],
      create: (settings) => new QBittorrent(settings),
    });
  },
});
