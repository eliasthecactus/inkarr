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
  inLibrary: { id: number; mediaType: string }[];
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
  const navigate = useNavigate();
  const add = useApiMutation(
    () => api.post('/books', { book: result, mediaTypes: [...types], monitored, search: search ?? settings.data?.settings.searchOnAdd ?? true }),
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
      title={`${result.title}`}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <Button kind="primary" icon={BookPlus} disabled={types.size === 0} loading={add.isPending} onClick={() => add.mutate(undefined, { onSuccess: (rows: any[]) => (rows[0] ? navigate(`/book/${rows[0].id}`) : onClose()) })}>
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
          <div className="muted">{result.author}{result.year ? ` · ${result.year}` : ''}</div>
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
  const results = useApi<Result[]>(debounced.length >= 2 ? `/metadata/search?term=${encodeURIComponent(debounced)}` : null, { staleTime: 60_000 });
  const [adding, setAdding] = useState<Result | null>(null);

  return (
    <PageContent>
      <div className="section">
        <div style={{ position: 'relative' }}>
          <Search size={20} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--text-muted)' }} />
          <input
            className="input input-lg"
            style={{ paddingLeft: 44 }}
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by title, author or ISBN — e.g. “Frankenstein Shelley” or 9780141439471"
          />
        </div>
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
                  <Badge tone="info">{r.source}</Badge>
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
