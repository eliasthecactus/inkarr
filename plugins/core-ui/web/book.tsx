import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Bookmark, BookmarkX, Download, ExternalLink, Magnet, RefreshCw, Search, Trash2, UserSearch, Globe } from 'lucide-react';
import {
  api,
  Badge,
  Button,
  Cover,
  ErrorBox,
  formatBytes,
  MediaIcon,
  Modal,
  PageContent,
  PageToolbar,
  relativeTime,
  Section,
  Spinner,
  ToolbarButton,
  ToolbarSeparator,
  useApi,
  useApiMutation,
  useBookPanels,
  useToast,
} from '@inkarr/web-sdk';
import { statusLabel, statusTone, type Book, type HistoryItem, type ScoredRelease } from './types.ts';

function InteractiveSearch({ book, onGrabbed }: { book: Book; onGrabbed: (title: string) => void }) {
  const [data, setData] = useState<{ releases: ScoredRelease[]; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [grabbing, setGrabbing] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.post(`/books/${book.id}/search`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const grab = async (r: ScoredRelease) => {
    setGrabbing(r.guid);
    try {
      await api.post('/grab', { bookId: book.id, release: r });
      onGrabbed(r.title);
    } catch (err) {
      setError(err);
    } finally {
      setGrabbing(null);
    }
  };

  if (!data && !loading)
    return (
      <div className="empty-state" style={{ padding: 32 }}>
        <Button kind="primary" icon={UserSearch} onClick={run}>
          Search all indexers
        </Button>
        <span className="muted">Shows every release with its score and why it would be rejected automatically.</span>
        <ErrorBox error={error} />
      </div>
    );
  if (loading) return <Spinner />;

  return (
    <>
      <ErrorBox error={error} />
      {data!.errors.map((e) => (
        <div key={e} className="alert alert-warning">
          <AlertTriangle size={16} /> {e}
        </div>
      ))}
      {data!.releases.length === 0 ? (
        <div className="empty-state" style={{ padding: 32 }}>
          <h3>No releases found</h3>
          <span className="muted">Check that an indexer supporting {book.mediaType}s is enabled.</span>
          <Button icon={RefreshCw} onClick={run}>Search again</Button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Indexer</th>
                <th>Title</th>
                <th className="num">Size</th>
                <th className="num">Peers</th>
                <th>Format</th>
                <th className="num">Score</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data!.releases.map((r) => (
                <tr key={`${r.indexerId}-${r.guid}`} className={r.rejections.length ? 'rejected' : undefined}>
                  <td>
                    <Badge tone={r.protocol === 'torrent' ? 'accent' : 'info'}>
                      {r.protocol === 'torrent' ? <Magnet size={11} /> : <Globe size={11} />} {r.protocol.toUpperCase()}
                    </Badge>
                  </td>
                  <td>{r.indexerName}</td>
                  <td className="title-cell">
                    {r.infoUrl ? (
                      <a href={r.infoUrl} target="_blank" rel="noreferrer">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
                  </td>
                  <td className="num">{formatBytes(r.size)}</td>
                  <td className="num">{r.protocol === 'torrent' ? `${r.seeders ?? '?'} / ${r.leechers ?? '?'}` : '—'}</td>
                  <td>{r.detectedFormat ? <Badge>{r.detectedFormat}</Badge> : <span className="muted">?</span>}</td>
                  <td className="num">{r.score}</td>
                  <td className="actions">
                    {r.rejections.length > 0 && (
                      <span className="icon-button" title={r.rejections.join('\n')} style={{ color: 'var(--danger)' }}>
                        <AlertTriangle size={16} />
                      </span>
                    )}
                    <button className="icon-button" title="Download" disabled={grabbing != null} onClick={() => grab(r)}>
                      {grabbing === r.guid ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function BookPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const book = useApi<Book>(`/books/${id}`, { refetchInterval: 10_000 });
  const history = useApi<HistoryItem[]>(`/books/${id}/history`, { refetchInterval: 10_000 });
  const panels = useBookPanels();
  const [toast, showToast] = useToast();
  const [interactive, setInteractive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const auto = useApiMutation(() => api.post<{ grabbed: string | null }>(`/books/${id}/auto-search`), ['/books', '/queue']);
  const monitor = useApiMutation((monitored: boolean) => api.put(`/books/${id}`, { monitored }), ['/books']);
  const remove = useApiMutation(() => api.del(`/books/${id}`), ['/books']);

  if (book.isLoading) return <Spinner />;
  if (!book.data) return <PageContent><ErrorBox error={book.error ?? 'Book not found'} /></PageContent>;
  const b = book.data;

  return (
    <>
      <PageToolbar
        right={<ToolbarButton icon={Trash2} label="Delete" onClick={() => setConfirmDelete(true)} />}
      >
        <ToolbarButton
          icon={Search}
          label="Search"
          spinning={auto.isPending}
          onClick={() =>
            auto.mutate(undefined, {
              onSuccess: (r) => showToast(r.grabbed ? `Grabbed ${r.grabbed}` : 'No acceptable release found — try interactive search', r.grabbed ? 'success' : 'info'),
              onError: (e) => showToast(e.message, 'danger'),
            })
          }
        />
        <ToolbarButton icon={UserSearch} label="Interactive" active={interactive} onClick={() => setInteractive(!interactive)} />
        <ToolbarSeparator />
        <ToolbarButton icon={b.monitored ? Bookmark : BookmarkX} label={b.monitored ? 'Monitored' : 'Unmonitored'} onClick={() => monitor.mutate(!b.monitored)} />
        <ToolbarButton icon={RefreshCw} label="Refresh" spinning={book.isFetching} onClick={() => { book.refetch(); history.refetch(); }} />
      </PageToolbar>

      <div className="book-hero">
        {b.coverUrl && <div className="book-hero-bg" style={{ backgroundImage: `url(${b.coverUrl})` }} />}
        <div className="book-hero-inner">
          <Cover src={b.coverUrl} title={b.title} author={b.author} />
          <div>
            <h1>{b.title}</h1>
            <div className="author">{b.author}</div>
            <div className="book-meta">
              <Badge tone={statusTone(b)}>{statusLabel(b)}</Badge>
              <Badge><MediaIcon type={b.mediaType} /> {b.mediaType}</Badge>
              {b.year && <Badge>{b.year}</Badge>}
              {b.language && <Badge>{b.language}</Badge>}
              {b.series && <Badge tone="accent">{b.series}{b.seriesIndex != null ? ` #${b.seriesIndex}` : ''}</Badge>}
              {b.metadataSource === 'openlibrary' && (
                <a href={`https://openlibrary.org${b.foreignId}`} target="_blank" rel="noreferrer">
                  <Badge tone="info">Open Library <ExternalLink size={10} /></Badge>
                </a>
              )}
            </div>
            {b.description && <p className="book-description">{b.description}</p>}
            {b.path && <div className="muted" style={{ marginTop: 14, fontSize: 12 }}>📁 {b.path}</div>}
          </div>
        </div>
      </div>

      <PageContent>
        {interactive && (
          <Section title="Interactive search">
            <InteractiveSearch
              book={b}
              onGrabbed={(t) => {
                showToast(`Sent to download client: ${t}`, 'success');
                book.refetch();
                history.refetch();
              }}
            />
          </Section>
        )}

        {b.files && b.files.length > 0 && (
          <Section title="Files">
            <ul className="file-list">
              {b.files.map((f) => (
                <li key={f}>{f.replace(`${b.path}/`, '')}</li>
              ))}
            </ul>
          </Section>
        )}

        {panels.map((p) => (
          <Section key={p.id} title={p.title}>
            <p.component book={b} />
          </Section>
        ))}

        <Section title="History">
          {history.data?.length ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {history.data.map((h) => (
                    <tr key={h.id}>
                      <td style={{ width: 110 }}>
                        <Badge tone={h.event === 'imported' ? 'success' : h.event === 'failed' ? 'danger' : h.event === 'grabbed' ? 'info' : 'default'}>{h.event}</Badge>
                      </td>
                      <td className="title-cell">{h.title}</td>
                      <td className="muted">{h.data ? Object.entries(h.data).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''}</td>
                      <td className="num muted" title={new Date(h.date).toLocaleString()}>{relativeTime(h.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No history yet.</p>
          )}
        </Section>
      </PageContent>

      {confirmDelete && (
        <Modal
          size="sm"
          title="Delete book"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <div className="spacer" />
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button kind="danger" loading={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => navigate('/') })}>
                Delete
              </Button>
            </>
          }
        >
          Remove <b>{b.title}</b> ({b.mediaType}) from Inkarr? Files on disk are left untouched.
        </Modal>
      )}
      {toast}
    </>
  );
}
