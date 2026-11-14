import { definePlugin, mapRemotePath, str, trimSlash, type DownloadClient, type DownloadItem, type DownloadStatus, type Release, type Settings } from '@inkarr/sdk';

interface TrTorrent {
  id: number;
  hashString: string;
  name: string;
  status: number;
  percentDone: number;
  totalSize: number;
  eta: number;
  downloadDir: string;
  error: number;
  errorString: string;
  labels?: string[];
  leftUntilDone: number;
}

const FIELDS = ['id', 'hashString', 'name', 'status', 'percentDone', 'totalSize', 'eta', 'downloadDir', 'error', 'errorString', 'labels', 'leftUntilDone'];

/** Transmission status codes: 0 stopped, 1/2 checking, 3 queued, 4 downloading, 5 queued to seed, 6 seeding. */
function mapStatus(t: TrTorrent): DownloadStatus {
  // error 3 = local error (disk, permissions); 1/2 are tracker warnings/errors that don't stop webseeds or DHT.
  if (t.error === 3) return 'failed';
  if (t.percentDone >= 1 && t.leftUntilDone === 0) return 'completed';
  switch (t.status) {
    case 0:
      return 'paused';
    case 1:
    case 3:
      return 'queued';
    default:
      return t.error ? 'warning' : 'downloading';
  }
}

export class Transmission implements DownloadClient {
  protocols = ['torrent' as const];
  private sessionId = '';
  private endpoint: string;

  constructor(private s: Settings) {
    const base = trimSlash(str(s.url, 'http://localhost:9091'));
    // Accept the bare host, the web UI URL, or the full RPC URL.
    this.endpoint = /\/rpc$/.test(base) ? base : `${base.replace(/\/transmission(\/web)?$/, '')}${str(s.rpcPath, '/transmission/rpc')}`;
  }

  private async rpc<T>(method: string, args: Record<string, unknown> = {}, retry = true): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Transmission-Session-Id': this.sessionId };
    if (this.s.username || this.s.password) {
      headers.Authorization = `Basic ${Buffer.from(`${str(this.s.username)}:${str(this.s.password)}`).toString('base64')}`;
    }
    const res = await fetch(this.endpoint, { method: 'POST', headers, body: JSON.stringify({ method, arguments: args }), signal: AbortSignal.timeout(30_000) });
    // Transmission's CSRF protection: the first call returns 409 with the session id to use.
    if (res.status === 409 && retry) {
      this.sessionId = res.headers.get('x-transmission-session-id') ?? '';
      return this.rpc(method, args, false);
    }
    if (res.status === 401) throw new Error('Transmission rejected the username/password');
    if (!res.ok) throw new Error(`Transmission ${method} → HTTP ${res.status}`);
    const body = (await res.json()) as { result: string; arguments: T };
    if (body.result !== 'success') throw new Error(`Transmission ${method}: ${body.result}`);
    return body.arguments;
  }

  async test() {
    try {
      const s = await this.rpc<{ version: string; 'rpc-version': number }>('session-get', { fields: ['version', 'rpc-version'] });
      return { ok: true, message: `Transmission ${s.version} (RPC ${s['rpc-version']})` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg === 'fetch failed' ? `Cannot reach Transmission at ${this.endpoint} — is remote access (RPC) enabled?` : msg };
    }
  }

  async add(release: Release, opts: { tag: string; mediaType: string }) {
    const dir = str(opts.mediaType === 'audiobook' ? this.s.audiobookDir : this.s.ebookDir) || str(this.s.ebookDir);
    const args: Record<string, unknown> = {
      paused: this.s.startPaused === true,
      labels: ['inkarr', opts.tag], // RPC 16+ (Transmission 3.0); ignored by older versions
      ...(dir && { 'download-dir': dir }),
    };
    if (release.downloadUrl.startsWith('magnet:')) {
      args.filename = release.downloadUrl;
    } else {
      // Fetch the .torrent ourselves (indexer links may only work from Inkarr and may redirect to a magnet).
      const res = await fetch(release.downloadUrl, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location?.startsWith('magnet:')) {
        args.filename = location;
      } else {
        const final = res.status >= 300 && res.status < 400 && location ? await fetch(new URL(location, release.downloadUrl), { signal: AbortSignal.timeout(30_000) }) : res;
        if (!final.ok) throw new Error(`could not fetch torrent file (HTTP ${final.status})`);
        args.metainfo = Buffer.from(await final.arrayBuffer()).toString('base64');
      }
    }
    const out = await this.rpc<{ 'torrent-added'?: TrTorrent; 'torrent-duplicate'?: TrTorrent }>('torrent-add', args);
    const t = out['torrent-added'] ?? out['torrent-duplicate'];
    if (!t?.hashString) throw new Error('Transmission did not return the added torrent');
    // The info hash is stable and works on every Transmission version, labels or not.
    return t.hashString.toLowerCase();
  }

  async getItems(ids: string[]): Promise<DownloadItem[]> {
    if (!ids.length) return [];
    const { torrents } = await this.rpc<{ torrents: TrTorrent[] }>('torrent-get', { ids, fields: FIELDS });
    return torrents.map((t) => {
      const status = mapStatus(t);
      return {
        id: t.hashString.toLowerCase(),
        name: t.name,
        status,
        progress: t.percentDone,
        size: t.totalSize,
        eta: t.eta > 0 ? t.eta : undefined,
        outputPath: mapRemotePath(`${trimSlash(t.downloadDir)}/${t.name}`, this.s.remotePath, this.s.localPath),
        message: t.error ? t.errorString : undefined,
      };
    });
  }

  async remove(id: string, deleteData: boolean) {
    await this.rpc('torrent-remove', { ids: [id], 'delete-local-data': deleteData });
  }
}

export default definePlugin({
  id: 'transmission',
  name: 'Transmission',
  version: '0.1.0',
  description: 'Send torrents to Transmission and track them by info hash.',
  setup(ctx) {
    ctx.registerDownloadClient({
      type: 'transmission',
      name: 'Transmission',
      description: 'Uses the Transmission RPC API (2.x, 3.x, 4.x). Enable remote access in Transmission’s preferences (or the transmission-daemon settings).',
      docsUrl: 'https://github.com/transmission/transmission/blob/main/docs/rpc-spec.md',
      fields: [
        { key: 'url', label: 'URL', type: 'url', required: true, default: 'http://localhost:9091', placeholder: 'http://transmission:9091' },
        { key: 'username', label: 'Username', type: 'text' },
        { key: 'password', label: 'Password', type: 'password' },
        { key: 'ebookDir', label: 'Download folder (ebooks)', type: 'path', help: 'As Transmission sees it. Empty = Transmission’s default download folder.' },
        { key: 'audiobookDir', label: 'Download folder (audiobooks)', type: 'path', help: 'Empty = same as ebooks.' },
        { key: 'startPaused', label: 'Add paused', type: 'boolean', default: false, advanced: true },
        { key: 'rpcPath', label: 'RPC path', type: 'text', default: '/transmission/rpc', advanced: true, help: 'Only change this if you set rpc-url in Transmission.' },
        { key: 'remotePath', label: 'Remote path', type: 'path', advanced: true, help: 'Path as Transmission sees it, e.g. /downloads.' },
        { key: 'localPath', label: 'Local path', type: 'path', advanced: true, help: 'The same folder as Inkarr sees it.' },
      ],
      create: (settings) => new Transmission(settings),
    });
  },
});
