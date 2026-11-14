import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, History, RefreshCw, Search, Trash2 } from 'lucide-react';
import {
  api,
  Badge,
  Button,
  EmptyState,
  ErrorBox,
  formatBytes,
  formatEta,
  MediaIcon,
  Modal,
  PageContent,
  PageToolbar,
  ProgressBar,
  relativeTime,
  Spinner,
  ToolbarButton,
  useApi,
  useApiMutation,
  useToast,
} from '@inkarr/web-sdk';
import type { Book, HistoryItem, QueueItem } from './types.ts';

const tone = (s: string) => (s === 'failed' ? 'danger' : s === 'warning' ? 'warning' : s === 'completed' || s === 'importing' ? 'success' : 'info');

export function QueueBadge() {
  const q = useApi<QueueItem[]>('/queue', { refetchInterval: 5_000 });
  const n = q.data?.filter((i) => i.status !== 'failed').length ?? 0;
  return n ? <span className="nav-count">{n}</span> : null;
}

export function QueuePage() {
  const queue = useApi<QueueItem[]>('/queue', { refetchInterval: 3_000 });
  const [removing, setRemoving] = useState<QueueItem | null>(null);
  const [deleteData, setDeleteData] = useState(false);
  const remove = useApiMutation((id: number) => api.del(`/queue/${id}?deleteData=${deleteData}`), ['/queue', '/books']);
  const refresh = useApiMutation(() => api.post('/system/tasks/refresh-downloads/run'), []);

  return (
    <>
      <PageToolbar>
        <ToolbarButton icon={RefreshCw} label="Refresh" spinning={queue.isFetching} onClick={() => refresh.mutate(undefined, { onSuccess: () => setTimeout(() => queue.refetch(), 800) })} />
      </PageToolbar>
      <PageContent wide>
        <ErrorBox error={queue.error} />
        {queue.isLoading ? (
          <Spinner />
        ) : !queue.data?.length ? (
          <EmptyState icon={Activity} title="Queue is empty">Grabbed releases show up here while they download and import.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Release</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th style={{ width: 160 }}>Progress</th>
                  <th className="num">Size</th>
                  <th className="num">ETA</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.data.map((q) => (
                  <tr key={q.id}>
                    <td>
                      {q.book ? (
                        <Link to={`/book/${q.book.id}`}>
                          <MediaIcon type={q.book.mediaType} /> {q.book.title}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="title-cell">
                      {q.releaseTitle}
                      {q.message && <div className={q.status === 'failed' || q.status === 'warning' ? 'level-warn' : 'muted'} style={{ fontSize: 12, marginTop: 3 }}>{q.message}</div>}
                    </td>
                    <td>
                      {q.clientName} <Badge>{q.protocol}</Badge>
                    </td>
                    <td>
                      <Badge tone={tone(q.status)}>{q.status}</Badge>
                    </td>
                    <td>
                      <ProgressBar value={q.progress} tone={q.status === 'failed' ? 'danger' : q.status === 'warning' ? 'warning' : q.progress >= 1 ? 'success' : 'info'} />
                      <span className="muted" style={{ fontSize: 11 }}>{Math.round(q.progress * 100)}%</span>
                    </td>
                    <td className="num">{formatBytes(q.size)}</td>
                    <td className="num">{formatEta(q.eta)}</td>
                    <td className="actions">
                      <button className="icon-button" title="Remove" onClick={() => setRemoving(q)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>
      {removing && (
        <Modal
          size="sm"
          title="Remove from queue"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <div className="spacer" />
              <Button onClick={() => setRemoving(null)}>Cancel</Button>
              <Button kind="danger" loading={remove.isPending} onClick={() => remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}>
                Remove
              </Button>
            </>
          }
        >
          <p>Remove “{removing.releaseTitle}” from the queue? The book goes back to wanted.</p>
          <label className="checkbox-row">
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} /> Also delete it in the download client (incl. data)
            </span>
          </label>
        </Modal>
      )}
    </>
  );
}

export function HistoryPage() {
  const history = useApi<HistoryItem[]>('/history', { refetchInterval: 10_000 });
  return (
    <>
      <PageToolbar>
        <ToolbarButton icon={RefreshCw} label="Refresh" spinning={history.isFetching} onClick={() => history.refetch()} />
      </PageToolbar>
      <PageContent wide>
        {history.isLoading ? (
          <Spinner />
        ) : !history.data?.length ? (
          <EmptyState icon={History} title="No history yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Book</th>
                  <th>Details</th>
                  <th className="num">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <Badge tone={h.event === 'imported' ? 'success' : h.event === 'failed' ? 'danger' : h.event === 'grabbed' ? 'info' : 'default'}>{h.event}</Badge>
                    </td>
                    <td>{h.book ? <Link to={`/book/${h.book.id}`}>{h.book.title}</Link> : <span className="muted">deleted</span>}</td>
                    <td className="title-cell">
                      {h.title}
                      {h.data && <div className="muted" style={{ fontSize: 12 }}>{Object.entries(h.data).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>}
                    </td>
                    <td className="num muted" title={new Date(h.date).toLocaleString()}>{relativeTime(h.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>
    </>
  );
}

export function WantedPage() {
  const books = useApi<Book[]>('/books', { refetchInterval: 15_000 });
  const [toast, showToast] = useToast();
  const searchAll = useApiMutation(() => api.post('/system/tasks/search-wanted/run'), []);
  const searchOne = useApiMutation((id: number) => api.post<{ grabbed: string | null }>(`/books/${id}/auto-search`), ['/books', '/queue']);
  const wanted = (books.data ?? []).filter((b) => b.monitored && b.status === 'wanted');

  return (
    <>
      <PageToolbar>
        <ToolbarButton icon={Search} label="Search all" onClick={() => searchAll.mutate(undefined, { onSuccess: () => showToast('Searching all wanted books…', 'success') })} />
      </PageToolbar>
      <PageContent wide>
        {books.isLoading ? (
          <Spinner />
        ) : !wanted.length ? (
          <EmptyState title="Nothing missing">Every monitored book has been downloaded or is on its way.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Type</th>
                  <th className="num">Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {wanted.map((b) => (
                  <tr key={b.id}>
                    <td className="title-cell">
                      <Link to={`/book/${b.id}`}>{b.title}</Link>
                    </td>
                    <td>{b.author}</td>
                    <td>
                      <Badge>
                        <MediaIcon type={b.mediaType} /> {b.mediaType}
                      </Badge>
                    </td>
                    <td className="num muted">{relativeTime(b.addedAt)}</td>
                    <td className="actions">
                      <button
                        className="icon-button"
                        title="Automatic search"
                        disabled={searchOne.isPending && searchOne.variables === b.id}
                        onClick={() =>
                          searchOne.mutate(b.id, {
                            onSuccess: (r) => showToast(r.grabbed ? `Grabbed ${r.grabbed}` : `Nothing acceptable found for ${b.title}`, r.grabbed ? 'success' : 'info'),
                            onError: (e) => showToast(e.message, 'danger'),
                          })
                        }
                      >
                        {searchOne.isPending && searchOne.variables === b.id ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>
      {toast}
    </>
  );
}
