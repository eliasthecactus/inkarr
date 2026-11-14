import { definePlugin, mapRemotePath, str, trimSlash, type DownloadClient, type DownloadItem, type Release, type Settings } from '@inkarr/sdk';

/**
 * Talks to JDownloader 2's local API ("Deprecated API" in Settings → Advanced
 * → RemoteAPI: DeprecatedApiEnabled, default port 3128). Each query parameter
 * is a JSON-encoded positional argument.
 */
class JDownloader implements DownloadClient {
  protocols = ['ddl' as const];
  private base: string;

  constructor(private s: Settings) {
    this.base = trimSlash(str(s.url, 'http://localhost:3128'));
  }

  private async call<T>(path: string, ...args: unknown[]): Promise<T> {
    const qs = args.map((a) => encodeURIComponent(JSON.stringify(a))).join('&');
    const res = await fetch(`${this.base}${path}${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error(`JDownloader ${path} → HTTP ${res.status}`);
    const text = await res.text();
    if (!text) return undefined as T;
    const json = JSON.parse(text);
    return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
  }

  async test() {
    try {
      const version = await this.call<number>('/jd/version');
      return { ok: true, message: `JDownloader reachable (build ${version})` };
    } catch (err) {
      return { ok: false, message: `${(err as Error).message}. Is the local API enabled (Advanced settings → RemoteAPI.DeprecatedApiEnabled)?` };
    }
  }

  async add(release: Release, opts: { tag: string }) {
    const dest = str(this.s.folder);
    await this.call('/linkgrabberv2/addLinks', {
      links: release.downloadUrl,
      packageName: `${opts.tag} ${release.title}`.slice(0, 200),
      autostart: true,
      overwritePackagizerRules: true,
      ...(dest && { destinationFolder: `${trimSlash(dest)}/${opts.tag}` }),
    });
    return opts.tag;
  }

  async getItems(ids: string[]): Promise<DownloadItem[]> {
    if (!ids.length) return [];
    type Pkg = { uuid: number; name: string; bytesLoaded?: number; bytesTotal?: number; finished?: boolean; saveTo?: string; status?: string; eta?: number };
    const query = { bytesLoaded: true, bytesTotal: true, finished: true, saveTo: true, status: true, eta: true, maxResults: -1, startAt: 0 };
    const [downloading, grabbing] = await Promise.all([
      this.call<Pkg[]>('/downloadsV2/queryPackages', query),
      this.call<Pkg[]>('/linkgrabberv2/queryPackages', { saveTo: true, bytesTotal: true, maxResults: -1, startAt: 0 }).catch(() => [] as Pkg[]),
    ]);
    const out: DownloadItem[] = [];
    for (const id of ids) {
      const match = (p: Pkg) => p.name === id || p.name.startsWith(`${id} `);
      const d = (downloading ?? []).find(match);
      if (d) {
        const total = d.bytesTotal ?? 0;
        const failed = /offline|failed|error/i.test(d.status ?? '');
        out.push({
          id,
          name: d.name.slice(id.length + 1),
          status: d.finished ? 'completed' : failed ? 'failed' : 'downloading',
          progress: d.finished ? 1 : total ? (d.bytesLoaded ?? 0) / total : 0,
          size: total || undefined,
          eta: d.eta && d.eta > 0 ? d.eta : undefined,
          outputPath: d.saveTo ? mapRemotePath(d.saveTo, this.s.remotePath, this.s.localPath) : undefined,
          message: failed ? d.status : undefined,
        });
        continue;
      }
      const g = (grabbing ?? []).find(match);
      if (g) out.push({ id, name: g.name.slice(id.length + 1), status: 'queued', progress: 0, message: 'Waiting in LinkGrabber (link check / captcha?)' });
    }
    return out;
  }

  async remove(id: string) {
    type Pkg = { uuid: number; name: string };
    const pkgs = await this.call<Pkg[]>('/downloadsV2/queryPackages', { maxResults: -1, startAt: 0 });
    const ids = (pkgs ?? []).filter((p) => p.name.startsWith(`${id} `)).map((p) => p.uuid);
    if (ids.length) await this.call('/downloadsV2/removeLinks', [], ids);
  }
}

export default definePlugin({
  id: 'jdownloader',
  name: 'JDownloader',
  version: '0.1.0',
  description: 'Hand DDL / file-hoster links to JDownloader 2.',
  setup(ctx) {
    ctx.registerDownloadClient({
      type: 'jdownloader',
      name: 'JDownloader 2',
      description: 'Requires the local API: Settings → Advanced Settings → RemoteAPI: DeprecatedApiEnabled = true (port 3128).',
      docsUrl: 'https://jdownloader.org',
      fields: [
        { key: 'url', label: 'URL', type: 'url', required: true, default: 'http://localhost:3128' },
        { key: 'folder', label: 'Download folder', type: 'path', help: 'Base folder as JDownloader sees it. Each grab gets its own sub-folder.' },
        { key: 'remotePath', label: 'Remote path', type: 'path', advanced: true },
        { key: 'localPath', label: 'Local path', type: 'path', advanced: true },
      ],
      create: (settings) => new JDownloader(settings),
    });
  },
});
