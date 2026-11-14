import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { definePlugin, num, str, type DownloadClient, type DownloadItem, type Release, type Settings } from '@inkarr/sdk';

interface Job extends DownloadItem {
  url: string;
  controller: AbortController;
  folder: string;
  received: number;
}

function filenameFrom(res: Response, url: string, fallback: string): string {
  const cd = res.headers.get('content-disposition') ?? '';
  const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i)?.[1];
  const plain = cd.match(/filename="?([^";]+)"?/i)?.[1];
  let name = star ? decodeURIComponent(star.replace(/"/g, '')) : plain;
  if (!name) {
    try {
      name = decodeURIComponent(new URL(res.url || url).pathname.split('/').pop() ?? '');
    } catch {
      /* ignore */
    }
  }
  return (name || fallback).replace(/[\\/:*?"<>|]/g, '_');
}

class DirectDownloader implements DownloadClient {
  protocols = ['ddl' as const];
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private active = 0;

  constructor(private s: Settings, private dataDir: string) {}

  private get folder() {
    return str(this.s.folder) || join(this.dataDir, 'downloads');
  }

  async test() {
    try {
      await mkdir(this.folder, { recursive: true });
      return { ok: true, message: `Downloads go to ${this.folder}` };
    } catch (err) {
      return { ok: false, message: `cannot write to ${this.folder}: ${(err as Error).message}` };
    }
  }

  async add(release: Release, opts: { tag: string }) {
    const job: Job = {
      id: opts.tag,
      name: release.title,
      status: 'queued',
      progress: 0,
      url: release.downloadUrl,
      controller: new AbortController(),
      folder: join(this.folder, opts.tag),
      received: 0,
      size: release.size,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.pump();
    return job.id;
  }

  private pump() {
    const max = Math.max(1, num(this.s.maxConcurrent, 2));
    while (this.active < max && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      this.run(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async run(job: Job) {
    job.status = 'downloading';
    try {
      await mkdir(job.folder, { recursive: true });
      const res = await fetch(job.url, {
        signal: job.controller.signal,
        headers: { 'User-Agent': str(this.s.userAgent) || 'Inkarr/0.1 (+https://github.com/eliasthecactus/inkarr)' },
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('text/html')) throw new Error('link returned a web page, not a file — use the JDownloader client for hoster links');
      const total = Number(res.headers.get('content-length')) || job.size || 0;
      job.size = total || undefined;
      const file = join(job.folder, filenameFrom(res, job.url, `${job.id}.bin`));
      const body = Readable.fromWeb(res.body as any);
      body.on('data', (chunk: Buffer) => {
        job.received += chunk.length;
        job.progress = total ? Math.min(0.999, job.received / total) : 0;
      });
      await pipeline(body, createWriteStream(file));
      job.progress = 1;
      job.status = 'completed';
      job.outputPath = job.folder;
    } catch (err) {
      job.status = 'failed';
      job.message = err instanceof Error ? err.message : String(err);
    }
  }

  async getItems(ids: string[]) {
    // Jobs live in memory; anything unknown after a restart is reported failed
    // unless its folder already holds a finished file (handled on import).
    return ids.map((id) => {
      const job = this.jobs.get(id);
      if (!job) return { id, name: id, status: 'failed' as const, progress: 0, message: 'Lost after restart — search again' };
      const { url, controller, folder, received, ...item } = job;
      return item;
    });
  }

  async remove(id: string, deleteData: boolean) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.controller.abort();
    this.jobs.delete(id);
    if (deleteData) await rm(job.folder, { recursive: true, force: true });
  }
}

export default definePlugin({
  id: 'direct-download',
  name: 'Direct Download',
  version: '0.1.0',
  description: 'Downloads direct file links (DDL) itself — no extra software needed.',
  setup(ctx) {
    ctx.registerDownloadClient({
      type: 'direct',
      name: 'Direct Download (built-in)',
      description: 'Fetches direct file URLs over HTTP(S). For file hosters with captchas or wait times, use JDownloader.',
      fields: [
        { key: 'folder', label: 'Download folder', type: 'path', placeholder: '<data>/downloads', help: 'Temporary folder; files are imported into your library from here.' },
        { key: 'maxConcurrent', label: 'Parallel downloads', type: 'number', default: 2 },
        { key: 'userAgent', label: 'User agent', type: 'text', advanced: true },
      ],
      create: (settings, c) => new DirectDownloader(settings, c.dataDir),
    });
  },
});
