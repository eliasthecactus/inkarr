import { definePlugin, str, type Connection, type Settings } from '@inkarr/sdk';

class Webhook implements Connection {
  constructor(private s: Settings) {}

  private async send(eventType: string, payload: unknown) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'Inkarr' };
    if (this.s.authHeader) headers.Authorization = str(this.s.authHeader);
    const res = await fetch(str(this.s.url), {
      method: str(this.s.method, 'POST'),
      headers,
      body: JSON.stringify({ eventType, instance: 'inkarr', date: new Date().toISOString(), ...(payload as object) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
  }

  async test() {
    try {
      await this.send('test', { message: 'Hello from Inkarr' });
      return { ok: true, message: 'Webhook delivered' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  onGrab = (e: unknown) => this.send('grab', e);
  onImport = (e: unknown) => this.send('import', e);
}

export default definePlugin({
  id: 'webhook',
  name: 'Webhook',
  version: '0.1.0',
  description: 'POST a JSON payload on grab and import — glue for Kavita, Home Assistant, n8n, ntfy, ...',
  setup(ctx) {
    ctx.registerConnection({
      type: 'webhook',
      name: 'Webhook',
      fields: [
        { key: 'url', label: 'URL', type: 'url', required: true },
        { key: 'method', label: 'Method', type: 'select', default: 'POST', options: [{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }] },
        { key: 'authHeader', label: 'Authorization header', type: 'password', advanced: true },
      ],
      create: (settings) => new Webhook(settings),
    });
  },
});
