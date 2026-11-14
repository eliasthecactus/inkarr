import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookPlus, Check, Search } from 'lucide-react';
import { api, Badge, Button, Cover, EmptyState, ErrorBox, MediaIcon, Modal, PageContent, Spinner, useApi, useApiMutation } from '@inkarr/web-sdk';

interface Result {
  foreignId: string;
  title: string;
  author: string;
  year?: number | null;
  coverUrl?: string | null;
  isbn?: string[];
  language?: string | null;
  pageCount?: number | null;
  source: string;
  sourceUrl?: string | null;
  inLibrary: { id: number; mediaType: string }[];
}

interface ProviderInfo {
  id: string;
  name: string;
  description?: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function AddModal({ result, onClose }: { result: Result; onClose: () => void }) {
  const settings = useApi<{ settings: { searchOnAdd: boolean } }>('/settings');
  const owned = new Set(result.inLibrary.map((i) => i.mediaType));
  const [types, setTypes] = useState<Set<string>>(new Set(owned.has('ebook') ? [] : ['ebook']));
  const [monitored, setMonitored] = useState(true);
  const [search, setSearch] = useState<boolean | null>(null);
  const [title, setTitle] = useState(result.title);
  const [author, setAuthor] = useState(result.author);
  const navigate = useNavigate();
  const add = useApiMutation(
    () => api.post('/books', { book: { ...result, title, author }, mediaTypes: [...types], monitored, search: search ?? settings.data?.settings.searchOnAdd ?? true }),
    ['/books', '/metadata', '/queue'],
  );
  const toggle = (t: string) => {
    const next = new Set(types);
    next.has(t) ? next.delete(t) : next.add(t);
    setTypes(next);
  };
  const doSearch = search ?? settings.data?.settings.searchOnAdd ?? true;

  return (
    <Modal
      title={title || result.title}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <Button kind="primary" icon={BookPlus} disabled={types.size === 0 || !title.trim() || !author.trim()} loading={add.isPending} onClick={() => add.mutate(undefined, { onSuccess: (rows: any[]) => (rows[0] ? navigate(`/book/${rows[0].id}`) : onClose()) })}>
            Add {types.size > 1 ? 'both' : ''}
          </Button>
        </>
      }
    >
      <ErrorBox error={add.error} />
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ width: 120, flexShrink: 0 }}>
          <Cover src={result.coverUrl} title={result.title} author={result.author} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="form-row" style={{ gridTemplateColumns: '140px 1fr' }}>
            <span className="form-label">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="form-row" style={{ gridTemplateColumns: '140px 1fr' }}>
            <span className="form-label">Author</span>
            <div>
              <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
              <div className="form-help">Fix typos from the metadata source here — Inkarr searches releases and names files with these.</div>
            </div>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: '140px 1fr' }}>
            <span className="form-label">Want as</span>
            <div className="checkbox-row">
              {(['ebook', 'audiobook'] as const).map((t) => (
                <label key={t}>
                  <input type="checkbox" checked={types.has(t)} disabled={owned.has(t)} onChange={() => toggle(t)} />
                  <MediaIcon type={t} /> {t === 'ebook' ? 'Ebook' : 'Audiobook'} {owned.has(t) && <Badge>in library</Badge>}
                </label>
              ))}
            </div>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: '140px 1fr' }}>
            <span className="form-label">Monitor</span>
            <label className="switch">
              <input type="checkbox" checked={monitored} onChange={(e) => setMonitored(e.target.checked)} />
              <span className="switch-slider" />
            </label>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: '140px 1fr' }}>
            <span className="form-label">Search now</span>
            <label className="switch">
              <input type="checkbox" checked={doSearch} onChange={(e) => setSearch(e.target.checked)} />
              <span className="switch-slider" />
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function AddBookPage() {
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term.trim(), 450);
  const meta = useApi<{ settings: { metadataProvider: string }; metadataProviders: ProviderInfo[] }>('/settings');
  const [provider, setProvider] = useState<string | null>(null);
  const activeProvider = provider ?? meta.data?.settings.metadataProvider ?? '';
  const results = useApi<Result[]>(
    debounced.length >= 2 && meta.data ? `/metadata/search?term=${encodeURIComponent(debounced)}&provider=${encodeURIComponent(activeProvider)}` : null,
    { staleTime: 60_000, retry: false },
  );
  const [adding, setAdding] = useState<Result | null>(null);

  return (
    <PageContent>
      <div className="section">
        <div style={{ position: 'relative', display: 'flex', gap: 10 }}>
          <Search size={20} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--text-muted)' }} />
          <input
            className="input input-lg"
            style={{ paddingLeft: 44 }}
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by title, author or ISBN — e.g. “Frankenstein Shelley” or 9780141439471"
          />
          {(meta.data?.metadataProviders.length ?? 0) > 1 && (
            <select className="input input-lg" style={{ width: 200, flexShrink: 0 }} value={activeProvider} onChange={(e) => setProvider(e.target.value)} title="Metadata source">
              {meta.data!.metadataProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {debounced && !results.isFetching && (
          <p className="muted" style={{ fontSize: 12, margin: '8px 2px 0' }}>
            Can’t find it or the title looks wrong? Try the ISBN, switch the metadata source, or fix the title when adding.
          </p>
        )}
        <ErrorBox error={results.error} />
        {results.isFetching && <Spinner />}
        {!results.isFetching && results.data?.length === 0 && <EmptyState title="No results">Try fewer words or an ISBN.</EmptyState>}
        {!debounced && (
          <EmptyState icon={BookPlus} title="Add a book">
            Search Open Library (or any metadata plugin) and pick an edition. You can want it as an ebook, an audiobook, or both.
          </EmptyState>
        )}
        <div className="search-results">
          {results.data?.map((r) => (
            <div key={r.foreignId} className="search-result">
              <Cover src={r.coverUrl?.replace('-L.jpg', '-M.jpg')} title={r.title} author={r.author} />
              <div>
                <div className="result-title">
                  {r.title} {r.year && <span className="muted">({r.year})</span>}
                </div>
                <div className="muted">{r.author}</div>
                <div className="result-meta">
                  {r.language && <Badge>{r.language}</Badge>}
                  {r.pageCount && <Badge>{r.pageCount} pages</Badge>}
                  {r.isbn?.[0] && <Badge>ISBN {r.isbn[0]}</Badge>}
                  {r.sourceUrl ? (
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                      <Badge tone="info">{r.source}</Badge>
                    </a>
                  ) : (
                    <Badge tone="info">{r.source}</Badge>
                  )}
                  {r.inLibrary.map((i) => (
                    <Link key={i.id} to={`/book/${i.id}`}>
                      <Badge tone="success">
                        <Check size={11} /> {i.mediaType} in library
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
              <Button kind="primary" icon={BookPlus} disabled={r.inLibrary.length >= 2} onClick={() => setAdding(r)}>
                Add
              </Button>
            </div>
          ))}
        </div>
      </div>
      {adding && <AddModal result={adding} onClose={() => setAdding(null)} />}
    </PageContent>
  );
}
