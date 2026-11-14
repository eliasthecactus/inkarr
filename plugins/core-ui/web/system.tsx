import { Play, Puzzle, RefreshCw } from 'lucide-react';
import { api, Badge, ErrorBox, PageContent, PageToolbar, relativeTime, Section, Spinner, ToolbarButton, useApi, useApiMutation } from '@inkarr/web-sdk';

export function StatusPage() {
  const status = useApi<{ version: string; startedAt: number; dataDir: string; node: string; platform: string; authEnabled: boolean }>('/system/status');
  const counts = {
    indexer: useApi<unknown[]>('/providers/indexer'),
    downloadClient: useApi<unknown[]>('/providers/downloadClient'),
  };
  const s = status.data;
  return (
    <PageContent>
      <ErrorBox error={status.error} />
      {counts.indexer.data?.length === 0 && <div className="alert alert-warning">No indexers configured — add one under Settings → Indexers.</div>}
      {counts.downloadClient.data?.length === 0 && <div className="alert alert-warning">No download clients configured — add one under Settings → Download Clients.</div>}
      {!s?.authEnabled && s && <div className="alert alert-info">API authentication is off. Set INKARR_API_KEY if Inkarr is reachable from outside your LAN.</div>}
      <Section title="About">
        {s ? (
          <dl className="kv">
            <dt>Version</dt>
            <dd>{s.version}</dd>
            <dt>Runtime</dt>
            <dd>Node {s.node} on {s.platform}</dd>
            <dt>Data directory</dt>
            <dd>{s.dataDir}</dd>
            <dt>Uptime</dt>
            <dd>started {relativeTime(s.startedAt)}</dd>
            <dt>Project</dt>
            <dd><a href="https://github.com/eliasthecactus/inkarr" target="_blank" rel="noreferrer">github.com/eliasthecactus/inkarr</a></dd>
          </dl>
        ) : (
          <Spinner />
        )}
      </Section>
    </PageContent>
  );
}

interface Task { id: string; name: string; pluginId: string; intervalSeconds: number; lastRun?: number; lastDuration?: number; lastError?: string; running: boolean; nextRun?: number }

export function TasksPage() {
  const tasks = useApi<Task[]>('/system/tasks', { refetchInterval: 3_000 });
  const run = useApiMutation((id: string) => api.post(`/system/tasks/${id}/run`), ['/system/tasks']);
  return (
    <PageContent>
      <Section title="Scheduled tasks">
        {tasks.isLoading ? (
          <Spinner />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Plugin</th>
                  <th>Interval</th>
                  <th>Last run</th>
                  <th>Duration</th>
                  <th>Next run</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tasks.data?.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.name}
                      {t.lastError && <div className="level-error" style={{ fontSize: 12 }}>{t.lastError}</div>}
                    </td>
                    <td><Badge>{t.pluginId}</Badge></td>
                    <td>{t.intervalSeconds ? (t.intervalSeconds >= 60 ? `${Math.round(t.intervalSeconds / 60)} min` : `${t.intervalSeconds} s`) : 'manual'}</td>
                    <td className="muted">{relativeTime(t.lastRun)}</td>
                    <td className="muted">{t.lastDuration != null ? `${t.lastDuration} ms` : '—'}</td>
                    <td className="muted">{t.nextRun ? relativeTime(t.nextRun) : '—'}</td>
                    <td className="actions">
                      <button className="icon-button" title="Run now" disabled={t.running} onClick={() => run.mutate(t.id)}>
                        {t.running ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </PageContent>
  );
}

interface PluginInfo { id: string; name: string; version: string; description?: string; hasServer: boolean; hasWeb: boolean; error?: string; enabled: boolean; contributes: string[] }

export function PluginsPage() {
  const plugins = useApi<PluginInfo[]>('/system/plugins');
  const toggle = useApiMutation(({ id, enabled }: { id: string; enabled: boolean }) => api.put(`/system/plugins/${id}`, { enabled }), ['/system/plugins']);
  return (
    <PageContent>
      <div className="alert alert-info">
        <Puzzle size={16} /> Everything in Inkarr is a plugin — indexers, download clients, connections, metadata and even these pages. Enabling or disabling one takes effect after a restart.
      </div>
      <ErrorBox error={plugins.error ?? toggle.error} />
      {toggle.isSuccess && <div className="alert alert-warning">Restart Inkarr to apply plugin changes.</div>}
      {plugins.isLoading ? (
        <Spinner />
      ) : (
        <div className="card-grid">
          {plugins.data?.map((p) => (
            <div key={p.id} className="provider-card" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
                <div className="provider-card-name">{p.name}</div>
                <div className="spacer" />
                {p.id !== 'core-ui' && (
                  <label className="switch" style={{ marginTop: 0 }} title={p.enabled ? 'Disable' : 'Enable'}>
                    <input type="checkbox" checked={p.enabled} onChange={(e) => toggle.mutate({ id: p.id, enabled: e.target.checked })} />
                    <span className="switch-slider" />
                  </label>
                )}
              </div>
              {p.description && <div className="provider-card-desc">{p.description}</div>}
              <div className="provider-card-tags">
                <Badge>v{p.version}</Badge>
                {p.hasServer && <Badge tone="info">server</Badge>}
                {p.hasWeb && <Badge tone="accent">ui</Badge>}
                {p.error && p.error !== 'disabled' && <Badge tone="danger" title={p.error}>error</Badge>}
                {p.contributes.map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContent>
  );
}

interface LogEntry { time: number; level: string; source: string; message: string; data?: unknown }

export function LogsPage() {
  const logs = useApi<LogEntry[]>('/system/logs', { refetchInterval: 5_000 });
  return (
    <>
      <PageToolbar>
        <ToolbarButton icon={RefreshCw} label="Refresh" spinning={logs.isFetching} onClick={() => logs.refetch()} />
      </PageToolbar>
      <PageContent wide>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {logs.data?.map((l, i) => (
                <tr key={i} className="log-line">
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(l.time).toLocaleTimeString()}</td>
                  <td className={`level-${l.level}`}>{l.level}</td>
                  <td className="muted">{l.source}</td>
                  <td>
                    {l.message}
                    {l.data != null && <span className="muted"> {typeof l.data === 'string' ? l.data : JSON.stringify(l.data)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageContent>
    </>
  );
}
